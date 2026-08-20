// server/src/routes/diagnostics.ts

import type {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
} from 'fastify';

import { Resend } from 'resend';
import { getApps } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

import { config } from '../config';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type DiagnosticStatus = 'ok' | 'warning' | 'error' | 'disabled';

interface DiagnosticCheck {
  status: DiagnosticStatus;
  message: string;
  durationMs?: number;
  details?: Record<string, unknown>;
}

interface DiagnosticSummary {
  ok: boolean;
  status: DiagnosticStatus;
  timestamp: string;
  checks: Record<string, DiagnosticCheck>;
}

interface EmailTestBody {
  recipient?: string;
}

interface EnvironmentVariableDiagnostic {
  name: string;
  configured: boolean;
  required: boolean;
  productionRequired: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const diagnosticsEnabled =
  process.env.DIAGNOSTICS_ENABLED === 'true' ||
  process.env.NODE_ENV !== 'production';

const diagnosticsToken = process.env.DIAGNOSTICS_TOKEN ?? '';

const emailTestEnabled =
  process.env.DIAGNOSTICS_EMAIL_TEST_ENABLED === 'true';

const firebaseWriteTestEnabled =
  process.env.DIAGNOSTICS_FIREBASE_WRITE_TEST_ENABLED === 'true';

const startedAt = Date.now();

// ─────────────────────────────────────────────────────────────────────────────
// Utility functions
// ─────────────────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

function elapsedMs(start: number): number {
  return Number((performance.now() - start).toFixed(2));
}

function booleanEnvironmentValue(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function normalizeBearerToken(
  authorization: string | undefined,
): string | null {
  if (!authorization) {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);

  return match?.[1]?.trim() || null;
}

function constantTimeEquals(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return difference === 0;
}

function overallStatus(
  checks: Record<string, DiagnosticCheck>,
): DiagnosticStatus {
  const values = Object.values(checks);

  if (values.some(check => check.status === 'error')) {
    return 'error';
  }

  if (values.some(check => check.status === 'warning')) {
    return 'warning';
  }

  if (
    values.length > 0 &&
    values.every(check => check.status === 'disabled')
  ) {
    return 'disabled';
  }

  return 'ok';
}

function sanitizeRoutes(routes: string): string[] {
  return routes
    .split('\n')
    .map(route => route.trimEnd())
    .filter(Boolean)
    .filter(route => !route.includes('/api/diagnostics/token'));
}

function safeHost(request: FastifyRequest): string | null {
  return request.headers.host ?? null;
}

function requestIp(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for'];

  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim() || request.ip;
  }

  if (Array.isArray(forwarded)) {
    return forwarded[0]?.split(',')[0]?.trim() || request.ip;
  }

  return request.ip;
}

// ─────────────────────────────────────────────────────────────────────────────
// Authentication guard
// ─────────────────────────────────────────────────────────────────────────────

async function requireDiagnosticsAccess(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!diagnosticsEnabled) {
    await reply.code(404).send({
      ok: false,
      error: 'Not found',
    });

    return;
  }

  if (!diagnosticsToken) {
    request.log.error(
      'DIAGNOSTICS_ENABLED is true but DIAGNOSTICS_TOKEN is missing',
    );

    await reply.code(503).send({
      ok: false,
      error: 'Diagnostics are not configured',
    });

    return;
  }

  const bearerToken = normalizeBearerToken(
    request.headers.authorization,
  );

  const headerToken =
    typeof request.headers['x-diagnostics-token'] === 'string'
      ? request.headers['x-diagnostics-token']
      : null;

  const providedToken = bearerToken || headerToken;

