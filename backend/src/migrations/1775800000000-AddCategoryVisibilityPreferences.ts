import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCategoryVisibilityPreferences1775800000000
  implements MigrationInterface
{
  name = 'AddCategoryVisibilityPreferences1775800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "category_visibility_preference_entity" ("createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "categoryId" uuid NOT NULL, "hiddenAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_category_visibility_user_category" UNIQUE ("userId", "categoryId"), CONSTRAINT "PK_category_visibility_preference" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE "category_visibility_preference_entity"`,
    );
  }
}
