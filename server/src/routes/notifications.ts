// api/routes/notifications.ts
//
// Routes:
//   GET    /api/notifications           — public
//   GET    /api/notifications/admin     — editor-auth
//   POST   /api/notifications           — editor-auth
//   PATCH  /api/notifications/:id       — editor-auth
//   DELETE /api/notifications/:id       — editor-auth
//   GET    /api/notifications/reads     — lawyer-auth | editor-auth
//   POST   /api/notifications/:id/read  — lawyer-auth | editor-auth

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getDatabase } from 'firebase-admin/database';
import { randomUUID } from 'crypto';                       // ← replaces uuid
import type { LawyerTokenPayload, EditorTokenPayload } from '../plugins/auth';

// ── Types ──────────────────────────────────────────────────────────────────

type NotificationType   = 'feature' | 'info' | 'warning';
type NotificationAudience = 'all' | 'lawyers' | 'editors';
type NotificationStatus = 'active' | 'archived';

interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: NotificationType;
  audience: NotificationAudience;
  status: NotificationStatus;
  cta?: { label: string; url: string };
  createdAt: string;
  expiresAt?: string;
  authorId?: string;
}

// Route generic for /:id param routes
interface IdParams { Params: { id: string } }

// Fastify decorates the request with the decoded payload after verifyEditor/verifyLawyer.
// Extend the type so TypeScript knows about it without @ts-expect-error.
declare module 'fastify' {
  interface FastifyRequest {
    lawyerPayload?: LawyerTokenPayload;
    editorPayload?: EditorTokenPayload;
  }
}

// ── Plugin ─────────────────────────────────────────────────────────────────

export async function notificationsRoutes(app: FastifyInstance): Promise<void> {
  const db       = getDatabase();
  const ref      = db.ref('notifications');
  const readsRef = db.ref('notificationReads');

  // ── GET /api/notifications (public) ──────────────────────────────────────

  app.get('/api/notifications', async (_req, reply) => {
    const snapshot = await ref.orderByChild('status').equalTo('active').once('value');
    const raw: Record<string, AppNotification> = snapshot.val() ?? {};

    const now = new Date();
    const notifications = Object.values(raw).filter(
      (n) => !(n.expiresAt && new Date(n.expiresAt) < now)
    );

    return reply.send(notifications);
  });

  // ── GET /api/notifications/admin (editor-auth) ────────────────────────────
  // Must be registered BEFORE /:id routes so Fastify matches it first.

  app.get(
    '/api/notifications/admin',
    { preHandler: [app.verifyEditor] },
    async (_req, reply) => {
      const snapshot = await ref.once('value');
      const raw: Record<string, AppNotification> = snapshot.val() ?? {};
      const notifications = Object.values(raw).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      return reply.send(notifications);
    }
  );

  // ── GET /api/notifications/reads (lawyer-auth | editor-auth) ─────────────
  // Also registered before /:id to avoid being swallowed by the param route.

  app.get(
    '/api/notifications/reads',
    { preHandler: [verifyLawyerOrEditor(app)] },
    async (req, reply) => {
      const uid = resolveUid(req);
      if (!uid) return reply.status(401).send({ error: 'Unauthorized' });

      const snap = await readsRef.child(uid).once('value');
      return reply.send(snap.val() ?? {});
    }
  );

  // ── POST /api/notifications (editor-auth) ─────────────────────────────────

  app.post(
    '/api/notifications',
    { preHandler: [app.verifyEditor] },
    async (req, reply) => {
      const body = req.body as Partial<AppNotification>;

      if (!body.title?.trim() || !body.body?.trim()) {
        return reply.status(400).send({ error: 'title and body are required' });
      }
      if (!['feature', 'info', 'warning'].includes(body.type ?? '')) {
        return reply.status(400).send({ error: 'invalid type' });
      }
      if (!['all', 'lawyers', 'editors'].includes(body.audience ?? '')) {
        return reply.status(400).send({ error: 'invalid audience' });
      }

      const id = `notif-${randomUUID().slice(0, 8)}`;        // ← crypto.randomUUID
      const notification: AppNotification = {
        id,
        title:    body.title.trim(),
        body:     body.body.trim(),
        type:     (body.type as NotificationType) ?? 'info',
        audience: (body.audience as NotificationAudience) ?? 'all',
        status:   'active',
        createdAt: new Date().toISOString(),
        ...(body.cta?.label && body.cta?.url ? { cta: body.cta } : {}),
        ...(body.expiresAt ? { expiresAt: body.expiresAt } : {}),
        ...(req.editorPayload?.id ? { authorId: req.editorPayload.id } : {}),
      };

      await ref.child(id).set(notification);
      return reply.status(201).send(notification);
    }
  );

  // ── PATCH /api/notifications/:id (editor-auth) ────────────────────────────

  app.patch<IdParams>(                                       // ← generic on route
    '/api/notifications/:id',
    { preHandler: [app.verifyEditor] },
    async (req, reply) => {
      const { id } = req.params;
      const body = req.body as Partial<Pick<AppNotification, 'status' | 'expiresAt'>>;

      const snap = await ref.child(id).once('value');
      if (!snap.exists()) {
        return reply.status(404).send({ error: 'Notification not found' });
      }

      const allowed: Partial<AppNotification> = {};
      if (body.status && ['active', 'archived'].includes(body.status)) {
        allowed.status = body.status;
      }
      if (body.expiresAt) {
        allowed.expiresAt = body.expiresAt;
      }

      await ref.child(id).update(allowed);
      return reply.send({ ok: true });
    }
  );

  // ── DELETE /api/notifications/:id (editor-auth) ───────────────────────────

  app.delete<IdParams>(                                      // ← generic on route
    '/api/notifications/:id',
    { preHandler: [app.verifyEditor] },
    async (req, reply) => {
      const { id } = req.params;
      await ref.child(id).remove();
      return reply.send({ ok: true });
    }
  );

  // ── POST /api/notifications/:id/read (lawyer-auth | editor-auth) ──────────

  app.post<IdParams>(                                        // ← generic on route
    '/api/notifications/:id/read',
    { preHandler: [verifyLawyerOrEditor(app)] },
    async (req, reply) => {
      const uid = resolveUid(req);
      if (!uid) return reply.status(401).send({ error: 'Unauthorized' });

      await readsRef.child(uid).child(req.params.id).set({
        readAt: new Date().toISOString(),
        uid,
      });

      return reply.send({ ok: true });
    }
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function verifyLawyerOrEditor(app: FastifyInstance) {
  return async function (req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Authentication required.' });
    }

    let lawyerPassed = false;

    try {
      await app.verifyLawyer(req, reply);
      lawyerPassed = req.lawyerPayload !== undefined;
    } catch {
      // verifyLawyer threw — not a lawyer token
    }

    if (lawyerPassed) return;

    await app.verifyEditor(req, reply);
  };
}

function resolveUid(req: FastifyRequest): string | null {
  if (req.lawyerPayload?.uid)  return req.lawyerPayload.uid;
  if (req.editorPayload?.id)   return req.editorPayload.id;
  if (req.editorPayload)       return 'editor';
  return null;
}