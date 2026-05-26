import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCategorizationRules1777200000000 implements MigrationInterface {
  name = 'AddCategorizationRules1777200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "categorization_rule_entity" ("createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "name" character varying(80) NOT NULL, "priority" integer NOT NULL, "targetCategoryId" uuid NOT NULL, "conditions" jsonb NOT NULL, "archivedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_categorization_rule_entity" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_categorization_rule_user_active_priority" ON "categorization_rule_entity" ("userId", "archivedAt", "priority", "createdAt", "id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "categorization_rule_entity" ADD CONSTRAINT "FK_categorization_rule_target_category" FOREIGN KEY ("targetCategoryId") REFERENCES "category_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "categorization_rule_entity" ADD CONSTRAINT "FK_categorization_rule_user" FOREIGN KEY ("userId") REFERENCES "user_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "banking_transaction_entity" ADD CONSTRAINT "FK_banking_transaction_category_assignment_rule" FOREIGN KEY ("categoryAssignmentRuleId") REFERENCES "categorization_rule_entity"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "banking_transaction_entity" DROP CONSTRAINT "FK_banking_transaction_category_assignment_rule"`,
    );
    await queryRunner.query(
      `ALTER TABLE "categorization_rule_entity" DROP CONSTRAINT "FK_categorization_rule_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "categorization_rule_entity" DROP CONSTRAINT "FK_categorization_rule_target_category"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_categorization_rule_user_active_priority"`,
    );
    await queryRunner.query(`DROP TABLE "categorization_rule_entity"`);
  }
}
