import * as dotenv from 'dotenv';
dotenv.config();

export const need = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

// ── Environment tier ──────────────────────────────────────────────────────────
const nodeEnv = optional('NODE_ENV', 'development');
const isDev = nodeEnv === 'development';
const isStage = nodeEnv === 'staging';
const isProd = nodeEnv === 'production';
// for serverless function config
const maxDuration = 15;

// ── CORS origin — stage-switched, matches your old Express pattern ────────────
//    local   → https://localhost:4200
//    staging → http://localhost:4200   (or override via ALLOWED_ORIGINS)
//    prod    → https://fl-legal.ca     (or override via ALLOWED_ORIGINS)
const defaultOrigins = isDev ? 'https://localhost:4422' : isStage ? 'https://staging.fl-legal.ca' : 'https://fl-legal.ca';

// Default TLS cert/key paths based on environment tier.
// Can always be overridden via TLS_CERT / TLS_KEY env vars.
const defaultCert = isDev ? 'cert/local/localhost.crt' : isStage ? 'cert/stage/staging.cert' : ''; // production: provide TLS_CERT explicitly

const defaultKey = isDev ? 'cert/local/localhost.decrypted.key' : isStage ? 'cert/stage/staging.key' : ''; // production: provide TLS_KEY explicitly

export const config = {
  port: parseInt(optional('PORT', '3000'), 10),
  host: optional('HOSTNAME', '0.0.0.0'),
  maxDuration,
  nodeEnv,
  isDev,
  isStage,
  isProd,

  // ── TLS ───────────────────────────────────────────────────────────────────
  // Set HTTPS=false to run plain HTTP (e.g. behind a TLS-terminating proxy).
  // SSLCHAIN and SSLPFX are optional — soft-fail if absent (mirrors tryLoad).
  https: {
    enabled: optional('HTTPS', 'true') === 'true',
    certFile: optional('TLS_CERT', defaultCert),
    keyFile: optional('TLS_KEY', defaultKey),
    chainFile: optional('SSLCHAIN'), // optional CA chain
    pfxFile: optional('SSLPFX'), // optional PFX bundle
  },

  // ── CORS ──────────────────────────────────────────────────────────────────
  cors: {
    allowedOrigins: optional('ALLOWED_ORIGINS', defaultOrigins)
      .split(',')
      .map((o: string) => o.trim())
      .filter(Boolean),
  },

  auth: {
    jwtSecret: need('JWT_SECRET'),
    calcPasswordHash: need('CALC_HASH'),
    editorPasswordHash: need('EDITOR_HASH'),
    adminPasswordHash: need('ADMIN_HASH'),
    lawyerTokenExpiry: optional('LAWYER_TOKEN_EXPIRY', '8h'),
    editorTokenExpiry: optional('EDITOR_TOKEN_EXPIRY', '4h'),
    calcTokenExpiry: optional('EDITOR_TOKEN_EXPIRY', '4h'),
  },

  firebase: {
    // ── Credential priority (first match wins) ──────────────────────────────
    //   1. FIREBASE_SERVICE_ACCOUNT_JSON — base64-encoded full service account
    //      JSON blob. Most reliable on Vercel: no newline handling edge cases.
    //      Generate: base64 -i friclowenstein-firebase-adminsdk.json | tr -d '\n'
    //      Set that output as the FIREBASE_SERVICE_ACCOUNT_JSON env var on Vercel.
    //   2. FIREBASE_SERVICE_ACCOUNT_PATH — path to a local JSON file (local dev).
    //   3. Three inline vars (projectId, clientEmail, privateKey) — fallback.
    serviceAccountJson: optional('FIREBASE_SERVICE_ACCOUNT_JSON'),
    serviceAccountPath: optional('FIREBASE_SERVICE_ACCOUNT_PATH'),
    projectId: optional('FIREBASE_PROJECT_ID'),
    clientEmail: optional('FIREBASE_CLIENT_EMAIL'),
    privateKey: optional('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
    databaseUrl: need('FIREBASE_DATABASE_URL'),
  },
 
  email: {
    apiKey:        need('RESEND_API_KEY'),
    fromEmail:     optional('EMAIL_FROM', 'no-reply@fl-legal.ca'),
    fromName:      optional('EMAIL_FROM_NAME', 'Fric, Lowenstein & Co. LLP'),
    firmEmail:     need('FIRM_EMAIL'),
    replyTo:       optional('EMAIL_REPLY_TO', 'friclow@gmail.com'),
    testRecipient: optional('TEST_EMAIL_RECIPIENT'),
  },
  
 
/**
 * ── .env additions (per environment) ──────────────────────────────────────
 *
 * Production (Vercel → fl-legal.ca):
 *   SENDGRID_API_KEY=SG.prod_key_here
 *   EMAIL_FROM=no-reply@fl-legal.ca
 *   FIRM_EMAIL=friclow@gmail.com
 *   EMAIL_SANDBOX=false
 *
 * Staging (Vercel → staging.fl-legal.ca):
 *   SENDGRID_API_KEY=SG.staging_key_here
 *   EMAIL_FROM=no-reply@fl-legal.ca
 *   FIRM_EMAIL=friclow@gmail.com
 *   EMAIL_SANDBOX=false
 *   TEST_EMAIL_RECIPIENT=michaelllowenstein@gmail.com
 *
 * Local dev (server/.env):
 *   SENDGRID_API_KEY=SG.dev_key_here
 *   EMAIL_FROM=no-reply@fl-legal.ca
 *   FIRM_EMAIL=friclow@gmail.com
 *   EMAIL_SANDBOX=true
 *   TEST_EMAIL_RECIPIENT=michaelllowenstein@gmail.com
 *
 * ── Remove these env vars (no longer used) ────────────────────────────────
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS
 *   SENDGRID_API_KEY (the old process.env direct read) — now goes through
 *   config.email.apiKey via the require() helper.
 */
} as const;

export type Config = typeof config;
