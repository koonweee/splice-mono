import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration to create the exchange_rate_entity table for storing currency exchange rates.
 *
 * This table stores historical exchange rates with:
 * - Unique constraint on (baseCurrency, targetCurrency, rateDate) to prevent duplicates
 * - Indexes for efficient lookups by currency pair and date
 */
export class CreateExchangeRateEntity1733875200000
  implements MigrationInterface
{
  name = 'CreateExchangeRateEntity1733875200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create the exchange_rate_entity table
    await queryRunner.query(`
      CREATE TABLE "exchange_rate_entity" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "baseCurrency" character varying NOT NULL,
        "targetCurrency" character varying NOT NULL,
        "rate" numeric(20,10) NOT NULL,
        "rateDate" date NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_exchange_rate_entity" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_exchange_rate_base_target_date" UNIQUE ("baseCurrency", "targetCurrency", "rateDate")
      )
    `);

    // Create index on (baseCurrency, targetCurrency) for currency pair lookups
    await queryRunner.query(`
      CREATE INDEX "IDX_exchange_rate_currency_pair" ON "exchange_rate_entity" ("baseCurrency", "targetCurrency")
    `);

    // Create index on rateDate for date-based queries
    await queryRunner.query(`
      CREATE INDEX "IDX_exchange_rate_date" ON "exchange_rate_entity" ("rateDate")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes first
    await queryRunner.query(`DROP INDEX "IDX_exchange_rate_date"`);
    await queryRunner.query(`DROP INDEX "IDX_exchange_rate_currency_pair"`);

    // Drop the table
    await queryRunner.query(`DROP TABLE "exchange_rate_entity"`);
  }
}
