import { BalanceSnapshotType } from '../../src/types/BalanceSnapshot';
import { randomUUID } from 'node:crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AccountEntity } from '../../src/account/account.entity';
import { BalanceSnapshotEntity } from '../../src/balance-snapshot/balance-snapshot.entity';
import { BankLinkEntity } from '../../src/bank-link/bank-link.entity';
import { BankLinkService } from '../../src/bank-link/bank-link.service';
import { BankLinkHealthService } from '../../src/bank-link/bank-link-health.service';
import { UserEntity } from '../../src/user/user.entity';
import type { APIAccount } from '../../src/types/BankLink';
import { isolatedPostgres, postgresSuite } from '../helpers/isolated-postgres';
import { mockCreateAccountDto } from '../mocks/account/account.mock';

postgresSuite('Reconnect identity persistence', () => {
  let fixture: Awaited<ReturnType<typeof isolatedPostgres>>;
  let service: BankLinkService;
  let link: BankLinkEntity;
  let account: AccountEntity;
  let returned: APIAccount[];
  const events = new EventEmitter2();
  const createPending = jest.fn();
  const provider = {
    getAccounts: jest.fn(async () => ({ accounts: returned })),
    getConnectionHealth: jest.fn(async () => ({
      externalAccountIds: returned.map((a) => a.accountId),
      issue: null,
      providerUpdates: [],
    })),
    initiateLinking: jest.fn(async () => ({
      webhookId: 'fixture-link',
      linkUrl: 'https://example.test/link',
    })),
  };
  const pending = () => ({
    mode: 'update-bank-link' as const,
    bankLinkId: link.id,
    target: { accountId: account.id, externalAccountId: 'old' },
  });
  const api = (accountId: string): APIAccount => ({
    accountId,
    name: 'Provider-renamed account',
    mask: '9999',
    type: 'depository' as APIAccount['type'],
    subType: 'checking' as APIAccount['subType'],
    currentBalance: mockCreateAccountDto.currentBalance,
    availableBalance: mockCreateAccountDto.availableBalance,
  });
  const saved = () =>
    fixture.database
      .getRepository(AccountEntity)
      .findOneByOrFail({ id: account.id });
  beforeAll(async () => {
    fixture = await isolatedPostgres('reconnect_identity');
    const registry = { getProvider: () => provider };
    const health = new BankLinkHealthService(
      fixture.database.getRepository(BankLinkEntity),
      fixture.database.getRepository(AccountEntity),
      registry as never,
      events,
    );
    service = new BankLinkService(
      fixture.database.getRepository(BankLinkEntity),
      registry as never,
      { createPending } as never,
      fixture.database.getRepository(AccountEntity),
      events,
      { getProviderDetails: async () => undefined } as never,
      {} as never,
      {} as never,
      health,
    );
  }, 60000);
  afterAll(async () => fixture?.close());
  beforeEach(async () => {
    createPending.mockClear();
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
          authentication: { accessToken: randomUUID() },
          accountIds: ['old'],
        },
        user.id,
      ),
    );
    await fixture.database
      .getRepository(BankLinkEntity)
      .update(link.id, { status: 'ERROR' });
    account = await fixture.database.getRepository(AccountEntity).save(
      AccountEntity.fromDto(
        {
          ...mockCreateAccountDto,
          name: 'Original provider name',
          mask: '1234',
          customName: 'Keep my label',
          notes: 'Keep my notes',
          expectedValuePercent: '93',
          expectedTaxPercent: '17',
          externalAccountId: 'old',
          bankLinkId: link.id,
        },
        user.id,
      ),
    );
    returned = [api('new')];
  });
  it('captures a validated account and its current binding in the persisted reconnect session', async () => {
    await service.initiateLinking(
      'plaid',
      link.userId,
      undefined,
      undefined,
      undefined,
      link.id,
      undefined,
      account.id,
    );
    expect(createPending).toHaveBeenCalledWith(
      'fixture-link',
      'plaid',
      link.userId,
      undefined,
      pending(),
    );
    expect(service['parseLinkFlowContext'](pending())).toEqual(pending());
  });
  it('rejects a target outside the authenticated user/connection before creating a session', async () => {
    await expect(
      service.initiateLinking(
        'plaid',
        link.userId,
        undefined,
        undefined,
        undefined,
        link.id,
        undefined,
        randomUUID(),
      ),
    ).rejects.toThrow('not active');
    expect(createPending).not.toHaveBeenCalled();
  });
  it('preserves account UUID, historical snapshots and user settings across name/mask/ID changes', async () => {
    const snapshots = fixture.database.getRepository(BalanceSnapshotEntity);
    const snapshot = await snapshots.save(
      BalanceSnapshotEntity.fromDto(
        {
          accountId: account.id,
          snapshotDate: '2026-11-01',
          snapshotType: BalanceSnapshotType.SYNC,
          currentBalance: mockCreateAccountDto.currentBalance,
          availableBalance: mockCreateAccountDto.availableBalance,
        },
        link.userId,
      ),
    );
    await service['completeBankLinkUpdate'](link.id, link.userId, pending());
    expect(await saved()).toMatchObject({
      id: account.id,
      externalAccountId: 'new',
      customName: 'Keep my label',
      notes: 'Keep my notes',
      expectedValuePercent: '93',
      expectedTaxPercent: '17',
    });
    expect(await snapshots.findOneByOrFail({ id: snapshot.id })).toEqual(
      snapshot,
    );
    expect(
      await fixture.database
        .getRepository(AccountEntity)
        .countBy({ bankLinkId: link.id }),
    ).toBe(1);
    expect(
      await fixture.database
        .getRepository(BankLinkEntity)
        .findOneByOrFail({ id: link.id }),
    ).toMatchObject({
      accountIds: ['new'],
      status: 'OK',
      health: { state: 'healthy' },
    });
  });
  it('supports old single-account sessions without target metadata', async () => {
    await service['completeBankLinkUpdate'](link.id, link.userId, {
      mode: 'update-bank-link',
      bankLinkId: link.id,
    });
    expect((await saved()).externalAccountId).toBe('new');
  });
  it('does not infer identity replacements during ordinary background account sync', async () => {
    await expect(service.syncAccounts(link.id, link.userId)).rejects.toThrow(
      'no longer exposes',
    );
    expect((await saved()).externalAccountId).toBe('old');
  });
  it('rejects multiple returned replacement candidates without creating or modifying accounts', async () => {
    returned.push(api('another'));
    await expect(
      service.syncAccounts(link.id, link.userId, pending()),
    ).rejects.toThrow('unambiguously');
    expect((await saved()).externalAccountId).toBe('old');
    expect(
      await fixture.database
        .getRepository(AccountEntity)
        .countBy({ bankLinkId: link.id }),
    ).toBe(1);
  });
  it('replaces the selected identity only when all sibling identities are accounted for', async () => {
    const sibling = await fixture.database.getRepository(AccountEntity).save(
      AccountEntity.fromDto(
        {
          ...mockCreateAccountDto,
          externalAccountId: 'sibling',
          bankLinkId: link.id,
        },
        link.userId,
      ),
    );
    returned.push(api('sibling'));
    await service.syncAccounts(link.id, link.userId, pending());
    expect((await saved()).externalAccountId).toBe('new');
    expect(
      (
        await fixture.database
          .getRepository(AccountEntity)
          .findOneByOrFail({ id: sibling.id })
      ).externalAccountId,
    ).toBe('sibling');
  });
  it('serializes concurrent reconnects without duplicating accounts or rewinding the binding', async () => {
    await Promise.all([
      service.syncAccounts(link.id, link.userId, pending()),
      service.syncAccounts(link.id, link.userId, pending()),
    ]);
    expect((await saved()).externalAccountId).toBe('new');
    expect(
      await fixture.database
        .getRepository(AccountEntity)
        .countBy({ bankLinkId: link.id }),
    ).toBe(1);
  });
  it('rolls back the identity if the atomic link-cache update fails', async () => {
    await fixture.database.query(
      `CREATE FUNCTION fail_reconnect_cache() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."accountIds" <> OLD."accountIds" THEN RAISE EXCEPTION 'fixture cache failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_reconnect_cache BEFORE UPDATE ON bank_link_entity FOR EACH ROW EXECUTE FUNCTION fail_reconnect_cache();`,
    );
    try {
      await expect(
        service.syncAccounts(link.id, link.userId, pending()),
      ).rejects.toThrow('fixture cache failure');
      expect((await saved()).externalAccountId).toBe('old');
    } finally {
      await fixture.database.query(
        'DROP TRIGGER fail_reconnect_cache ON bank_link_entity; DROP FUNCTION fail_reconnect_cache();',
      );
    }
  });
});
