import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCategorizationRuleRecommendations1777300000000
  implements MigrationInterface
{
  name = 'AddCategorizationRuleRecommendations1777300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "categorization_rule_suggestion_generation_entity" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "status" character varying NOT NULL, "model" character varying NOT NULL, "ignoredCategoryIds" jsonb NOT NULL DEFAULT '[]', "startedAt" TIMESTAMP WITH TIME ZONE, "completedAt" TIMESTAMP WITH TIME ZONE, "failedAt" TIMESTAMP WITH TIME ZONE, "errorMessage" text, CONSTRAINT "PK_categorization_rule_suggestion_generation_entity" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_categorization_rule_generation_user_status" ON "categorization_rule_suggestion_generation_entity" ("userId", "status", "createdAt")`,
    );
    await queryRunner.query(
      `ALTER TABLE "categorization_rule_suggestion_generation_entity" ADD CONSTRAINT "FK_categorization_rule_generation_user" FOREIGN KEY ("userId") REFERENCES "user_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "categorization_rule_suggestion_entity" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "generationId" uuid NOT NULL, "name" character varying(80) NOT NULL, "targetCategoryId" uuid NOT NULL, "priority" integer NOT NULL, "conditions" jsonb NOT NULL, "rationale" text NOT NULL, "status" character varying NOT NULL, "acceptedRuleId" uuid, "matched" integer NOT NULL, "updated" integer NOT NULL, "skippedManual" integer NOT NULL, "manualAgreement" integer NOT NULL, "manualConflicts" integer NOT NULL, "existingRuleOverlap" integer NOT NULL, "previewTransactions" jsonb NOT NULL, "generatedBy" character varying NOT NULL, "model" character varying NOT NULL, CONSTRAINT "PK_categorization_rule_suggestion_entity" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_categorization_rule_suggestion_user_status" ON "categorization_rule_suggestion_entity" ("userId", "status", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_categorization_rule_suggestion_generation" ON "categorization_rule_suggestion_entity" ("generationId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "categorization_rule_suggestion_entity" ADD CONSTRAINT "FK_categorization_rule_suggestion_user" FOREIGN KEY ("userId") REFERENCES "user_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "categorization_rule_suggestion_entity" ADD CONSTRAINT "FK_categorization_rule_suggestion_generation" FOREIGN KEY ("generationId") REFERENCES "categorization_rule_suggestion_generation_entity"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "categorization_rule_suggestion_entity" ADD CONSTRAINT "FK_categorization_rule_suggestion_target_category" FOREIGN KEY ("targetCategoryId") REFERENCES "category_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "categorization_rule_suggestion_entity" ADD CONSTRAINT "FK_categorization_rule_suggestion_accepted_rule" FOREIGN KEY ("acceptedRuleId") REFERENCES "categorization_rule_entity"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "categorization_rule_suggestion_entity" DROP CONSTRAINT "FK_categorization_rule_suggestion_accepted_rule"`,
    );
    await queryRunner.query(
      `ALTER TABLE "categorization_rule_suggestion_entity" DROP CONSTRAINT "FK_categorization_rule_suggestion_target_category"`,
    );
    await queryRunner.query(
      `ALTER TABLE "categorization_rule_suggestion_entity" DROP CONSTRAINT "FK_categorization_rule_suggestion_generation"`,
    );
    await queryRunner.query(
      `ALTER TABLE "categorization_rule_suggestion_entity" DROP CONSTRAINT "FK_categorization_rule_suggestion_user"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_categorization_rule_suggestion_generation"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_categorization_rule_suggestion_user_status"`,
    );
    await queryRunner.query(
      `DROP TABLE "categorization_rule_suggestion_entity"`,
    );

    await queryRunner.query(
      `ALTER TABLE "categorization_rule_suggestion_generation_entity" DROP CONSTRAINT "FK_categorization_rule_generation_user"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_categorization_rule_generation_user_status"`,
    );
    await queryRunner.query(
      `DROP TABLE "categorization_rule_suggestion_generation_entity"`,
    );
  }
}
