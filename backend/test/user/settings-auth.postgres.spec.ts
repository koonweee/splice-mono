import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AuthService } from '../../src/auth/auth.service';
import { PersonalAccessTokenEntity } from '../../src/auth/personal-access-token.entity';
import { PersonalAccessTokenService } from '../../src/auth/personal-access-token.service';
import {
  UserEvents,
  UserSettingsUpdatedEvent,
} from '../../src/events/user.events';
import {
  installDatabaseMetrics,
  runWithRequestMetrics,
  type RequestMetrics,
} from '../../src/observability/request-metrics';
import { UserEntity } from '../../src/user/user.entity';
import { UserService } from '../../src/user/user.service';
import { isolatedPostgres, postgresSuite } from '../helpers/isolated-postgres';

postgresSuite('settings and token concurrency on PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof isolatedPostgres>>;
  let service: UserService;
  let tokens: PersonalAccessTokenService;
  let user: UserEntity;
  let events: UserSettingsUpdatedEvent[];

  beforeAll(async () => {
    fixture = await isolatedPostgres('settings_auth');
    const users = fixture.database.getRepository(UserEntity);
    const emitter = new EventEmitter2();
    emitter.on(UserEvents.SETTINGS_UPDATED, (event: UserSettingsUpdatedEvent) =>
      events.push(event),
    );
    service = new UserService(users, {} as AuthService, emitter);
    tokens = new PersonalAccessTokenService(
      fixture.database.getRepository(PersonalAccessTokenEntity),
      users,
    );
    await fixture.database.query('CREATE TABLE usage_writes (token_id uuid)');
    await fixture.database.query(
      `CREATE FUNCTION count_usage_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."lastUsedAt" IS DISTINCT FROM OLD."lastUsedAt" THEN INSERT INTO usage_writes VALUES (NEW.id); END IF; RETURN NEW; END $$`,
    );
    await fixture.database.query(
      'CREATE TRIGGER usage_write AFTER UPDATE ON personal_access_token FOR EACH ROW EXECUTE FUNCTION count_usage_write()',
    );
  }, 60_000);
  afterAll(async () => fixture?.close());
  beforeEach(async () => {
    events = [];
    user = await fixture.database.getRepository(UserEntity).save(
      UserEntity.fromGoogleIdentity({
        email: `${randomUUID()}@fixture.test`,
        googleSubject: randomUUID(),
      }),
    );
    await fixture.database.query('DELETE FROM usage_writes');
  });
  const identity = () => ({ userId: user.id, email: user.email });
  const storedUser = () =>
    fixture.database.getRepository(UserEntity).findOneByOrFail({ id: user.id });

  it('preserves concurrent disjoint and nested patches and committed event values', async () => {
    await Promise.all([
      service.updateSettings(user.id, { currency: 'EUR' }),
      service.updateSettings(user.id, { timezone: 'Asia/Tokyo' }),
      service.updateSettings(user.id, {
        notifications: { transactions: { newSyncedTransactions: false } },
      }),
      service.updateSettings(user.id, {
        notifications: { bankLinks: { needsAttention: false } },
      }),
    ]);
    const saved = await storedUser();
    expect(saved.settings).toMatchObject({
      currency: 'EUR',
      timezone: 'Asia/Tokyo',
      notifications: {
        transactions: { newSyncedTransactions: false },
        bankLinks: { needsAttention: false },
      },
    });
    expect(events).toHaveLength(2);
    expect(events.find((event) => event.currencyChanged)).toMatchObject({
      oldSettings: { currency: 'USD' },
      newSettings: { currency: 'EUR' },
    });
    expect(events.find((event) => event.timezoneChanged)).toMatchObject({
      oldSettings: { timezone: 'UTC' },
      newSettings: { timezone: 'Asia/Tokyo' },
    });
  });

  it('cannot reset a concurrent explicit notification preference or other provider', async () => {
    await fixture.database.query(
      'UPDATE user_entity SET settings=$2::jsonb WHERE id=$1',
      [user.id, JSON.stringify({ currency: 'USD', timezone: 'UTC' })],
    );
    await Promise.all([
      service.enableDefaultNotificationsIfUnset(user.id),
      service.updateSettings(user.id, {
        currency: 'EUR',
        notifications: { transactions: { newSyncedTransactions: false } },
      }),
      service.updateProviderDetails(user.id, 'plaid', {
        userToken: 'synthetic-one',
      }),
      service.updateProviderDetails(user.id, 'simplefin', {
        key: 'synthetic-two',
      }),
    ]);
    const saved = await storedUser();
    expect(saved.settings.currency).toBe('EUR');
    expect(
      saved.settings.notifications.transactions.newSyncedTransactions,
    ).toBe(false);
    expect(saved.providerDetails).toEqual({
      plaid: { userToken: 'synthetic-one' },
      simplefin: { key: 'synthetic-two' },
    });
  });

  it('authenticates repeated and simultaneous requests with one usage write per minute', async () => {
    const token = await tokens.createToken(identity(), { name: 'fixture' });
    const results = await Promise.all(
      Array.from({ length: 10 }, () => tokens.validateToken(token.token)),
    );
    expect(results).toEqual(Array.from({ length: 10 }, identity));
    expect(
      await fixture.database.query(
        'SELECT * FROM usage_writes WHERE token_id=$1',
        [token.id],
      ),
    ).toHaveLength(1);
    await fixture.database.query(
      `UPDATE personal_access_token SET "lastUsedAt"=clock_timestamp()-interval '61 seconds' WHERE id=$1`,
      [token.id],
    );
    await fixture.database.query('DELETE FROM usage_writes');
    expect(await tokens.validateToken(token.token)).toEqual(identity());
    expect(await tokens.validateToken(token.token)).toEqual(identity());
    expect(
      await fixture.database.query(
        'SELECT * FROM usage_writes WHERE token_id=$1',
        [token.id],
      ),
    ).toHaveLength(1);
  });

  it('rejects expiry, revocation and deleted-user tokens without an authorization cache', async () => {
    const expired = await tokens.createToken(identity(), {
      name: 'expired',
      expiresAt: new Date(Date.now() - 1000),
    });
    const revoked = await tokens.createToken(identity(), { name: 'revoked' });
    const deleted = await tokens.createToken(identity(), { name: 'deleted' });
    expect(await tokens.validateToken(expired.token)).toBeNull();
    expect(await tokens.validateToken(revoked.token)).toEqual(identity());
    await tokens.revokeToken(user.id, revoked.id);
    expect(await tokens.validateToken(revoked.token)).toBeNull();
    await fixture.database.getRepository(UserEntity).delete(user.id);
    expect(await tokens.validateToken(deleted.token)).toBeNull();
  });

  it.each(['revocation', 'expiry', 'deletion'] as const)(
    'rechecks %s after waiting for a concurrent transaction',
    async (kind) => {
      const token = await tokens.createToken(identity(), { name: kind });
      const runner = fixture.database.createQueryRunner();
      await runner.startTransaction();
      try {
        if (kind === 'deletion')
          await runner.manager.delete(UserEntity, user.id);
        else
          await runner.query(
            `UPDATE personal_access_token SET ${kind === 'revocation' ? '"revokedAt"=clock_timestamp()' : '"expiresAt"=clock_timestamp()+interval \'100 milliseconds\''} WHERE id=$1`,
            [token.id],
          );
        const validation = tokens.validateToken(token.token);
        await runner.query('SELECT pg_sleep(0.15)');
        await runner.commitTransaction();
        expect(await validation).toBeNull();
      } finally {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
        await runner.release();
      }
    },
  );

  it('attributes SQL and connection wait to each concurrent request without retaining values', async () => {
    const database = new DataSource({
      ...fixture.database.options,
      extra: {
        ...(fixture.database.options as { extra: object }).extra,
        max: 1,
      },
    });
    await database.initialize();
    installDatabaseMetrics(database);
    const metrics: RequestMetrics[] = [];
    try {
      await Promise.all([
        runWithRequestMetrics(
          () => database.query('SELECT pg_sleep(0.08)'),
          (value) => metrics.push(value),
        ),
        runWithRequestMetrics(
          () =>
            database.query('SELECT $1::text AS secret', [
              'private financial value',
            ]),
          (value) => metrics.push(value),
        ),
      ]);
      expect(metrics.map((value) => value.sqlCount)).toEqual([1, 1]);
      expect(metrics.some((value) => value.connectionAcquireMs > 50)).toBe(
        true,
      );
      expect(
        metrics.every(
          (value) =>
            value.connectionAcquisitions === 1 && value.returnedRows === 1,
        ),
      ).toBe(true);
      expect(JSON.stringify(metrics)).not.toMatch(/SELECT|private|secret/);
      let updateMetrics: RequestMetrics | undefined;
      await runWithRequestMetrics(
        () =>
          database.query('UPDATE user_entity SET email=email WHERE id=$1', [
            user.id,
          ]),
        (value) => {
          updateMetrics = value;
        },
      );
      expect(updateMetrics).toMatchObject({ sqlCount: 1, returnedRows: 0 });
    } finally {
      await database.destroy();
    }
  });
});
