import { AppDataSource } from './data-source';

const LOCK_ID = 123456; // Arbitrary unique ID for migration lock

async function runMigrations() {
  await AppDataSource.initialize();

  const queryRunner = AppDataSource.createQueryRunner();

  try {
    // Acquire advisory lock - blocks if another process holds it
    console.log('Acquiring migration lock...');
    await queryRunner.query(`SELECT pg_advisory_lock(${LOCK_ID})`);
    console.log('Lock acquired, running migrations...');

    // Run migrations
    const migrations = await AppDataSource.runMigrations();

    if (migrations.length > 0) {
      console.log(`Executed ${migrations.length} migration(s):`);
      migrations.forEach((m) => console.log(`  - ${m.name}`));
    } else {
      console.log('No pending migrations.');
    }
  } finally {
    // Always release the lock
    await queryRunner.query(`SELECT pg_advisory_unlock(${LOCK_ID})`);
    console.log('Migration lock released.');
    await queryRunner.release();
    await AppDataSource.destroy();
  }
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
