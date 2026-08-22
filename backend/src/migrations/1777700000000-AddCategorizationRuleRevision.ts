import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCategorizationRuleRevision1777700000000
  implements MigrationInterface
{
  name = 'AddCategorizationRuleRevision1777700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "categorization_rule_entity" ADD "revision" integer NOT NULL DEFAULT 1`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "categorization_rule_entity" DROP COLUMN "revision"`,
    );
  }
}
