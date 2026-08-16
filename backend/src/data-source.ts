import { types as pgTypes } from 'pg';
import { DataSource, DataSourceOptions } from 'typeorm';
import { parsePostgresUtcTimestamp } from './common/postgres-timestamp';

pgTypes.setTypeParser(1114, parsePostgresUtcTimestamp);

/**
 * Shared database configuration for app and migrations CLI.
 * Entities are auto-loaded from all *.entity.ts files.
 */
export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: parseInt(process.env.POSTGRES_PORT ?? '5432'),
  username: process.env.POSTGRES_USER ?? 'postgres',
  password: process.env.POSTGRES_PASSWORD ?? 'postgres',
  database: process.env.POSTGRES_DB ?? 'splice',
  extra: { options: '-c timezone=UTC' },
  // Auto-load all entity files
  entities: [__dirname + '/**/*.entity{.ts,.js}'],
  synchronize: false,
};

/**
 * DataSource for TypeORM CLI (migrations)
 * - synchronize: false - schema changes only via migrations
 * - migrationsRun: false - run migrations manually via CLI
 */
export const AppDataSource = new DataSource({
  ...dataSourceOptions,
  migrationsRun: false,
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
});
