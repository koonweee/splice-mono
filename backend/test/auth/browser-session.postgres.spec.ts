import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'node:crypto';
import { AuthService } from '../../src/auth/auth.service';
import { BrowserSessionEntity } from '../../src/auth/browser-session.entity';
import { BrowserSessionService } from '../../src/auth/browser-session.service';
import { RefreshTokenCleanupService } from '../../src/auth/refresh-token-cleanup.service';
import { RefreshTokenEntity } from '../../src/auth/refresh-token.entity';
import { UserEntity } from '../../src/user/user.entity';
import { isolatedPostgres, postgresSuite } from '../helpers/isolated-postgres';

postgresSuite('browser session privacy on PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof isolatedPostgres>>;
  let sessions: BrowserSessionService;
  let auth: AuthService;
  let user: UserEntity;
  const originalSecret = process.env.JWT_SECRET;
  beforeAll(async () => {
    process.env.JWT_SECRET = randomUUID();
    fixture = await isolatedPostgres('browser_sessions');
    sessions = new BrowserSessionService(fixture.database);
    auth = new AuthService(
      fixture.database.getRepository(RefreshTokenEntity),
      new JwtService(),
      sessions,
    );
  }, 60_000);
  afterAll(async () => {
    process.env.JWT_SECRET = originalSecret;
    await fixture?.close();
  });
  beforeEach(async () => {
    user = await fixture.database.getRepository(UserEntity).save(
      UserEntity.fromGoogleIdentity({
        email: `${randomUUID()}@fixture.test`,
        googleSubject: randomUUID(),
      }),
    );
  });
  const tokenFor = (raw: string) =>
    fixture.database.getRepository(RefreshTokenEntity).findOneByOrFail({
      token: createHash('sha256').update(raw).digest('hex'),
    });
  const resolve = (raw: string, userId = user.id) =>
    fixture.database.transaction((manager) =>
      sessions.resolveForRefreshToken(manager, raw, userId),
    );
  async function subscription(sessionId: string | null, owner = user.id) {
    const id = randomUUID();
    await fixture.database.query(
      `INSERT INTO push_subscription_entity (id, "userId", endpoint, p256dh, auth, "sessionId", "rebindRequired") VALUES ($1,$2,$3,'fixture','fixture',$4,false)`,
      [id, owner, `https://push.fixture.test/${id}`, sessionId],
    );
    return id;
  }
  async function delivery(subscriptionId: string) {
    const notificationId = randomUUID();
    const id = randomUUID();
    await fixture.database.query(
      `INSERT INTO notification_entity (id,"userId",type,"dedupeKey",payload) VALUES ($1,$2,'system.test',$3,'{}')`,
      [notificationId, user.id, notificationId],
    );
    await fixture.database.query(
      `INSERT INTO notification_push_delivery_entity (id,"notificationId","subscriptionId") VALUES ($1,$2,$3)`,
      [id, notificationId, subscriptionId],
    );
    return id;
  }
  async function legacyToken(overrides: Partial<RefreshTokenEntity> = {}) {
    const raw = randomUUID();
    const entity = await fixture.database
      .getRepository(RefreshTokenEntity)
      .save({
        token: createHash('sha256').update(raw).digest('hex'),
        userId: user.id,
        expiresAt: new Date(Date.now() + 86_400_000),
        revoked: false,
        sessionId: null,
        revokedAt: null,
        revocationReason: null,
        rotationGraceExpiresAt: null,
        replacedByTokenId: null,
        ...overrides,
      });
    return { raw, entity };
  }

  it('keeps a stable identity across concurrent rotations and valid predecessor enrollment', async () => {
    const raw = await auth.generateRefreshToken(user.id);
    const before = await resolve(raw);
    const [first, second] = await Promise.all([
      auth.rotateRefreshToken(raw),
      auth.rotateRefreshToken(raw),
    ]);
    expect(first).toEqual(second);
    expect((await resolve(raw)).id).toBe(before.id);
    expect((await resolve(first.newRefreshToken)).id).toBe(before.id);
    expect((await tokenFor(first.newRefreshToken)).sessionId).toBe(before.id);
    expect(
      await fixture.database
        .getRepository(BrowserSessionEntity)
        .findBy({ userId: user.id }),
    ).toHaveLength(1);
  });

  it('revokes one entire family and its pending push atomically while preserving other devices', async () => {
    const raw = await auth.generateRefreshToken(user.id);
    const otherRaw = await auth.generateRefreshToken(user.id);
    const session = await resolve(raw);
    const other = await resolve(otherRaw);
    const sub = await subscription(session.id);
    const otherSub = await subscription(other.id);
    const job = await delivery(sub);
    const replacement = await auth.rotateRefreshToken(raw);
    await auth.revokeToken(raw);
    await expect(resolve(replacement.newRefreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(
      auth.rotateRefreshToken(replacement.newRefreshToken),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect((await resolve(otherRaw)).id).toBe(other.id);
    const rows = await fixture.database.query(
      'SELECT id,"revokedAt","rebindRequired" FROM push_subscription_entity WHERE id=ANY($1::uuid[])',
      [[sub, otherSub]],
    );
    expect(rows.find((row) => row.id === sub)).toMatchObject({
      revokedAt: expect.any(Date),
      rebindRequired: false,
    });
    expect(rows.find((row) => row.id === otherSub).revokedAt).toBeNull();
    expect(
      await fixture.database.query(
        'SELECT status FROM notification_push_delivery_entity WHERE id=$1',
        [job],
      ),
    ).toEqual([{ status: 'failed' }]);
    await auth.revokeToken(raw);
    await auth.revokeToken(randomUUID());
  });

  it('logout-all also revokes unbound legacy tokens and subscriptions without affecting other users', async () => {
    const raw = await auth.generateRefreshToken(user.id);
    const legacy = await legacyToken();
    const sub = await subscription(null);
    const other = await fixture.database.getRepository(UserEntity).save(
      UserEntity.fromGoogleIdentity({
        email: `${randomUUID()}@fixture.test`,
        googleSubject: randomUUID(),
      }),
    );
    const otherRaw = await auth.generateRefreshToken(other.id);
    await auth.revokeAllUserTokens(user.id);
    await expect(resolve(raw)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(resolve(legacy.raw)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect((await tokenFor(legacy.raw)).revoked).toBe(true);
    expect(
      (
        await fixture.database.query(
          'SELECT "revokedAt","rebindRequired" FROM push_subscription_entity WHERE id=$1',
          [sub],
        )
      )[0],
    ).toMatchObject({ revokedAt: expect.any(Date), rebindRequired: false });
    expect((await resolve(otherRaw, other.id)).userId).toBe(other.id);
  });

  it('rolls back token and session revocation if push revocation fails', async () => {
    const raw = await auth.generateRefreshToken(user.id);
    const session = await resolve(raw);
    const sub = await subscription(session.id);
    await delivery(sub);
    await fixture.database.query(
      `CREATE FUNCTION reject_fixture_revocation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."lastError" = 'session_revoked' THEN RAISE EXCEPTION 'fixture revocation failed'; END IF; RETURN NEW; END $$`,
    );
    await fixture.database.query(
      'CREATE TRIGGER reject_fixture_revocation BEFORE UPDATE ON notification_push_delivery_entity FOR EACH ROW EXECUTE FUNCTION reject_fixture_revocation()',
    );
    try {
      await expect(auth.revokeToken(raw)).rejects.toThrow(
        'fixture revocation failed',
      );
      expect((await resolve(raw)).id).toBe(session.id);
      expect((await tokenFor(raw)).revoked).toBe(false);
      expect(
        (
          await fixture.database.query(
            'SELECT "revokedAt" FROM push_subscription_entity WHERE id=$1',
            [sub],
          )
        )[0].revokedAt,
      ).toBeNull();
    } finally {
      await fixture.database.query(
        'DROP TRIGGER reject_fixture_revocation ON notification_push_delivery_entity',
      );
      await fixture.database.query('DROP FUNCTION reject_fixture_revocation()');
    }
  });

  it('does not expose enrollment through a different owner or an expired/grace-ended cookie', async () => {
    const raw = await auth.generateRefreshToken(user.id);
    await expect(resolve(raw, randomUUID())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    const expired = await legacyToken({
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(resolve(expired.raw)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await auth.rotateRefreshToken(raw);
    await fixture.database
      .getRepository(RefreshTokenEntity)
      .update((await tokenFor(raw)).id, {
        rotationGraceExpiresAt: new Date(Date.now() - 1000),
      });
    await expect(resolve(raw)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('resolves an unbound descendant issued by an old instance into its existing family', async () => {
    const raw = await auth.generateRefreshToken(user.id);
    const session = await resolve(raw);
    const replacement = await legacyToken();
    await fixture.database
      .getRepository(RefreshTokenEntity)
      .update((await tokenFor(raw)).id, {
        revoked: true,
        revocationReason: 'rotated',
        rotationGraceExpiresAt: new Date(Date.now() + 10_000),
        replacedByTokenId: replacement.entity.id,
      });
    expect((await resolve(replacement.raw)).id).toBe(session.id);
    expect((await resolve(raw)).id).toBe(session.id);
    await auth.revokeToken(raw);
    expect((await tokenFor(replacement.raw)).revoked).toBe(true);
  });

  it('reconciles live old-instance logins after drain without joining separate devices', async () => {
    const first = await legacyToken();
    const second = await legacyToken();
    const revoked = await legacyToken({
      revoked: true,
      revocationReason: 'logout',
    });
    expect(await sessions.backfillUnboundSessions()).toBeGreaterThanOrEqual(2);
    expect((await tokenFor(first.raw)).sessionId).not.toBe(
      (await tokenFor(second.raw)).sessionId,
    );
    expect((await tokenFor(revoked.raw)).sessionId).toBeNull();
    expect(await sessions.backfillUnboundSessions()).toBe(0);
  });

  it('re-reads replacement edges after waiting on an in-flight old-instance rotation', async () => {
    const old = await legacyToken();
    const runner = fixture.database.createQueryRunner();
    await runner.startTransaction();
    try {
      await runner.manager.getRepository(RefreshTokenEntity).findOne({
        where: { id: old.entity.id },
        lock: { mode: 'pessimistic_write' },
      });
      const resolving = resolve(old.raw);
      await runner.query('SELECT pg_sleep(0.08)');
      const replacement = await runner.manager
        .getRepository(RefreshTokenEntity)
        .save({
          ...old.entity,
          id: randomUUID(),
          token: createHash('sha256').update(randomUUID()).digest('hex'),
        });
      await runner.manager
        .getRepository(RefreshTokenEntity)
        .update(old.entity.id, {
          revoked: true,
          revocationReason: 'rotated',
          rotationGraceExpiresAt: new Date(Date.now() + 10_000),
          replacedByTokenId: replacement.id,
        });
      await runner.commitTransaction();
      const session = await resolving;
      expect(
        (
          await fixture.database
            .getRepository(RefreshTokenEntity)
            .findOneByOrFail({ id: replacement.id })
        ).sessionId,
      ).toBe(session.id);
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
  });

  it('preserves live device identity when token cleanup removes old predecessors', async () => {
    const raw = await auth.generateRefreshToken(user.id);
    const session = await resolve(raw);
    const replacement = await auth.rotateRefreshToken(raw);
    const oldDate = new Date(Date.now() - 40 * 86_400_000);
    await fixture.database
      .getRepository(RefreshTokenEntity)
      .update((await tokenFor(raw)).id, {
        revokedAt: oldDate,
        expiresAt: oldDate,
      });
    await new RefreshTokenCleanupService(
      fixture.database.getRepository(RefreshTokenEntity),
    ).cleanupInactiveTokens();
    expect((await resolve(replacement.newRefreshToken)).id).toBe(session.id);
    await auth.revokeToken(replacement.newRefreshToken);
    await expect(resolve(replacement.newRefreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('waits for an already-started send session lock and prevents every later send', async () => {
    const raw = await auth.generateRefreshToken(user.id);
    const session = await resolve(raw);
    const runner = fixture.database.createQueryRunner();
    await runner.startTransaction();
    try {
      await sessions.lockActiveSession(runner.manager, session.id, user.id);
      let acknowledged = false;
      const logout = auth.revokeToken(raw).then(() => {
        acknowledged = true;
      });
      await runner.query('SELECT pg_sleep(0.08)');
      expect(acknowledged).toBe(false);
      await runner.commitTransaction();
      await logout;
      await expect(
        fixture.database.transaction((manager) =>
          sessions.lockActiveSession(manager, session.id, user.id),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
  });

  it('does not resurrect a session when logout wins an enrollment or rotation race', async () => {
    const raw = await auth.generateRefreshToken(user.id);
    const session = await resolve(raw);
    const runner = fixture.database.createQueryRunner();
    await runner.startTransaction();
    try {
      await sessions.lockUser(runner.manager, user.id);
      await runner.manager
        .getRepository(BrowserSessionEntity)
        .update(session.id, { revokedAt: new Date() });
      const enrollment = resolve(raw).then(
        () => 'allowed',
        () => 'denied',
      );
      const rotation = auth.rotateRefreshToken(raw).then(
        () => 'allowed',
        () => 'denied',
      );
      await runner.query('SELECT pg_sleep(0.08)');
      await runner.commitTransaction();
      expect(await enrollment).toBe('denied');
      expect(await rotation).toBe('denied');
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
  });
});

postgresSuite('browser session migration on PostgreSQL', () => {
  it('backfills linked grace/partially cleaned families, pauses enabled pushes, and never enables revoked chains', async () => {
    const fixture = await isolatedPostgres('session_migration', 1788804300000);
    try {
      const user = await fixture.database.getRepository(UserEntity).save(
        UserEntity.fromGoogleIdentity({
          email: `${randomUUID()}@fixture.test`,
          googleSubject: randomUUID(),
        }),
      );
      const first = randomUUID(),
        second = randomUUID(),
        expired = randomUUID(),
        disabled = randomUUID(),
        enabled = randomUUID();
      for (const [id, revoked, future] of [
        [second, false, true],
        [first, true, true],
        [expired, false, false],
      ] as const) {
        await fixture.database.query(
          `INSERT INTO refresh_token (id,token,"userId","expiresAt",revoked,"revocationReason","rotationGraceExpiresAt","replacedByTokenId") VALUES ($1,$2,$3,now()+($4::int * interval '1 day'),$5,$6,now()+interval '10 seconds',$7)`,
          [
            id,
            randomUUID(),
            user.id,
            future ? 1 : -1,
            revoked,
            revoked ? 'rotated' : null,
            id === first ? second : null,
          ],
        );
      }
      for (const [id, revoked] of [
        [enabled, false],
        [disabled, true],
      ] as const) {
        await fixture.database.query(
          `INSERT INTO push_subscription_entity (id,"userId",endpoint,p256dh,auth,"revokedAt") VALUES ($1,$2,$3,'fixture','fixture',$4)`,
          [
            id,
            user.id,
            `https://push.fixture.test/${id}`,
            revoked ? new Date() : null,
          ],
        );
      }
      await fixture.database.runMigrations({ transaction: 'all' });
      const tokens = await fixture.database
        .getRepository(RefreshTokenEntity)
        .findBy({ userId: user.id });
      expect(tokens.find((token) => token.id === first)?.sessionId).toBe(
        tokens.find((token) => token.id === second)?.sessionId,
      );
      const sessions = await fixture.database
        .getRepository(BrowserSessionEntity)
        .findBy({ userId: user.id });
      expect(
        sessions.find((session) => session.id === second)?.revokedAt,
      ).toBeNull();
      expect(
        sessions.find((session) => session.id === expired)?.revokedAt,
      ).toBeInstanceOf(Date);
      const pushes = await fixture.database.query(
        'SELECT id,"rebindRequired","revokedAt","sessionId" FROM push_subscription_entity WHERE "userId"=$1',
        [user.id],
      );
      expect(pushes.find((push) => push.id === enabled)).toMatchObject({
        rebindRequired: true,
        revokedAt: expect.any(Date),
        sessionId: null,
      });
      expect(pushes.find((push) => push.id === disabled)).toMatchObject({
        rebindRequired: false,
        revokedAt: expect.any(Date),
        sessionId: null,
      });
      const late = randomUUID();
      await fixture.database.query(
        `INSERT INTO push_subscription_entity (id,"userId",endpoint,p256dh,auth) VALUES ($1,$2,$3,'fixture','fixture')`,
        [late, user.id, `https://push.fixture.test/${late}`],
      );
      expect(
        (
          await fixture.database.query(
            'SELECT "revokedAt","rebindRequired" FROM push_subscription_entity WHERE id=$1',
            [late],
          )
        )[0],
      ).toMatchObject({ revokedAt: expect.any(Date), rebindRequired: true });
      await fixture.database.query(
        'UPDATE push_subscription_entity SET "revokedAt"=clock_timestamp() WHERE id=$1',
        [late],
      );
      expect(
        (
          await fixture.database.query(
            'SELECT "rebindRequired" FROM push_subscription_entity WHERE id=$1',
            [late],
          )
        )[0].rebindRequired,
      ).toBe(false);
      await fixture.database.query(
        'UPDATE push_subscription_entity SET "revokedAt"=NULL WHERE id=$1',
        [late],
      );
      expect(
        (
          await fixture.database.query(
            'SELECT "revokedAt","rebindRequired" FROM push_subscription_entity WHERE id=$1',
            [late],
          )
        )[0],
      ).toMatchObject({ revokedAt: expect.any(Date), rebindRequired: true });
    } finally {
      await fixture.close();
    }
  }, 60_000);
});
