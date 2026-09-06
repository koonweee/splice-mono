import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { DataSource } from 'typeorm';

export const postgresSuite = process.env.BACKEND_BENCHMARK_DATABASE_URL
  ? describe
  : describe.skip;
export async function isolatedPostgres(
  prefix: string,
  beforeTimestamp?: number,
) {
  const url = new URL(
    process.env.BACKEND_BENCHMARK_DATABASE_URL ?? 'http://unconfigured.invalid',
  );
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.pathname !== '/splice_backend_benchmark' ||
    !/^[a-z_]+$/.test(prefix)
  ) {
    throw new Error(
      'Tests require a dedicated loopback splice_backend_benchmark database URL',
    );
  }
  const schema = `${prefix}_${randomUUID().replaceAll('-', '')}`;
  const queries: string[] = [];
  const database = new DataSource({
    type: 'postgres',
    url: url.href,
    schema,
    extra: { options: `-c search_path=${schema},public -c timezone=UTC` },
    entities: [path.join(__dirname, '../../src/**/*.entity.ts')],
    migrations: [path.join(__dirname, '../../src/migrations/*.ts')],
    synchronize: false,
    logging: ['query'],
    logger: {
      logQuery(query) {
        queries.push(query);
      },
      logQueryError() {},
      logQuerySlow() {},
      logMigration() {},
      logSchemaBuild() {},
      log() {},
    },
  });
  let created = false;
  async function close() {
    if (!database.isInitialized) return;
    try {
      if (created) await database.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await database.destroy();
    }
  }
  try {
    await database.initialize();
    await database.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    const all = [...database.migrations];
    if (beforeTimestamp)
      database.migrations.splice(
        0,
        database.migrations.length,
        ...all.filter(
          (migration) => Number(migration.name?.slice(-13)) < beforeTimestamp,
        ),
      );
    await database.runMigrations({ transaction: 'all' });
    database.migrations.splice(0, database.migrations.length, ...all);
    return { database, queries, schema, close };
  } catch (error) {
    await close();
    throw error;
  }
}
