/**
 * routes/auth.ts
 *
 * POST /api/auth/editor  — secretary login: password → editor JWT
 * POST /api/auth/calc    — calculator-config login: password → calc JWT
 * POST /api/auth/lawyer  — lawyer login: Firebase ID token → lawyer JWT
 *                          (lawyers sign in via Firebase client SDK on the
 *                           Angular side, then exchange their ID token here
 *                           for a short-lived API JWT)
 */
import bcrypt from 'bcrypt';
import * as admin from 'firebase-admin';
import { config } from '../config';
import { calcLoginSchema, editorLoginSchema, fricLowensteinLoginSchema } from '@schema';
import { signCalcToken, signEditorToken, signLawyerToken } from '../plugins/auth';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export async function authRoutes(fastify: FastifyInstance): Promise<void> {

  // ── POST /api/auth/editor ───────────────────────────────────────────────────
  //    Body: { password: string }
  //    Returns: { token: string }
  //    Rate-limited hard: 10 attempts per 15 min per IP
  fastify.post(
    '/editor',
    {
      schema: editorLoginSchema,
      config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    },
    async (
      req:   FastifyRequest<{ Body: { password: string } }>,
      reply: FastifyReply,
    ) => {
      const match = await bcrypt.compare(
        req.body.password,
        config.auth.editorPasswordHash,
      );

      if (!match) {
        // Uniform 401 — don't leak whether the account exists
        return reply.status(401).send({ error: 'Invalid credentials.' });
      }

      const token = signEditorToken();
      return reply.status(200).send({ token });
    },
  );

  // ── POST /api/auth/calc ───────────────────────────────────────────────────
  //    Body: { password: string }
  //    Returns: { token: string }
  //    Rate-limited hard: 10 attempts per 15 min per IP
  fastify.post(
    '/calc',
    {
      schema: calcLoginSchema,
      config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    },
    async (
      req:   FastifyRequest<{ Body: { password: string } }>,
      reply: FastifyReply,
    ) => {
      if (!config.auth.calcPasswordHash) {
        req.log.error('Calculator config password hash is not configured');
        return reply.status(500).send({ error: 'Calculator config login is not configured.' });
      }

      const match = await bcrypt.compare(
        req.body.password,
        config.auth.calcPasswordHash,
      );

      if (!match) {
        return reply.status(401).send({ error: 'Invalid credentials.' });
      }

      const token = signCalcToken();
      return reply.status(200).send({ token });
    },
  );

  // ── POST /api/auth/lawyer ───────────────────────────────────────────────────
  //    Body: { idToken: string }   ← Firebase ID token from client SDK
  //    Returns: { token: string }  ← signed API JWT
  //
  //    Why the extra step? The Angular calendar uses an API JWT (not the Firebase
  //    ID token directly) for all subsequent calendar requests. This centralises
  //    auth checks in the Fastify verifyLawyer decorator and avoids shipping the
  //    Firebase Admin SDK validation logic into every route.
  fastify.post(
    '/lawyer',
    {
      schema: {
        body: {
          type: 'object',
          required: ['idToken'],
          additionalProperties: false,
          properties: { idToken: { type: 'string', minLength: 1 } },
        },
      },
      config: { rateLimit: { max: 20, timeWindow: '5 minutes' } },
    },
    async (
      req:   FastifyRequest<{ Body: { idToken: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const decoded = await admin.auth().verifyIdToken(req.body.idToken);

        // Optional: restrict to a specific Firebase project domain
        // if (!decoded.email?.endsWith('@friclowenstein.com')) {
        //   return reply.status(403).send({ error: 'Unauthorised email domain.' });
        // }

        const token = signLawyerToken(decoded.uid, decoded.email);
        return reply.status(200).send({ token });
      } catch (err) {
        req.log.warn({ err }, 'Lawyer ID token verification failed');
        return reply.status(401).send({ error: 'Invalid or expired Firebase token.' });
      }
    },
  );

  // ── POST /api/auth/lawyer/password ─────────────────────────────────────────
  //    Alternate lawyer login via username + password stored in Firebase RTDB.
  //    Body: { username: string; password: string }
  //    Returns: { token: string }
  fastify.post(
    '/lawyer/password',
    {
      schema: fricLowensteinLoginSchema,
      config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    },
    async (
      req:   FastifyRequest<{ Body: { username: string; password: string } }>,
      reply: FastifyReply,
    ) => {
      const { username, password } = req.body;

      try {
        const snap = await admin
          .database()
          .ref(`/lawyers/${username}`)
          .once('value');

        if (!snap.exists()) {
          return reply.status(401).send({ error: 'Invalid credentials.' });
        }

        const record = snap.val() as { passwordHash: string; uid: string; email?: string };
        const match  = await bcrypt.compare(password, record.passwordHash);

        if (!match) {
          return reply.status(401).send({ error: 'Invalid credentials.' });
        }

        const token = signLawyerToken(record.uid, record.email);
        return reply.status(200).send({ token });
      } catch (err) {
        req.log.error({ err }, 'Lawyer password login error');
        return reply.status(500).send({ error: 'Login failed. Please try again.' });
      }
    },
  );
}
