import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAnalysisRules1776300000000 implements MigrationInterface {
  name = 'AddAnalysisRules1776300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "analysis_rule_entity" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "name" character varying(80) NOT NULL, "type" character varying NOT NULL, "excludeScope" jsonb, "inflowScope" jsonb, "outflowScope" jsonb, "archivedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_analysis_rule_entity_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_analysis_rule_entity_user_archived" ON "analysis_rule_entity" ("userId", "archivedAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_analysis_rule_entity_user_archived"`,
    );
    await queryRunner.query(`DROP TABLE "analysis_rule_entity"`);
  }
}
