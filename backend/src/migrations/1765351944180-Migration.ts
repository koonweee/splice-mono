import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1765351944180 implements MigrationInterface {
  name = 'Migration1765351944180';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_exchange_rate_currency_pair"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_exchange_rate_date"`);
    await queryRunner.query(
      `ALTER TABLE "exchange_rate_entity" DROP CONSTRAINT "UQ_exchange_rate_base_target_date"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_entity" ALTER COLUMN "settings" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_entity" ALTER COLUMN "settings" SET DEFAULT '{"currency":"USD","timezone":"UTC"}'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_86d785a51e45fbfb0f41182bee" ON "exchange_rate_entity" ("rateDate") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f5d928c18e89da66c21c2176a9" ON "exchange_rate_entity" ("baseCurrency", "targetCurrency") `,
    );
    await queryRunner.query(
      `ALTER TABLE "exchange_rate_entity" ADD CONSTRAINT "UQ_ea4425b568daa9977b88a783da7" UNIQUE ("baseCurrency", "targetCurrency", "rateDate")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "exchange_rate_entity" DROP CONSTRAINT "UQ_ea4425b568daa9977b88a783da7"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f5d928c18e89da66c21c2176a9"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_86d785a51e45fbfb0f41182bee"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_entity" ALTER COLUMN "settings" SET DEFAULT '{"currency": "USD"}'`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_entity" ALTER COLUMN "settings" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "exchange_rate_entity" ADD CONSTRAINT "UQ_exchange_rate_base_target_date" UNIQUE ("baseCurrency", "targetCurrency", "rateDate")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_exchange_rate_date" ON "exchange_rate_entity" ("rateDate") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_exchange_rate_currency_pair" ON "exchange_rate_entity" ("baseCurrency", "targetCurrency") `,
    );
  }
}
