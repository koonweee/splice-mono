import { randomUUID } from 'node:crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AccountEntity } from '../../src/account/account.entity';
import { AccountService } from '../../src/account/account.service';
import { BalanceSnapshotEntity } from '../../src/balance-snapshot/balance-snapshot.entity';
import { BankLinkEntity } from '../../src/bank-link/bank-link.entity';
import { BankLinkDisconnectService } from '../../src/bank-link/bank-link-disconnect.service';
import { BankLinkService } from '../../src/bank-link/bank-link.service';
import { BANK_LINK_LIFECYCLE_TRANSACTION_LOCK_SQL } from '../../src/bank-link/bank-link-lifecycle-lock';
import { UserEntity } from '../../src/user/user.entity';
import { isolatedPostgres, postgresSuite } from '../helpers/isolated-postgres';
import { mockCreateAccountDto } from '../mocks/account/account.mock';

postgresSuite('Plaid archive disconnect on PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof isolatedPostgres>>;
  let accounts: AccountService;
  let worker: BankLinkDisconnectService;
  let link: BankLinkEntity;
  let user: UserEntity;
  let account: AccountEntity;
  const plaid = { disconnect: jest.fn() };
  const timezones = { getTimezone: jest.fn().mockResolvedValue('UTC') };
  beforeAll(async () => {
    fixture = await isolatedPostgres('plaid_disconnect');
    const db = fixture.database;
    accounts = new AccountService(
      db.getRepository(AccountEntity),
      db.getRepository(BalanceSnapshotEntity),
      db.getRepository(BankLinkEntity),
      new EventEmitter2(),
      timezones as never,
    );
    worker = new BankLinkDisconnectService(
      db.getRepository(BankLinkEntity),
      plaid as never,
    );
  }, 60_000);
  afterAll(async () => fixture?.close());
  beforeEach(async () => {
    plaid.disconnect.mockReset().mockResolvedValue(undefined);
    timezones.getTimezone.mockReset().mockResolvedValue('UTC');
    const db = fixture.database;
    user = await db.getRepository(UserEntity).save(
      UserEntity.fromGoogleIdentity({
        email: `${randomUUID()}@fixture.test`,
        googleSubject: randomUUID(),
      }),
    );
    link = await db.getRepository(BankLinkEntity).save(
      BankLinkEntity.fromDto(
        {
          providerName: 'plaid',
          authentication: { itemId: randomUUID(), accessToken: randomUUID() },
          accountIds: ['external'],
        },
        user.id,
      ),
    );
    account = await db.getRepository(AccountEntity).save(
      AccountEntity.fromDto(
        {
          ...mockCreateAccountDto,
          bankLinkId: link.id,
          externalAccountId: 'external',
        },
        user.id,
      ),
    );
  });
  const stored = () =>
    fixture.database
      .getRepository(BankLinkEntity)
      .findOneByOrFail({ id: link.id });

  it('rolls back the account archive if its snapshot cannot be saved', async () => {
    timezones.getTimezone.mockRejectedValueOnce(new Error('snapshot failure'));
    await expect(accounts.archive(account.id, user.id)).rejects.toThrow(
      'snapshot failure',
    );
    expect(
      (
        await fixture.database
          .getRepository(AccountEntity)
          .findOneByOrFail({ id: account.id })
      ).archivedAt,
    ).toBeNull();
    expect((await stored()).disconnectRequestedAt).toBeNull();
  });

  it('drains queued requests through the scheduled worker query', async () => {
    await accounts.archive(account.id, user.id);
    await worker.processPending();
    expect((await stored()).disconnectedAt).toBeInstanceOf(Date);
    expect(plaid.disconnect).toHaveBeenCalledTimes(1);
  });

  it('serializes concurrent final-account archives and queues a single disconnect', async () => {
    const other = await fixture.database.getRepository(AccountEntity).save(
      AccountEntity.fromDto(
        {
          ...mockCreateAccountDto,
          bankLinkId: link.id,
          externalAccountId: 'other',
        },
        user.id,
      ),
    );
    await Promise.all([
      accounts.archive(account.id, user.id),
      accounts.archive(other.id, user.id),
    ]);
    expect((await stored()).disconnectRequestedAt).toBeInstanceOf(Date);
    await Promise.all([worker.disconnect(link.id), worker.disconnect(link.id)]);
    expect(plaid.disconnect).toHaveBeenCalledTimes(1);
    expect((await stored()).authentication).toEqual({
      itemId: link.authentication.itemId,
    });
    expect((await stored()).disconnectedAt).toBeInstanceOf(Date);
  });

  it('retries remote success after a failed database commit', async () => {
    await accounts.archive(account.id, user.id);
    await fixture.database.query(
      `CREATE FUNCTION fail_disconnect_save() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = '${link.id}'::uuid AND NEW."disconnectedAt" IS NOT NULL THEN RAISE EXCEPTION 'simulated commit failure'; END IF; RETURN NEW; END $$`,
    );
    await fixture.database.query(
      'CREATE TRIGGER fail_disconnect BEFORE UPDATE ON bank_link_entity FOR EACH ROW EXECUTE FUNCTION fail_disconnect_save()',
    );
    try {
      await expect(worker.disconnect(link.id)).rejects.toThrow(
        'simulated commit failure',
      );
      expect((await stored()).authentication.accessToken).toBe(
        link.authentication.accessToken,
      );
      expect((await stored()).disconnectedAt).toBeNull();
    } finally {
      await fixture.database.query(
        'DROP TRIGGER fail_disconnect ON bank_link_entity',
      );
      await fixture.database.query('DROP FUNCTION fail_disconnect_save()');
    }
    // Provider-level tests verify that ITEM_NOT_FOUND resolves on this retry.
    await worker.disconnect(link.id);
    expect(plaid.disconnect).toHaveBeenCalledTimes(2);
    expect((await stored()).disconnectedAt).toBeInstanceOf(Date);
  });

  it('does not remove an Item shared by an active connection', async () => {
    await accounts.archive(account.id, user.id);
    await fixture.database.getRepository(BankLinkEntity).save(
      BankLinkEntity.fromDto(
        {
          providerName: 'plaid',
          authentication: link.authentication,
          accountIds: [],
        },
        user.id,
      ),
    );
    await worker.disconnect(link.id);
    expect(plaid.disconnect).not.toHaveBeenCalled();
    expect((await stored()).authentication.accessToken).toBeTruthy();
  });

  it('respects a lifecycle lock and refuses reactivation after disconnect was queued', async () => {
    await accounts.archive(account.id, user.id);
    await fixture.database.transaction(async (manager) => {
      await manager.query(BANK_LINK_LIFECYCLE_TRANSACTION_LOCK_SQL, [link.id]);
      await worker.disconnect(link.id);
      expect(plaid.disconnect).not.toHaveBeenCalled();
    });
    const service = new BankLinkService(
      fixture.database.getRepository(BankLinkEntity),
      {} as never,
      {} as never,
      fixture.database.getRepository(AccountEntity),
      new EventEmitter2(),
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      service['saveBankLinkFromLinkCompletionResponse']('plaid', user.id, {
        authentication: link.authentication,
        accounts: [],
      }),
    ).rejects.toThrow('disconnecting');
    await worker.disconnect(link.id);
    expect((await stored()).disconnectedAt).toBeInstanceOf(Date);
  });
});
