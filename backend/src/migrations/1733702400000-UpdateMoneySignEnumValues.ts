import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration to update MoneySign enum values from 'credit'/'debit' to 'positive'/'negative'
 *
 * This migration updates all columns that store the MoneySign enum value:
 * - account_entity: availableBalanceSign, currentBalanceSign
 * - balance_snapshot_entity: availableBalanceSign, currentBalanceSign
 * - transaction_entity: amountSign
 */
export class UpdateMoneySignEnumValues1733702400000
  implements MigrationInterface
{
  name = 'UpdateMoneySignEnumValues1733702400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Update account_entity
    await queryRunner.query(`
      UPDATE account_entity
      SET "availableBalanceSign" = CASE
        WHEN "availableBalanceSign" = 'credit' THEN 'positive'
        WHEN "availableBalanceSign" = 'debit' THEN 'negative'
        ELSE "availableBalanceSign"
      END,
      "currentBalanceSign" = CASE
        WHEN "currentBalanceSign" = 'credit' THEN 'positive'
        WHEN "currentBalanceSign" = 'debit' THEN 'negative'
        ELSE "currentBalanceSign"
      END
    `);

    // Update balance_snapshot_entity
    await queryRunner.query(`
      UPDATE balance_snapshot_entity
      SET "availableBalanceSign" = CASE
        WHEN "availableBalanceSign" = 'credit' THEN 'positive'
        WHEN "availableBalanceSign" = 'debit' THEN 'negative'
        ELSE "availableBalanceSign"
      END,
      "currentBalanceSign" = CASE
        WHEN "currentBalanceSign" = 'credit' THEN 'positive'
        WHEN "currentBalanceSign" = 'debit' THEN 'negative'
        ELSE "currentBalanceSign"
      END
    `);

    // Update transaction_entity
    await queryRunner.query(`
      UPDATE transaction_entity
      SET "amountSign" = CASE
        WHEN "amountSign" = 'credit' THEN 'positive'
        WHEN "amountSign" = 'debit' THEN 'negative'
        ELSE "amountSign"
      END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert account_entity
    await queryRunner.query(`
      UPDATE account_entity
      SET "availableBalanceSign" = CASE
        WHEN "availableBalanceSign" = 'positive' THEN 'credit'
        WHEN "availableBalanceSign" = 'negative' THEN 'debit'
        ELSE "availableBalanceSign"
      END,
      "currentBalanceSign" = CASE
        WHEN "currentBalanceSign" = 'positive' THEN 'credit'
        WHEN "currentBalanceSign" = 'negative' THEN 'debit'
        ELSE "currentBalanceSign"
      END
    `);

    // Revert balance_snapshot_entity
    await queryRunner.query(`
      UPDATE balance_snapshot_entity
      SET "availableBalanceSign" = CASE
        WHEN "availableBalanceSign" = 'positive' THEN 'credit'
        WHEN "availableBalanceSign" = 'negative' THEN 'debit'
        ELSE "availableBalanceSign"
      END,
      "currentBalanceSign" = CASE
        WHEN "currentBalanceSign" = 'positive' THEN 'credit'
        WHEN "currentBalanceSign" = 'negative' THEN 'debit'
        ELSE "currentBalanceSign"
      END
    `);

    // Revert transaction_entity
    await queryRunner.query(`
      UPDATE transaction_entity
      SET "amountSign" = CASE
        WHEN "amountSign" = 'positive' THEN 'credit'
        WHEN "amountSign" = 'negative' THEN 'debit'
        ELSE "amountSign"
      END
    `);
  }
}
