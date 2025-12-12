import pino from 'pino';
import { AppDataSource } from './data-source';

// Create standalone pino logger for migration script (runs outside NestJS context)
const logger = pino({
  transport: process.env.SEQ_SERVER_URL
    ? {
        target: 'pino-seq',
        options: {
          serverUrl: process.env.SEQ_SERVER_URL,
          apiKey: process.env.SEQ_API_KEY,
        },
      }
    : {
        target: 'pino-pretty',
        options: { colorize: true },
      },
});

const LOCK_ID = 123456; // Arbitrary unique ID for migration lock

async function runMigrations() {
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

runMigrations().catch((err) => {
  logger.error(
    { error: err instanceof Error ? err.message : String(err) },
    'Migration failed',
  );
  process.exit(1);
});