  if (
    !providedToken ||
    !constantTimeEquals(providedToken, diagnosticsToken)
  ) {
    await reply.code(401).send({
      ok: false,
      error: 'Unauthorized',
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual probes
// ─────────────────────────────────────────────────────────────────────────────

async function checkRuntime(): Promise<DiagnosticCheck> {
  return {
    status: 'ok',
    message: 'Node.js runtime is operational',
    details: {
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      pid: process.pid,
      uptimeSeconds: Number(process.uptime().toFixed(2)),
      appUptimeSeconds: Number(
        ((Date.now() - startedAt) / 1000).toFixed(2),
      ),
      memory: {
        rssMb: Number(
          (process.memoryUsage().rss / 1024 / 1024).toFixed(2),
        ),
        heapUsedMb: Number(
          (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2),
        ),
        heapTotalMb: Number(
          (process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2),
        ),
      },
    },
  };
}

async function checkEnvironment(): Promise<DiagnosticCheck> {
  const variables: EnvironmentVariableDiagnostic[] = [
    {
      name: 'NODE_ENV',
      configured: booleanEnvironmentValue('NODE_ENV'),
      required: false,
      productionRequired: false,
    },
    {
      name: 'RESEND_API_KEY',
      configured: booleanEnvironmentValue('RESEND_API_KEY'),
      required: true,
      productionRequired: true,
    },
    {
      name: 'EMAIL_FROM',
      configured:
        booleanEnvironmentValue('EMAIL_FROM') ||
        booleanEnvironmentValue('FROM_EMAIL_ADDRESS'),
      required: true,
      productionRequired: true,
    },
    {
      name: 'EMAIL_FROM_NAME',
      configured: booleanEnvironmentValue('EMAIL_FROM_NAME'),
      required: false,
      productionRequired: false,
    },
    {
      name: 'FIRM_EMAIL',
      configured: booleanEnvironmentValue('FIRM_EMAIL'),
      required: true,
      productionRequired: true,
    },
    {
      name: 'EMAIL_REPLY_TO',
      configured:
        booleanEnvironmentValue('EMAIL_REPLY_TO') ||
        booleanEnvironmentValue('REPLY_TO_EMAIL'),
      required: false,
      productionRequired: false,
    },
    {
      name: 'JWT_SECRET',
      configured: booleanEnvironmentValue('JWT_SECRET'),
      required: true,
      productionRequired: true,
    },
    {
      name: 'FIREBASE_DATABASE_URL',
      configured:
        booleanEnvironmentValue('FIREBASE_DATABASE_URL') ||
        booleanEnvironmentValue('FIREBASE_METADATA_DB'),
      required: true,
      productionRequired: true,
    },
    {
      name: 'FIREBASE_SERVICE_ACCOUNT_JSON',
      configured:
        booleanEnvironmentValue('FIREBASE_SERVICE_ACCOUNT_JSON') ||
        booleanEnvironmentValue('FIREBASE_SERVICE_ACCOUNT'),
      required: false,
      productionRequired: false,
    },
    {
      name: 'DIAGNOSTICS_TOKEN',
      configured: booleanEnvironmentValue('DIAGNOSTICS_TOKEN'),
      required: diagnosticsEnabled,
      productionRequired: diagnosticsEnabled,
    },
  ];

  const missing = variables.filter(variable => {
    if (config.isProd) {
      return variable.productionRequired && !variable.configured;
    }

    return variable.required && !variable.configured;
  });

  return {
    status: missing.length === 0 ? 'ok' : 'error',
    message:
      missing.length === 0
        ? 'Required environment variables are configured'
        : `${missing.length} required environment variable(s) are missing`,
    details: {
      environment: config.nodeEnv,
      variables,
      missing: missing.map(variable => variable.name),
      testRecipientConfigured: Boolean(
        config.email.testRecipient,
      ),
    },
  };
}

async function checkEmailConfiguration(): Promise<DiagnosticCheck> {
  const apiKeyPresent = Boolean(config.email.apiKey);
  const fromEmail = config.email.fromEmail ?? '';
  const firmEmail = config.email.firmEmail ?? '';
  const usesResendTestDomain = fromEmail.endsWith('@resend.dev');

  const problems: string[] = [];

  if (!apiKeyPresent) {
    problems.push('RESEND_API_KEY is missing');
  }

  if (!fromEmail) {
    problems.push('EMAIL_FROM is missing');
  }

  if (!firmEmail) {
    problems.push('FIRM_EMAIL is missing');
  }

  if (config.isProd && usesResendTestDomain) {
    problems.push(
      'Production is using the resend.dev test sender',
    );
  }

  if (config.isProd && config.email.testRecipient) {
    problems.push(
      'TEST_EMAIL_RECIPIENT is configured in production',
    );
  }

  return {
    status: problems.length === 0 ? 'ok' : 'error',
    message:
      problems.length === 0
        ? 'Email configuration is valid'
        : 'Email configuration has one or more problems',
    details: {
      apiKeyPresent,
      apiKeyFormatValid:
        apiKeyPresent && config.email.apiKey.startsWith('re_'),
      fromEmail,
      fromName: config.email.fromName,
      firmEmail,
      replyTo: config.email.replyTo || null,
      testRecipientConfigured: Boolean(
        config.email.testRecipient,
      ),
      usesResendTestDomain,
      problems,
    },
  };
}

async function checkFirebaseRead(): Promise<DiagnosticCheck> {
  const start = performance.now();

  try {
    const apps = getApps();

    if (apps.length === 0) {
      return {
        status: 'error',
        message: 'Firebase Admin has not been initialized',
        durationMs: elapsedMs(start),
      };
    }

    const database = getDatabase();

    const snapshot = await database
      .ref('.info/serverTimeOffset')
      .once('value');

    const offset = snapshot.val();

    return {
      status: 'ok',
      message: 'Firebase Realtime Database is reachable',
      durationMs: elapsedMs(start),
      details: {
        initializedApps: apps.length,
        serverTimeOffsetMs:
          typeof offset === 'number' ? offset : null,
        projectId: apps[0]?.options.projectId ?? null,
      },
    };
  } catch (error) {
    return {
      status: 'error',
      message: 'Firebase Realtime Database probe failed',
      durationMs: elapsedMs(start),
      details: {
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
    };
  }
}

async function checkFirebaseWrite(): Promise<DiagnosticCheck> {
  const start = performance.now();

  if (!firebaseWriteTestEnabled) {
    return {
      status: 'disabled',
      message:
        'Firebase write probe is disabled',
      durationMs: elapsedMs(start),
    };
  }

  const diagnosticId = crypto.randomUUID();

  const path = `/diagnostics/${diagnosticId}`;

  try {
    const ref = getDatabase().ref(path);

    const value = {
      createdAt: now(),
      source: 'api-diagnostics',
    };

    await ref.set(value);

    const snapshot = await ref.once('value');

    const storedValue = snapshot.val();

    await ref.remove();

    const matches =
      storedValue?.source === value.source &&
      storedValue?.createdAt === value.createdAt;

    return {
      status: matches ? 'ok' : 'error',
      message: matches
        ? 'Firebase write/read/delete probe succeeded'
        : 'Firebase write probe returned unexpected data',
      durationMs: elapsedMs(start),
      details: {
        path,
        cleanedUp: true,
      },
    };
  } catch (error) {
    try {
      await getDatabase().ref(path).remove();
    } catch {
      // Cleanup is best-effort.
    }

    return {
      status: 'error',
      message: 'Firebase write probe failed',
      durationMs: elapsedMs(start),
      details: {
        path,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
    };
  }
}

function checkAuthenticationConfiguration(): DiagnosticCheck {
  const checks = {
    jwtSecretConfigured:
      booleanEnvironmentValue('JWT_SECRET'),
    editorPasswordConfigured:
      booleanEnvironmentValue('EDITOR_PASSWORD') ||
      booleanEnvironmentValue('EDITOR_PASSWORD_HASH'),
    calculatorPasswordConfigured:
      booleanEnvironmentValue('CALC_PASSWORD') ||
      booleanEnvironmentValue('CALC_PASSWORD_HASH'),
    lawyerPasswordConfigured:
      booleanEnvironmentValue('LAWYER_PASSWORD') ||
      booleanEnvironmentValue('LAWYER_PASSWORD_HASH'),
  };

  const criticalMissing = !checks.jwtSecretConfigured;

  return {
    status: criticalMissing ? 'error' : 'ok',
    message: criticalMissing
      ? 'Authentication configuration is incomplete'
      : 'Core authentication configuration is present',
    details: checks,
  };
}

function checkCorsConfiguration(): DiagnosticCheck {
  const origins = config.cors.allowedOrigins ?? [];

  const problems: string[] = [];

  if (origins.length === 0) {
    problems.push('No allowed CORS origins are configured');
  }

  if (
    config.isProd &&
    origins.some(origin => origin.includes('localhost'))
  ) {
    problems.push(
      'A localhost origin is included in production CORS configuration',
    );
  }

  return {
    status: problems.length === 0 ? 'ok' : 'warning',
    message:
      problems.length === 0
        ? 'CORS configuration is present'
        : 'CORS configuration should be reviewed',
    details: {
      allowedOrigins: origins,
      credentialsEnabled: true,
      problems,
    },
  };
}

function checkRoutes(
  fastify: FastifyInstance,
): DiagnosticCheck {
  const routeTree = fastify.printRoutes({
    commonPrefix: false,
  });

  const routes = sanitizeRoutes(routeTree);

  const expectedPrefixes = [
    '/api/auth',
    '/api/content',
    '/api/blog',
    '/api/inquiries',
    '/api/profiles',
    '/api/calc-config',
    '/api/logs',
  ];

  const missingPrefixes = expectedPrefixes.filter(prefix =>
    !routeTree.includes(prefix),
  );

  return {
    status:
      missingPrefixes.length === 0 ? 'ok' : 'warning',
    message:
      missingPrefixes.length === 0
        ? 'Expected API route groups are registered'
        : 'One or more expected route groups are missing',
    details: {
      registeredRouteLines: routes.length,
      expectedPrefixes,
      missingPrefixes,
      routeTree: routes,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Diagnostics plugin
// ─────────────────────────────────────────────────────────────────────────────

export const diagnosticsRoutes: FastifyPluginAsync =
  async function diagnosticsRoutesPlugin(fastify) {
    /**
     * Public liveness check.
     *
     * This route deliberately reveals no configuration details.
     */
    fastify.get('/health', async () => {
      return {
        ok: true,
        timestamp: now(),
      };
    });

    /**
     * Public API liveness alias.
     */
    fastify.get('/api/health', async () => {
      return {
        ok: true,
        timestamp: now(),
      };
    });

    /**
     * All routes below this hook require the diagnostics token.
     */
    fastify.register(async protectedDiagnostics => {
      protectedDiagnostics.addHook(
        'onRequest',
        requireDiagnosticsAccess,
      );

      protectedDiagnostics.get(
        '/api/diagnostics',
        async (_request, reply) => {
          const checks: Record<string, DiagnosticCheck> = {
            runtime: await checkRuntime(),
            environment: await checkEnvironment(),
            email: await checkEmailConfiguration(),
            firebase: await checkFirebaseRead(),
            authentication:
              checkAuthenticationConfiguration(),
            cors: checkCorsConfiguration(),
            routes: checkRoutes(fastify),
          };

          const status = overallStatus(checks);

          const response: DiagnosticSummary = {
            ok: status !== 'error',
            status,
            timestamp: now(),
            checks,
          };

          return reply
            .code(status === 'error' ? 503 : 200)
            .send(response);
        },
      );

      protectedDiagnostics.get(
        '/api/diagnostics/runtime',
        async () => {
          return {
            ok: true,
            timestamp: now(),
            check: await checkRuntime(),
          };
        },
      );

      protectedDiagnostics.get(
        '/api/diagnostics/environment',
        async (_request, reply) => {
          const check = await checkEnvironment();

          return reply
            .code(check.status === 'error' ? 503 : 200)
            .send({
              ok: check.status !== 'error',
              timestamp: now(),
              check,
            });
        },
      );

      protectedDiagnostics.get(
        '/api/diagnostics/email',
        async (_request, reply) => {
          const check = await checkEmailConfiguration();

          return reply
            .code(check.status === 'error' ? 503 : 200)
            .send({
              ok: check.status !== 'error',
              timestamp: now(),
              check,
            });
        },
      );

      protectedDiagnostics.post<{
        Body: EmailTestBody;
      }>(
        '/api/diagnostics/email/send',
        {
          schema: {
            body: {
              type: 'object',
              additionalProperties: false,
              properties: {
                recipient: {
                  type: 'string',
                  format: 'email',
                },
              },
            },
          },
        },
        async (request, reply) => {
          if (!emailTestEnabled) {
            return reply.code(403).send({
              ok: false,
              error:
                'Diagnostic email sending is disabled',
            });
          }

          const recipient =
            request.body?.recipient ||
            config.email.testRecipient ||
            config.email.firmEmail;

          if (!recipient) {
            return reply.code(400).send({
              ok: false,
              error:
                'No diagnostic email recipient is configured',
            });
          }

          if (!config.email.apiKey) {
            return reply.code(503).send({
              ok: false,
              error: 'RESEND_API_KEY is missing',
            });
          }

          const start = performance.now();

          try {
            const resend = new Resend(
              config.email.apiKey,
            );

            const result = await resend.emails.send({
              from:
                `${config.email.fromName} ` +
                `<${config.email.fromEmail}>`,
              to: recipient,
              subject:
                `FL Legal API diagnostic — ${now()}`,
              text:
                'This is a diagnostic message from the ' +
                'FL Legal production API.',
              html: `
                <h1>FL Legal API diagnostic</h1>
                <p>The production API successfully called Resend.</p>
                <p>Timestamp: ${now()}</p>
              `,
              replyTo:
                config.email.replyTo || undefined,
            });

            if (result.error) {
              request.log.error(
                {
                  resendError: result.error,
                  durationMs: elapsedMs(start),
                },
                'Diagnostic email failed',
              );

              return reply.code(502).send({
                ok: false,
                timestamp: now(),
                durationMs: elapsedMs(start),
                error: {
                  name: result.error.name,
                  message: result.error.message,
                },
              });
            }

            return reply.send({
              ok: true,
              timestamp: now(),
              durationMs: elapsedMs(start),
              recipient,
              resendId: result.data?.id ?? null,
            });
          } catch (error) {
            request.log.error(
              {
                error,
                durationMs: elapsedMs(start),
              },
              'Unexpected diagnostic email error',
            );

            return reply.code(502).send({
              ok: false,
              timestamp: now(),
              durationMs: elapsedMs(start),
              error:
                error instanceof Error
                  ? error.message
                  : String(error),
            });
          }
        },
      );

      protectedDiagnostics.get(
        '/api/diagnostics/firebase',
        async (_request, reply) => {
          const check = await checkFirebaseRead();

          return reply
            .code(check.status === 'error' ? 503 : 200)
            .send({
              ok: check.status !== 'error',
              timestamp: now(),
              check,
            });
        },
      );

      protectedDiagnostics.post(
        '/api/diagnostics/firebase/write',
        async (_request, reply) => {
          const check = await checkFirebaseWrite();

          const statusCode =
            check.status === 'error'
              ? 503
              : check.status === 'disabled'
                ? 403
                : 200;

          return reply.code(statusCode).send({
            ok: check.status === 'ok',
            timestamp: now(),
            check,
          });
        },
      );

      protectedDiagnostics.get(
        '/api/diagnostics/auth',
        async (_request, reply) => {
          const check =
            checkAuthenticationConfiguration();

          return reply
            .code(check.status === 'error' ? 503 : 200)
            .send({
              ok: check.status !== 'error',
              timestamp: now(),
              check,
            });
        },
      );

      protectedDiagnostics.get(
        '/api/diagnostics/cors',
        async (_request, reply) => {
          const check = checkCorsConfiguration();

          return reply.send({
            ok: check.status !== 'error',
            timestamp: now(),
            check,
          });
        },
      );

      protectedDiagnostics.get(
        '/api/diagnostics/routes',
        async () => {
          return {
            ok: true,
            timestamp: now(),
            check: checkRoutes(fastify),
          };
        },
      );

      protectedDiagnostics.get(
        '/api/diagnostics/request',
        async request => {
          return {
            ok: true,
            timestamp: now(),
            request: {
              id: request.id,
              method: request.method,
              url: request.url,
              host: safeHost(request),
              protocol: request.protocol,
              ip: requestIp(request),
              userAgent:
                request.headers['user-agent'] ?? null,
              forwardedHost:
                request.headers['x-forwarded-host'] ??
                null,
              forwardedProto:
                request.headers['x-forwarded-proto'] ??
                null,
              vercel: {
                id:
                  request.headers['x-vercel-id'] ?? null,
                deploymentUrl:
                  process.env.VERCEL_URL ?? null,
                environment:
                  process.env.VERCEL_ENV ?? null,
                region:
                  process.env.VERCEL_REGION ?? null,
                gitCommitSha:
                  process.env.VERCEL_GIT_COMMIT_SHA ??
                  null,
              },
            },
          };
        },
      );
    });
  };

export default diagnosticsRoutes;