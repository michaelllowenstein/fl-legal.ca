// server/src/server.ts
import 'dotenv/config';

import { buildApi } from './app';

const port = Number(process.env.PORT ?? 8228);
const host = process.env.HOST ?? '127.0.0.1';

async function start(): Promise<void> {
  const app = await buildApi();

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    app.log.info({ signal }, 'Shutting down API');

    try {
      await app.close();
      process.exit(0);
    } catch (error) {
      app.log.error(error, 'API shutdown failed');
      process.exit(1);
    }
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ port, host });
    app.log.info(`Server listening at https://${host}:${port}`);
  } catch (error: unknown) {
    const nodeError = error as NodeJS.ErrnoException;

    if (nodeError.code === 'EADDRINUSE') {
      app.log.error({ host, port }, `Port ${port} is already in use. Run: lsof -nP -iTCP:${port} -sTCP:LISTEN`);
    } else {
      app.log.error(error);
    }

    process.exitCode = 1;
  }
}

void start();
