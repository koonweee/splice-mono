import { AccountType } from 'plaid';
import { randomUUID } from 'node:crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AccountEntity } from '../../src/account/account.entity';
import { BankLinkEntity } from '../../src/bank-link/bank-link.entity';
import { BankLinkHealthService } from '../../src/bank-link/bank-link-health.service';
import { BankLinkEvents } from '../../src/events/bank-link.events';
import { UserEntity } from '../../src/user/user.entity';
import type { ProviderConnectionHealth } from '../../src/types/BankLinkHealth';
import {
  getConnectionIssue,
  isProviderUpdateOverdue,
  MissingProviderAccountsError,
} from '../../src/bank-link/providers/plaid/plaid-connection-health';
import { isolatedPostgres, postgresSuite } from '../helpers/isolated-postgres';
import { mockCreateAccountDto } from '../mocks/account/account.mock';

postgresSuite('Connection health on PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof isolatedPostgres>>;
  let service: BankLinkHealthService;
  let link: BankLinkEntity;
  let account: AccountEntity;
  const probe = jest.fn<
    Promise<ProviderConnectionHealth>,
    [Record<string, unknown>]
  >();
  const events = new EventEmitter2();
  const attention = jest.fn();
  const healthy = (): ProviderConnectionHealth => ({
    externalAccountIds: ['external'],
    issue: null,
    providerUpdates: [
      {
        product: 'investments',
        lastSuccessfulUpdateAt: new Date().toISOString(),
        lastFailedUpdateAt: null,
      },
    ],
  });
  beforeAll(async () => {
    fixture = await isolatedPostgres('connection_health');
    service = new BankLinkHealthService(
      fixture.database.getRepository(BankLinkEntity),
      fixture.database.getRepository(AccountEntity),
      { getProvider: () => ({ getConnectionHealth: probe }) } as never,
      events,
    );
    events.on(BankLinkEvents.NEEDS_ATTENTION, attention);
  }, 60_000);
  afterAll(async () => fixture?.close());
  beforeEach(async () => {
    attention.mockClear();
    probe.mockReset().mockImplementation(async () => healthy());
    const user = await fixture.database.getRepository(UserEntity).save(
      UserEntity.fromGoogleIdentity({
        email: `${randomUUID()}@fixture.test`,
        googleSubject: randomUUID(),
      }),
    );
    link = await fixture.database.getRepository(BankLinkEntity).save(
      BankLinkEntity.fromDto(
        {
          providerName: 'plaid',
          authentication: { accessToken: randomUUID(), itemId: randomUUID() },
          accountIds: ['external'],
        },
        user.id,
      ),
    );
    account = await fixture.database.getRepository(AccountEntity).save(
      AccountEntity.fromDto(
        {
          ...mockCreateAccountDto,
          customName: '(SG) IBKR …3898',
          bankLinkId: link.id,
          externalAccountId: 'external',
          type: AccountType.Investment,
        },
        user.id,
      ),
    );
  });
  const stored = () =>
    fixture.database
      .getRepository(BankLinkEntity)
      .findOneByOrFail({ id: link.id });

  it('detects silent missing accounts and sends one account-specific notification', async () => {
    probe.mockResolvedValue({
      ...healthy(),
      externalAccountIds: [],
      issue: getConnectionIssue({ error_code: 'NO_ACCOUNTS' }),
    });
    expect(await service.checkConnections(link.userId, true)).toEqual({
      checked: 1,
      changed: true,
    });
    expect((await stored()).status).toBe('ERROR');
    expect((await stored()).health?.reason).toBe('accounts_missing');
    expect(attention).toHaveBeenCalledTimes(1);
    expect(attention.mock.calls[0][0].accountNames).toEqual([
      '(SG) IBKR …3898',
    ]);
    expect(await service.check(link.id, link.userId)).toMatchObject({
      checked: false,
    });
    await service.recordSyncFailure(await stored(), {
      response: { data: { error_code: 'NO_ACCOUNTS' } },
    });
    await service.recordSyncFailure(
      await stored(),
      new MissingProviderAccountsError(),
    );
    expect(attention).toHaveBeenCalledTimes(1);
    expect(
      (
        await fixture.database
          .getRepository(AccountEntity)
          .findOneByOrFail({ id: account.id })
      ).currentBalance.amount,
    ).toBe(account.currentBalance.amount);
  });

  it('treats missing expected membership as a failure even with other returned accounts', async () => {
    probe.mockResolvedValue({ ...healthy(), externalAccountIds: ['other'] });
    await service.check(link.id, link.userId, { afterReconnect: true });
    expect((await stored()).status).toBe('ERROR');
    expect((await stored()).statusBody?.error_code).toBe('ACCOUNTS_MISSING');
  });

  it('validates account presence independently of zero holdings or unchanged activity', async () => {
    await expect(
      service.validateAccounts(link, ['external'], true),
    ).resolves.toBeUndefined();
    await service.check(link.id, link.userId);
    expect((await stored()).health?.state).toBe('healthy');
    expect(attention).not.toHaveBeenCalled();
  });

  it('clears a reconnect error only after expected accounts are accessible', async () => {
    link.status = 'ERROR';
    link.statusBody = { error_code: 'ITEM_LOGIN_REQUIRED' };
    await fixture.database.getRepository(BankLinkEntity).save(link);
    await service.check(link.id, link.userId, { afterReconnect: true });
    expect(await stored()).toMatchObject({
      status: 'OK',
      statusBody: null,
      health: { state: 'healthy' },
    });
  });

  it('recovers a verified repaired connection during reconciliation', async () => {
    link.status = 'ERROR';
    link.statusBody = { error_code: 'NO_ACCOUNTS' };
    await fixture.database.getRepository(BankLinkEntity).save(link);
    await service.check(link.id, link.userId);
    expect((await stored()).status).toBe('OK');
    expect(attention).not.toHaveBeenCalled();
  });

  it('keeps provider delay separate from a repairable error', async () => {
    probe.mockResolvedValue({
      ...healthy(),
      providerUpdates: [
        {
          product: 'investments',
          lastSuccessfulUpdateAt: '2026-01-01T00:00:00Z',
          lastFailedUpdateAt: null,
        },
      ],
    });
    await service.check(link.id, link.userId);
    expect(await stored()).toMatchObject({
      status: 'OK',
      health: { state: 'delayed', reason: 'provider_delayed' },
    });
    expect(attention).not.toHaveBeenCalled();
  });

  it('does not clear an existing login error on a transient check failure', async () => {
    link.status = 'ERROR';
    link.statusBody = { error_code: 'ITEM_LOGIN_REQUIRED' };
    await fixture.database.getRepository(BankLinkEntity).save(link);
    probe.mockRejectedValue(new Error('temporary outage'));
    await service.check(link.id, link.userId, { afterReconnect: true });
    expect(await stored()).toMatchObject({
      status: 'ERROR',
      health: { state: 'unknown' },
      statusBody: { error_code: 'ITEM_LOGIN_REQUIRED' },
    });
    expect(attention).not.toHaveBeenCalled();
  });

  it('rejects another owner before contacting the provider', async () => {
    await expect(service.check(link.id, randomUUID())).rejects.toThrow(
      'not found',
    );
    expect(probe).not.toHaveBeenCalled();
  });

  it('claims once across concurrent requests', async () => {
    const result = await Promise.all([
      service.check(link.id, link.userId),
      service.check(link.id, link.userId),
    ]);
    expect(result.filter((value) => value.checked)).toHaveLength(1);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('reclaims an expired check lease', async () => {
    await fixture.database.getRepository(BankLinkEntity).update(link.id, {
      healthCheckStartedAt: new Date(Date.now() - 10 * 60 * 1000),
    });
    expect(await service.check(link.id, link.userId)).toMatchObject({
      checked: true,
    });
  });

  it('does not overwrite a newer reconnect result with an older in-flight failure', async () => {
    probe.mockImplementation(async () => {
      await fixture.database.getRepository(BankLinkEntity).update(link.id, {
        statusDate: new Date(Date.now() + 1000),
        healthCheckStartedAt: null,
      });
      return {
        ...healthy(),
        issue: getConnectionIssue({ error_code: 'ITEM_LOGIN_REQUIRED' }),
      };
    });
    expect(await service.check(link.id, link.userId)).toMatchObject({
      changed: false,
    });
    expect((await stored()).status).toBe('OK');
    expect(attention).not.toHaveBeenCalled();
  });

  it('does not update or notify an account archived during provider I/O', async () => {
    probe.mockImplementation(async () => {
      await fixture.database
        .getRepository(BankLinkEntity)
        .update(link.id, { archivedAt: new Date() });
      return {
        ...healthy(),
        issue: getConnectionIssue({ error_code: 'NO_ACCOUNTS' }),
      };
    });
    expect(await service.check(link.id, link.userId)).toMatchObject({
      changed: false,
    });
    expect(attention).not.toHaveBeenCalled();
  });

  it('does not treat an archived account as missing', async () => {
    const archived = AccountEntity.fromDto(
      {
        ...mockCreateAccountDto,
        bankLinkId: link.id,
        externalAccountId: 'archived',
      },
      link.userId,
    );
    archived.archivedAt = new Date();
    await fixture.database.getRepository(AccountEntity).save(archived);
    await service.check(link.id, link.userId);
    expect((await stored()).health?.state).toBe('healthy');
  });

  it('excludes disconnected connections from unattended checks', async () => {
    await fixture.database
      .getRepository(BankLinkEntity)
      .update(link.id, { disconnectRequestedAt: new Date() });
    expect(await service.checkConnections(link.userId)).toEqual({
      checked: 0,
      changed: false,
    });
    expect(probe).not.toHaveBeenCalled();
  });
});

describe('Provider health classification', () => {
  it('does not prescribe reconnect for outages, rate limits or malformed errors', () => {
    for (const error of [
      null,
      new Error('network'),
      { error_code: 'RATE_LIMIT_EXCEEDED' },
      { response: { data: { error_code: 'INSTITUTION_DOWN' } } },
    ])
      expect(getConnectionIssue(error)).toBeNull();
  });
  it('allows weekends without calling investments stale', () => {
    expect(
      isProviderUpdateOverdue(
        '2026-11-06T18:00:00Z',
        new Date('2026-11-09T18:00:00Z'),
        true,
      ),
    ).toBe(false);
    expect(
      isProviderUpdateOverdue(
        '2026-11-06T18:00:00Z',
        new Date('2026-11-11T18:00:00Z'),
        true,
      ),
    ).toBe(true);
  });
});

postgresSuite('Connection health migration', () => {
  it('adds and removes health columns without changing existing bank links', async () => {
    const fixture = await isolatedPostgres(
      'connection_health_migration',
      1794100000000,
    );
    try {
      const user = await fixture.database.getRepository(UserEntity).save(
        UserEntity.fromGoogleIdentity({
          email: `${randomUUID()}@fixture.test`,
          googleSubject: randomUUID(),
        }),
      );
      const id = randomUUID();
      await fixture.database.query(
        `INSERT INTO bank_link_entity (id, "userId", "providerName", authentication, "accountIds") VALUES ($1,$2,'plaid','{}','external')`,
        [id, user.id],
      );
      await fixture.database.runMigrations({ transaction: 'all' });
      const rows = await fixture.database.query(
        `SELECT health, "healthCheckedAt", "healthCheckStartedAt" FROM bank_link_entity WHERE id=$1`,
        [id],
      );
      expect(rows).toEqual([
        { health: null, healthCheckedAt: null, healthCheckStartedAt: null },
      ]);
      await fixture.database.undoLastMigration({ transaction: 'all' });
      expect(
        await fixture.database.query(
          `SELECT id FROM bank_link_entity WHERE id=$1`,
          [id],
        ),
      ).toEqual([{ id }]);
      const columns = await fixture.database.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='bank_link_entity' AND column_name IN ('health','healthCheckedAt','healthCheckStartedAt')`,
        [fixture.schema],
      );
      expect(columns).toEqual([]);
    } finally {
      await fixture.close();
    }
  }, 60_000);
});
