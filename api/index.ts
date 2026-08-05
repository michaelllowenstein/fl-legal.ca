/**

* api/index.ts — Vercel Function entrypoint
*
* This file delegates all Fastify construction, plugins, and routes to
* server/src/app.ts. It does not bind a port or load local TLS files.
  */

import type { VercelRequest, VercelResponse } from "@vercel/node";

import { buildServerlessApi } from "../server/src/app";

/**

* Cached for the lifetime of a warm Vercel Function instance.
*
* The first request builds and boots Fastify. Later requests reuse the
* same application instance.
  */
const appPromise = buildServerlessApi().then(async (app) => {
  await app.ready();
  return app;
});

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  try {
    const app = await appPromise;

    app.server.emit("request", req, res);
  } catch (error) {
    console.error("[api] Failed to handle request", error);

    if (!res.headersSent) {
      res.status(500).json({
        ok: false,
        error: "Internal server error",
      });
    }
  }
}
