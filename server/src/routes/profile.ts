/**
 * routes/profiles.ts
 *
 * GET  /api/profiles       — all profiles as an ordered array (public)
 * GET  /api/profiles/:id   — single profile by id (public)
 *
 * ── Firebase schema (under public/profiles/) ─────────────────────────────────
 *
 *   bill: {
 *     id:             "bill"
 *     name:           "William H. Fric, JD"
 *     image:          "fricv2.jpg"         ← filename only; client resolves full path
 *     education:      string
 *     callToBar:      string
 *     workExperience: string
 *     achievements:   string[]
 *     community:      string[]
 *     role:           string | null
 *   }
 *
 * The `image` field contains the filename only (e.g. "fricv2.jpg").
 * The Angular client resolves the full asset URL:
 *   assets/site/headshots/{profile.id}/{profile.image}
 *
 * The nav list at public/nav/members[] controls the display order.
 * This route uses that order when returning the full array.
 */
 
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { dbGet } from '../services/firebase';
 
interface ProfileNav {
  display: string;
  value:   string;
  order:   number;
}
 
interface Profile {
  id:              string;
  name:            string;
  image:           string;
  education:       string | null;
  callToBar:       string | null;
  workExperience:  string;
  achievements:    string[];
  community:       string[];
  role:            string | null;
}
 
// ─────────────────────────────────────────────────────────────────────────────
 
export async function profileRoutes(fastify: FastifyInstance): Promise<void> {
 
  // ── GET /api/profiles ──────────────────────────────────────────────────────
  //    Returns profiles sorted by the nav/members order array.
  fastify.get(
    '/',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const [profilesMap, navMembers] = await Promise.all([
          dbGet<Record<string, Profile>>('profiles'),
          dbGet<ProfileNav[]>('nav/members'),
        ]);
 
        if (!profilesMap) return reply.status(200).send([]);
 
        let profiles = Object.values(profilesMap).filter(p => p?.id);
 
        // Sort by nav order if available
        if (navMembers) {
          const orderMap = new Map(navMembers.map(m => [m.value, m.order]));
          profiles.sort((a, b) =>
            (orderMap.get(a.id) ?? 99) - (orderMap.get(b.id) ?? 99)
          );
        }
 
        reply.header('Cache-Control', 'public, max-age=60');
        return reply.status(200).send(profiles);
      } catch (err) {
        req.log.error({ err }, 'Failed to fetch profiles');
        return reply.status(500).send({ error: 'Could not load profiles.' });
      }
    },
  );
 
  // ── GET /api/profiles/:id ──────────────────────────────────────────────────
  fastify.get(
    '/:id',
    {
      schema: {
        params: {
          type:       'object',
          required:   ['id'],
          properties: { id: { type: 'string', maxLength: 40 } },
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
        const profile = await dbGet<Profile>(`profiles/${id}`);
        if (!profile || !profile.id) {
          return reply.status(404).send({ error: `Profile '${id}' not found.` });
        }
        reply.header('Cache-Control', 'public, max-age=60');
        return reply.status(200).send(profile);
      } catch (err) {
        req.log.error({ err, id }, 'Failed to fetch profile');
        return reply.status(500).send({ error: 'Could not load profile.' });
      }
    },
  );
}