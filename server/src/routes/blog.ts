/**
 * routes/blog.ts
 *
 * GET    /api/blog        — list all posts sorted by date desc (public)
 * GET    /api/blog/:id    — single post by key (public)
 * POST   /api/blog        — create a post (editor JWT)
 * PATCH  /api/blog/:id    — update a post (editor JWT)
 * DELETE /api/blog/:id    — delete a post (editor JWT)
 *
 * ── Firebase schema (under public/blog/) ─────────────────────────────────────
 *
 *   post1: {
 *     author:    string
 *     category:  string          ← "Real Estate" | "Civil Litigation" | etc.
 *     content:   string          ← HTML body
 *     createdAt: string          ← ISO timestamp
 *     date:      string          ← YYYY-MM-DD display date
 *     excerpt:   string
 *     title:     string
 *   }
 *
 * Note: posts use human-readable keys (post1, post2…) set at import time,
 * and auto-generated push keys for posts created via the API.
 * The `id` field is injected by the API from the Firebase key — it is NOT
 * stored in the document itself.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { dbGet, dbPush, dbUpdate, dbRemove } from '../services/firebase';

const ROOT = 'blog';

// ── Types ─────────────────────────────────────────────────────────────────────
 
interface BlogPost {
  title:     string;
  date:      string;
  author:    string;
  category:  string;
  excerpt:   string;
  content:   string;
  imageUrl?: string;
  createdAt: string;
}
 
interface BlogPostWithId extends BlogPost {
  id: string;
}

// ── Validation schema ─────────────────────────────────────────────────────────
 
const postBodySchema = {
  type:                 'object',
  required:             ['title', 'date', 'content'],
  additionalProperties: false,
  properties: {
    title:     { type: 'string', minLength: 1, maxLength: 300  },
    date:      { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    author:    { type: 'string', maxLength: 100  },
    category:  { type: 'string', maxLength: 100  },
    excerpt:   { type: 'string', maxLength: 1000 },
    content:   { type: 'string', minLength: 1, maxLength: 500000 },
    imageUrl:  { type: 'string', maxLength: 512  },
  },
};

// ─────────────────────────────────────────────────────────────────────────────

export async function blogRoutes(fastify: FastifyInstance): Promise<void> {

 
  const editorGuard = [(fastify as any).verifyEditor];
 
  // ── GET /api/blog ──────────────────────────────────────────────────────────
  //    Returns all posts sorted by date descending.
  //    Each post gets an `id` field injected from its Firebase key.
  fastify.get(
    '/',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const raw = await dbGet<Record<string, BlogPost>>(ROOT);
        if (!raw) return reply.status(200).send([]);
 
        const posts: BlogPostWithId[] = Object.entries(raw)
          .map(([id, post]) => ({
            ...post,
            id,
            // Omit full content from list view for faster responses
            content: undefined as any,
          }))
          // Filter out any null/undefined entries from partial imports
          .filter(p => p.title)
          .sort((a, b) => b.date.localeCompare(a.date));
 
        reply.header('Cache-Control', 'public, max-age=30');
        return reply.status(200).send(posts);
      } catch (err) {
        req.log.error({ err }, 'Failed to fetch blog posts');
        return reply.status(500).send({ error: 'Could not load blog.' });
      }
    },
  );
 
  // ── GET /api/blog/:id ──────────────────────────────────────────────────────
  fastify.get(
    '/:id',
    {
      schema: {
        params: {
          type:       'object',
          required:   ['id'],
          properties: { id: { type: 'string', maxLength: 100 } },
        },
      },
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    },
    async (
      req:   FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = req.params;
      try {
        const post = await dbGet<BlogPost>(`${ROOT}/${id}`);
        if (!post || !post.title) {
          return reply.status(404).send({ error: 'Post not found.' });
        }
        reply.header('Cache-Control', 'public, max-age=30');
        return reply.status(200).send({ ...post, id });
      } catch (err) {
        req.log.error({ err, id }, 'Failed to fetch blog post');
        return reply.status(500).send({ error: 'Could not load post.' });
      }
    },
  );
 
  // ── POST /api/blog ─────────────────────────────────────────────────────────
  fastify.post(
    '/',
    {
      schema:     { body: postBodySchema },
      preHandler: editorGuard,
      config:     { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (
      req:   FastifyRequest<{ Body: Omit<BlogPost, 'createdAt'> }>,
      reply: FastifyReply,
    ) => {
      try {
        const post: BlogPost = {
          ...req.body,
          category:  req.body.category  ?? 'General',
          author:    req.body.author     ?? 'Fric, Lowenstein & Co. LLP',
          excerpt:   req.body.excerpt    ?? '',
          createdAt: new Date().toISOString(),
        };
        const id = await dbPush(ROOT, post);
        req.log.info({ id }, 'Blog post created');
        return reply.status(201).send({ id, ...post });
      } catch (err) {
        req.log.error({ err }, 'Failed to create blog post');
        return reply.status(500).send({ error: 'Could not create post.' });
      }
    },
  );
 
  // ── PATCH /api/blog/:id ────────────────────────────────────────────────────
  fastify.patch(
    '/:id',
    {
      schema: {
        params: {
          type: 'object', required: ['id'],
          properties: { id: { type: 'string', maxLength: 100 } },
        },
        body: { ...postBodySchema, required: [] },
      },
      preHandler: editorGuard,
      config:     { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (
      req:   FastifyRequest<{ Params: { id: string }; Body: Partial<BlogPost> }>,
      reply: FastifyReply,
    ) => {
      const { id } = req.params;
      try {
        const existing = await dbGet<BlogPost>(`${ROOT}/${id}`);
        if (!existing || !existing.title) {
          return reply.status(404).send({ error: 'Post not found.' });
        }
        await dbUpdate(`${ROOT}/${id}`, req.body as Record<string, unknown>);
        req.log.info({ id }, 'Blog post updated');
        return reply.status(204).send();
      } catch (err) {
        req.log.error({ err, id }, 'Failed to update blog post');
        return reply.status(500).send({ error: 'Could not update post.' });
      }
    },
  );
 
  // ── DELETE /api/blog/:id ───────────────────────────────────────────────────
  fastify.delete(
    '/:id',
    {
      schema: {
        params: {
          type: 'object', required: ['id'],
          properties: { id: { type: 'string', maxLength: 100 } },
        },
      },
      preHandler: editorGuard,
      config:     { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (
      req:   FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = req.params;
      try {
        const existing = await dbGet<BlogPost>(`${ROOT}/${id}`);
        if (!existing || !existing.title) {
          return reply.status(404).send({ error: 'Post not found.' });
        }
        await dbRemove(`${ROOT}/${id}`);
        req.log.info({ id }, 'Blog post deleted');
        return reply.status(204).send();
      } catch (err) {
        req.log.error({ err, id }, 'Failed to delete blog post');
        return reply.status(500).send({ error: 'Could not delete post.' });
      }
    },
  );
}
