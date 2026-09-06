import { MigrationInterface, QueryRunner } from 'typeorm';

export class CanonicalTransactionActivityDates1788644000000
  implements MigrationInterface
{
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE account_activity_entity activity
      SET "activityDate" = COALESCE(banking."reportingDateOverride", banking."authorizedDate", activity."providerDate")
      FROM banking_transaction_entity banking
      WHERE banking."activityId" = activity.id
        AND activity."activityDate" IS DISTINCT FROM COALESCE(banking."reportingDateOverride", banking."authorizedDate", activity."providerDate");
      CREATE FUNCTION splice_banking_activity_date() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        UPDATE account_activity_entity SET "activityDate" = COALESCE(NEW."reportingDateOverride", NEW."authorizedDate", "providerDate")
        WHERE id = NEW."activityId" AND "activityDate" IS DISTINCT FROM COALESCE(NEW."reportingDateOverride", NEW."authorizedDate", "providerDate");
        RETURN NEW;
      END $$;
      CREATE TRIGGER banking_activity_date AFTER INSERT OR UPDATE OF "reportingDateOverride", "authorizedDate", "activityId"
        ON banking_transaction_entity FOR EACH ROW EXECUTE FUNCTION splice_banking_activity_date();
      CREATE FUNCTION splice_activity_reporting_date() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE reporting_date date;
      BEGIN
        IF NEW."activityKind" = 'banking_transaction' THEN
          SELECT COALESCE("reportingDateOverride", "authorizedDate", NEW."providerDate") INTO reporting_date
          FROM banking_transaction_entity WHERE "activityId" = NEW.id;
          IF FOUND THEN NEW."activityDate" := reporting_date; END IF;
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER activity_reporting_date BEFORE UPDATE OF "providerDate", "activityDate"
        ON account_activity_entity FOR EACH ROW EXECUTE FUNCTION splice_activity_reporting_date();
    `);
    const rows = (await queryRunner.query(`
      SELECT EXISTS(SELECT 1 FROM banking_transaction_entity banking JOIN account_activity_entity activity ON activity.id = banking."activityId"
      WHERE activity."activityDate" IS DISTINCT FROM COALESCE(banking."reportingDateOverride", banking."authorizedDate", activity."providerDate")) AS mismatch
    `)) as Array<{ mismatch: boolean }>;
    const [{ mismatch }] = rows;
    if (mismatch)
      throw new Error(
        'Canonical activity-date backfill failed parity validation',
      );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER activity_reporting_date ON account_activity_entity;
      DROP FUNCTION splice_activity_reporting_date();
      DROP TRIGGER banking_activity_date ON banking_transaction_entity;
      DROP FUNCTION splice_banking_activity_date();
    `);
  }
}
