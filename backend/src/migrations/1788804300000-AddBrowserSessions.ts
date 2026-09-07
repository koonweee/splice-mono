import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBrowserSessions1788804300000 implements MigrationInterface {
  name = 'AddBrowserSessions1788804300000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE browser_session (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "userId" uuid NOT NULL REFERENCES user_entity(id) ON DELETE CASCADE,
      "expiresAt" timestamp NOT NULL, "revokedAt" timestamp,
      "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_browser_session_user" ON browser_session ("userId")`,
    );
    await queryRunner.query(`ALTER TABLE refresh_token ADD "sessionId" uuid,
      ADD CONSTRAINT "FK_refresh_token_session" FOREIGN KEY ("sessionId") REFERENCES browser_session(id) ON DELETE RESTRICT`);
    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_token_session" ON refresh_token ("sessionId")`,
    );
    await queryRunner.query(`ALTER TABLE push_subscription_entity
      ADD "sessionId" uuid,
      ADD "enrollmentId" uuid NOT NULL DEFAULT uuid_generate_v4(),
      ADD "rebindRequired" boolean NOT NULL DEFAULT true,
      ADD CONSTRAINT "FK_push_subscription_session" FOREIGN KEY ("sessionId") REFERENCES browser_session(id) ON DELETE RESTRICT`);
    await queryRunner.query(
      `CREATE INDEX "IDX_push_subscription_session" ON push_subscription_entity ("sessionId")`,
    );

    // Follow replacement edges, including revoked grace predecessors. The
    // surviving terminal node names each family even after prefix cleanup.
    // Concurrent old writers block behind ALTER TABLE, and their later unbound
    // descendants are resolved transactionally by BrowserSessionService.
    await queryRunner.query(`CREATE TEMP TABLE browser_session_backfill ON COMMIT DROP AS
      WITH RECURSIVE chain AS (
        SELECT id AS origin, "userId", id, "replacedByTokenId" FROM refresh_token
        UNION
        SELECT chain.origin, chain."userId", token.id, token."replacedByTokenId"
        FROM chain JOIN refresh_token token ON token.id = chain."replacedByTokenId"
          AND token."userId" = chain."userId"
      ) SELECT chain.origin, chain.id AS "sessionId" FROM chain
      WHERE NOT EXISTS (SELECT 1 FROM refresh_token next
        WHERE next.id = chain."replacedByTokenId" AND next."userId" = chain."userId")`);
    await queryRunner.query(`INSERT INTO browser_session (id, "userId", "expiresAt", "revokedAt")
      SELECT family."sessionId", token."userId", MAX(token."expiresAt"),
        CASE WHEN BOOL_OR(NOT token.revoked AND token."expiresAt" > now()) THEN NULL ELSE now() END
      FROM browser_session_backfill family JOIN refresh_token token ON token.id = family.origin
      GROUP BY family."sessionId", token."userId"`);
    await queryRunner.query(`UPDATE refresh_token token SET "sessionId" = family."sessionId"
      FROM browser_session_backfill family WHERE token.id = family.origin`);

    // revokedAt also stops pre-upgrade workers, which do not know rebindRequired.
    await queryRunner.query(`UPDATE push_subscription_entity
      SET "rebindRequired" = ("revokedAt" IS NULL),
          "revokedAt" = COALESCE("revokedAt", now()), "updatedAt" = now()
      WHERE "sessionId" IS NULL`);
    await queryRunner.query(`UPDATE notification_push_delivery_entity delivery
      SET status = 'failed', "lastError" = 'legacy_rebind_required',
          "processingStartedAt" = NULL, "updatedAt" = now()
      FROM push_subscription_entity subscription
      WHERE delivery."subscriptionId" = subscription.id AND subscription."sessionId" IS NULL
        AND delivery.status IN ('pending', 'processing')`);
    // An old API process can insert/re-enable subscriptions after the backfill.
    // Keep those rows visibly revoked even for an old push processor. An old
    // disable action still clears eligibility for automatic migration rebind.
    await queryRunner.query(`CREATE FUNCTION guard_unbound_push_enrollment() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN
        IF NEW."sessionId" IS NULL THEN
          IF NEW."revokedAt" IS NULL THEN
            NEW."revokedAt" := now();
            NEW."rebindRequired" := true;
          ELSIF TG_OP = 'UPDATE' AND NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt" THEN
            NEW."rebindRequired" := false;
          END IF;
        END IF;
        RETURN NEW;
      END $$`);
    await queryRunner.query(`CREATE TRIGGER guard_unbound_push_enrollment
      BEFORE INSERT OR UPDATE ON push_subscription_entity
      FOR EACH ROW EXECUTE FUNCTION guard_unbound_push_enrollment()`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Downgrade intentionally leaves paused subscriptions revoked. Restoring
    // old sends would reopen the logout privacy gap.
    await queryRunner.query(
      `DROP TRIGGER guard_unbound_push_enrollment ON push_subscription_entity`,
    );
    await queryRunner.query(`DROP FUNCTION guard_unbound_push_enrollment()`);
    await queryRunner.query(`ALTER TABLE push_subscription_entity
      DROP CONSTRAINT "FK_push_subscription_session", DROP COLUMN "sessionId",
      DROP COLUMN "enrollmentId", DROP COLUMN "rebindRequired"`);
    await queryRunner.query(`ALTER TABLE refresh_token
      DROP CONSTRAINT "FK_refresh_token_session", DROP COLUMN "sessionId"`);
    await queryRunner.query(`DROP TABLE browser_session`);
  }
}
