/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import pino from 'pino';
import { AppDataSource } from './data-source';

const LOCK_ID = 123456; // Arbitrary unique ID for migration lock

async function createLogger() {
  if (process.env.SEQ_SERVER_URL) {
    const pinoSeq = (await import('pino-seq')) as any;
    const createStream = pinoSeq.default?.createStream ?? pinoSeq.createStream;
    const stream = createStream({
      serverUrl: process.env.SEQ_SERVER_URL,
      apiKey: process.env.SEQ_API_KEY,
    });
    return pino(stream);
  }
  return pino({
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  });
}

async function runMigrations() {
  const logger = await createLogger();
  await AppDataSource.initialize();

  const queryRunner = AppDataSource.createQueryRunner();

  try {
    // Acquire advisory lock - blocks if another process holds it
    logger.info({}, 'Acquiring migration lock');
    await queryRunner.query(`SELECT pg_advisory_lock(${LOCK_ID})`);
    logger.info({}, 'Lock acquired, running migrations');

    // Run migrations
    const migrations = await AppDataSource.runMigrations();

    if (migrations.length > 0) {
      logger.info(
        { count: migrations.length, migrations: migrations.map((m) => m.name) },
        'Executed migrations',
      );
    } else {
      logger.info({}, 'No pending migrations');
    }
  } finally {
    // Always release the lock
    await queryRunner.query(`SELECT pg_advisory_unlock(${LOCK_ID})`);
    logger.info({}, 'Migration lock released');
    await queryRunner.release();
    await AppDataSource.destroy();
  }
}

runMigrations().catch(async (err) => {
  const logger = await createLogger();
  logger.error(
    { error: err instanceof Error ? err.message : String(err) },
    'Migration failed',
  );
  process.exit(1);
});
