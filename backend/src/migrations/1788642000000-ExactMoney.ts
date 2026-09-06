import { MigrationInterface, QueryRunner } from 'typeorm';

const columns = [
  ['account_entity', 'currentBalanceAmount'],
  ['account_entity', 'availableBalanceAmount'],
  ['balance_snapshot_entity', 'currentBalanceAmount'],
  ['balance_snapshot_entity', 'availableBalanceAmount'],
  ['account_activity_entity', 'amountAmount'],
  ['recurring_manual_transaction_schedule_entity', 'amountAmount'],
] as const;

/** Convert database JSON before JavaScript can parse its numeric values. */
export class ExactMoney1788642000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    for (const [table, column] of columns) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE numeric(78,0) USING "${column}"::numeric`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD CONSTRAINT "CK_exact_${table}_${column}" CHECK ("${column}" >= 0)`,
      );
    }
    await this.transformJson(queryRunner, true);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Refuse narrowing instead of rounding, truncating, or partially restoring the old contract.
    for (const [table, column] of columns) {
      const rows = (await queryRunner.query(
        `SELECT EXISTS(SELECT 1 FROM "${table}" WHERE "${column}" > 9223372036854775807 OR "${column}" < 0) AS unsafe`,
      )) as Array<{ unsafe: boolean }>;
      const [{ unsafe }] = rows;
      if (unsafe)
        throw new Error(
          `Cannot revert exact money: ${table}.${column} exceeds the old bigint range; restore a backup or forward-fix`,
        );
    }
    await this.transformJson(queryRunner, false);
    for (const [table, column] of columns) {
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP CONSTRAINT "CK_exact_${table}_${column}"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE bigint USING "${column}"::bigint`,
      );
    }
  }

  private async transformJson(
    queryRunner: QueryRunner,
    asText: boolean,
  ): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION pg_temp.splice_exact_json(value jsonb, as_text boolean)
      RETURNS jsonb LANGUAGE plpgsql AS $$
      DECLARE result jsonb; item record; magnitude numeric;
      BEGIN
        IF jsonb_typeof(value) = 'array' THEN
          SELECT COALESCE(jsonb_agg(pg_temp.splice_exact_json(v, as_text) ORDER BY ord), '[]'::jsonb)
          INTO result FROM jsonb_array_elements(value) WITH ORDINALITY AS e(v, ord);
          RETURN result;
        ELSIF jsonb_typeof(value) = 'object' THEN
          result := '{}'::jsonb;
          FOR item IN SELECT * FROM jsonb_each(value) LOOP
            result := result || jsonb_build_object(item.key, pg_temp.splice_exact_json(item.value, as_text));
          END LOOP;
          IF jsonb_typeof(result->'money') = 'object' AND result->'money' ? 'amount' THEN
            IF NOT as_text THEN
              magnitude := (result#>>'{money,amount}')::numeric;
              IF magnitude > 9007199254740991 OR magnitude < 0 OR magnitude <> trunc(magnitude) THEN
                RAISE EXCEPTION 'Cannot revert exact money JSON beyond the old safe integer contract; restore a backup or forward-fix';
              END IF;
            END IF;
            result := jsonb_set(result, '{money,amount}', CASE WHEN as_text
              THEN to_jsonb(result#>>'{money,amount}') ELSE to_jsonb((result#>>'{money,amount}')::numeric) END);
          END IF;
          RETURN result;
        END IF;
        RETURN value;
      END $$;
      CREATE OR REPLACE FUNCTION pg_temp.splice_exact_threshold(value jsonb, as_text boolean)
      RETURNS jsonb LANGUAGE plpgsql AS $$
      DECLARE decimal_value numeric;
      BEGIN
        IF as_text THEN RETURN to_jsonb(value#>>'{}'); END IF;
        decimal_value := (value#>>'{}')::numeric;
        IF decimal_value <> ((decimal_value::double precision)::text)::numeric THEN
          RAISE EXCEPTION 'Cannot revert exact rule threshold beyond the old number contract; restore a backup or forward-fix';
        END IF;
        RETURN to_jsonb(decimal_value);
      END $$;
      CREATE OR REPLACE FUNCTION pg_temp.splice_exact_conditions(conditions jsonb, as_text boolean)
      RETURNS jsonb LANGUAGE sql AS $$
        SELECT COALESCE(jsonb_agg(CASE WHEN c->>'field' <> 'amount' THEN c
          WHEN jsonb_typeof(c->'value') = 'object' THEN
            jsonb_set(c, '{value}', (SELECT jsonb_object_agg(k, CASE
              WHEN k IN ('min','max') AND v <> 'null'::jsonb THEN pg_temp.splice_exact_threshold(v, as_text)
              ELSE v END) FROM jsonb_each(c->'value') AS bound(k,v)))
          ELSE jsonb_set(c, '{value}', pg_temp.splice_exact_threshold(c->'value', as_text))
          END ORDER BY ord), '[]'::jsonb)
        FROM jsonb_array_elements(conditions) WITH ORDINALITY AS entry(c,ord)
      $$;
    `);
    for (const table of [
      'categorization_rule_entity',
      'categorization_rule_suggestion_entity',
    ]) {
      await queryRunner.query(
        `UPDATE "${table}" SET conditions = pg_temp.splice_exact_conditions(conditions, $1)`,
        [asText],
      );
    }
    await queryRunner.query(
      `UPDATE categorization_rule_suggestion_entity SET "previewTransactions" = pg_temp.splice_exact_json("previewTransactions", $1)`,
      [asText],
    );
    await queryRunner.query(
      `UPDATE account_entity SET "rawApiAccount" = pg_temp.splice_exact_json("rawApiAccount", $1) WHERE "rawApiAccount" IS NOT NULL`,
      [asText],
    );
    if (!asText) {
      const rows = (await queryRunner.query(
        `SELECT EXISTS(SELECT 1 FROM transaction_reconciliation_archive_entity WHERE (snapshot#>>'{activity,amountAmount}')::numeric > 9007199254740991) AS unsafe`,
      )) as Array<{ unsafe: boolean }>;
      const [{ unsafe }] = rows;
      if (unsafe)
        throw new Error(
          'Cannot revert reconciliation archives beyond the old safe integer contract; restore a backup or forward-fix',
        );
    }
    await queryRunner.query(
      `UPDATE transaction_reconciliation_archive_entity SET snapshot = jsonb_set(
      jsonb_set(snapshot, '{activity,amountAmount}', CASE WHEN $1 THEN to_jsonb(snapshot#>>'{activity,amountAmount}') ELSE to_jsonb((snapshot#>>'{activity,amountAmount}')::numeric) END),
      '{schemaVersion}', to_jsonb(CASE WHEN $1 THEN 2 ELSE 1 END))
      WHERE snapshot#>'{activity,amountAmount}' IS NOT NULL`,
      [asText],
    );
    await queryRunner.query(
      'DROP FUNCTION pg_temp.splice_exact_conditions(jsonb, boolean); DROP FUNCTION pg_temp.splice_exact_threshold(jsonb, boolean); DROP FUNCTION pg_temp.splice_exact_json(jsonb, boolean)',
    );
  }
}
