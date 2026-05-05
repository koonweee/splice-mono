import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserDefinedCategories1775400000000
  implements MigrationInterface
{
  name = 'AddUserDefinedCategories1775400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "category_entity" ADD "normalizedPrimary" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "category_entity" ADD "normalizedDetailed" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "category_entity" ADD "source" character varying NOT NULL DEFAULT 'plaid'`,
    );
    await queryRunner.query(`ALTER TABLE "category_entity" ADD "userId" uuid`);
    await queryRunner.query(
      `ALTER TABLE "category_entity" ADD "archivedAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `UPDATE "category_entity"
       SET
         "normalizedPrimary" = lower(regexp_replace(regexp_replace(trim("primary"), '_+', ' ', 'g'), '\\s+', ' ', 'g')),
         "normalizedDetailed" = lower(
           regexp_replace(
             regexp_replace(
               CASE
                 WHEN "detailed" LIKE "primary" || '\\_%' THEN substring("detailed" from length("primary") + 2)
                 ELSE "detailed"
               END,
               '_+',
               ' ',
               'g'
             ),
             '\\s+',
             ' ',
             'g'
           )
         )`,
    );
    await queryRunner.query(
      `ALTER TABLE "category_entity" ALTER COLUMN "normalizedPrimary" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "category_entity" ALTER COLUMN "normalizedDetailed" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "category_entity" DROP CONSTRAINT "UQ_category_primary_detailed"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_category_plaid_normalized_pair" ON "category_entity" ("normalizedPrimary", "normalizedDetailed") WHERE "source" = 'plaid' AND "archivedAt" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_category_user_normalized_pair" ON "category_entity" ("userId", "normalizedPrimary", "normalizedDetailed") WHERE "source" = 'user' AND "archivedAt" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_category_user_normalized_pair"`);
    await queryRunner.query(`DROP INDEX "UQ_category_plaid_normalized_pair"`);
    await queryRunner.query(
      `UPDATE "transaction_entity"
       SET "userCategoryId" = NULL, "userCategoryUpdatedAt" = NULL
       WHERE "userCategoryId" IN (
         SELECT "id" FROM "category_entity" WHERE "source" = 'user'
       )`,
    );
    await queryRunner.query(
      `DELETE FROM "category_entity" WHERE "source" = 'user'`,
    );
    await queryRunner.query(
      `ALTER TABLE "category_entity" ADD CONSTRAINT "UQ_category_primary_detailed" UNIQUE ("primary", "detailed")`,
    );
    await queryRunner.query(
      `ALTER TABLE "category_entity" DROP COLUMN "archivedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "category_entity" DROP COLUMN "userId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "category_entity" DROP COLUMN "source"`,
    );
    await queryRunner.query(
      `ALTER TABLE "category_entity" DROP COLUMN "normalizedDetailed"`,
    );
    await queryRunner.query(
      `ALTER TABLE "category_entity" DROP COLUMN "normalizedPrimary"`,
    );
  }
}
