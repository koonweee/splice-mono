import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Discard cached heuristic results so the next check uses provider evidence. */
export class ClearInferredConnectionHealth1794564000000
  implements MigrationInterface
{
  name = 'ClearInferredConnectionHealth1794564000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE bank_link_entity
      SET health = NULL, "healthCheckedAt" = NULL, "healthCheckStartedAt" = NULL
      WHERE health->>'state' = 'delayed'
    `);
  }

  async down(): Promise<void> {
    // Cached diagnoses cannot be restored; the older service can recheck them.
  }
}
