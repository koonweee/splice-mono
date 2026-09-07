import { createHash, randomUUID } from 'node:crypto';
import { isolatedPostgres, postgresSuite } from '../helpers/isolated-postgres';
import { NotificationService } from '../../src/notification/notification.service';
import { NotificationEntity } from '../../src/notification/notification.entity';
import { NotificationPushDeliveryEntity } from '../../src/notification/notification-push-delivery.entity';
import { PushSubscriptionEntity } from '../../src/notification/push-subscription.entity';
import { BrowserSessionService } from '../../src/auth/browser-session.service';
import { TransactionEntity } from '../../src/transaction/transaction.entity';
import { TransactionQueryService } from '../../src/transaction/transaction-query.service';
import { RefreshTokenEntity } from '../../src/auth/refresh-token.entity';
import { AccountEntity } from '../../src/account/account.entity';
import { MoneySign } from '../../src/types/MoneyWithSign';
import { UserEntity } from '../../src/user/user.entity';

postgresSuite(
  'Notification inbox and delivery boundaries in PostgreSQL',
  () => {
    let harness: Awaited<ReturnType<typeof isolatedPostgres>>;
    let service: NotificationService;
    let userId: string;
    let foreignUser: string;
    let sessions: BrowserSessionService;
    const adapter = {
      isConfigured: () => true,
      getPublicKey: () => 'synthetic',
      send: jest.fn(),
    };
    beforeAll(async () => {
      harness = await isolatedPostgres('notification_pwa');
      const db = harness.database;
      const owner = () =>
        db.getRepository(UserEntity).save(
          UserEntity.fromGoogleIdentity({
            email: `${randomUUID()}@example.test`,
            googleSubject: randomUUID(),
          }),
        );
      userId = (await owner()).id;
      foreignUser = (await owner()).id;
      sessions = new BrowserSessionService(db);
      service = new NotificationService(
        db.getRepository(NotificationEntity),
        db.getRepository(PushSubscriptionEntity),
        db.getRepository(NotificationPushDeliveryEntity),
        { enableDefaultNotificationsIfUnset: jest.fn() } as any,
        adapter as any,
        sessions,
        new TransactionQueryService(db.getRepository(TransactionEntity)),
      );
    }, 120000);
    afterAll(async () => {
      await harness?.close();
    });
    beforeEach(() => {
      adapter.send.mockReset();
      adapter.send.mockResolvedValue(undefined);
    });

    async function notification(
      owner = userId,
      type: NotificationEntity['type'] = 'transactions.new_synced',
    ) {
      const repo = harness.database.getRepository(NotificationEntity);
      return repo.save(
        repo.create({
          userId: owner,
          type,
          dedupeKey: randomUUID(),
          status: 'active',
          readAt: null,
          archivedAt: null,
          payload:
            type === 'bank_link.needs_attention'
              ? {
                  bankLinkId: randomUUID(),
                  providerName: 'Synthetic',
                  institutionName: 'Test bank',
                  status: 'ERROR',
                  statusBody: { private: 'never expose' },
                  occurredAt: new Date().toISOString(),
                }
              : {
                  count: 2,
                  transactionIds: [randomUUID()],
                  accountIds: [randomUUID()],
                  occurredAt: new Date().toISOString(),
                },
        }),
      );
    }
    async function delivery() {
      const db = harness.database;
      const session = await db.transaction((manager) =>
        sessions.createSession(
          manager,
          userId,
          new Date(Date.now() + 86400000),
        ),
      );
      const subRepo = db.getRepository(PushSubscriptionEntity);
      const subscription = await subRepo.save(
        subRepo.create({
          userId,
          endpoint: `https://push.example.test/${randomUUID()}`,
          p256dh: 'synthetic',
          auth: 'synthetic',
          revokedAt: null,
          sessionId: session.id,
          enrollmentId: randomUUID(),
          rebindRequired: false,
        }),
      );
      const item = await notification();
      const repo = db.getRepository(NotificationPushDeliveryEntity);
      const sent = await repo.save(
        repo.create({
          notificationId: item.id,
          subscriptionId: subscription.id,
          status: 'processing',
          claimToken: randomUUID(),
          attemptCount: 1,
          processingStartedAt: new Date(),
          availableAt: new Date(),
          sentAt: null,
          lastError: null,
        }),
      );
      return {
        session,
        subscription,
        item,
        delivery: await repo.findOneOrFail({
          where: { id: sent.id },
          relations: { notification: true, subscription: true },
        }),
      };
    }

    it('paginates equal and microsecond timestamps without duplicates and excludes private payload/test/foreign alerts', async () => {
      const first = await notification();
      const second = await notification();
      const bank = await notification(userId, 'bank_link.needs_attention');
      await notification(foreignUser);
      await notification(userId, 'system.test');
      const fixed = new Date(Date.now() - 1000)
        .toISOString()
        .replace(/\.\d{3}Z$/, '.123456Z');
      await harness.database.query(
        'UPDATE notification_entity SET "createdAt"=$1 WHERE id=ANY($2::uuid[])',
        [fixed, [first.id, second.id, bank.id]],
      );
      const page = await service.getInbox(userId, { pageSize: 1 });
      const ids = [page.items[0].id];
      let cursor = page.nextCursor;
      // An insert ahead of the cursor must not shift or repeat the remaining rows.
      const inserted = await notification();
      while (cursor) {
        const next = await service.getInbox(userId, { pageSize: 1, cursor });
        ids.push(...next.items.map((item) => item.id));
        cursor = next.nextCursor;
        expect(JSON.stringify(next)).not.toContain('statusBody');
        expect(JSON.stringify(next)).not.toContain('private');
      }
      expect(new Set(ids)).toEqual(new Set([first.id, second.id, bank.id]));
      expect(ids).not.toContain(inserted.id);
      await expect(
        service.getInbox(userId, { pageSize: 20, cursor: 'broken' }),
      ).rejects.toThrow('Invalid inbox cursor');
    });

    it('keeps reads/dismissals idempotent and scoped while summary counts remain independent', async () => {
      const item = await notification();
      const before = await service.getSummary(userId);
      await expect(service.markRead(foreignUser, item.id)).rejects.toThrow(
        'Notification not found',
      );
      await expect(service.archive(foreignUser, item.id)).rejects.toThrow(
        'Notification not found',
      );
      await service.markRead(userId, item.id);
      await service.markRead(userId, item.id);
      const read = await service.getSummary(userId);
      expect(read.unreadNotificationCount).toBe(
        before.unreadNotificationCount - 1,
      );
      expect(read.uncategorizedTransactionCount).toBe(
        before.uncategorizedTransactionCount,
      );
      await service.archive(userId, item.id);
      await service.archive(userId, item.id);
      expect(
        (await service.getInbox(userId, { pageSize: 100 })).items.map(
          (item) => item.id,
        ),
      ).not.toContain(item.id);
    });

    it('keeps both summary counts in one snapshot across a concurrent commit', async () => {
      const before = await service.getSummary(userId);
      const queries = (service as any)
        .transactionQueries as TransactionQueryService;
      const original = queries.countUncategorized.bind(queries);
      let release!: () => void;
      let entered!: () => void;
      const paused = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      const spy = jest
        .spyOn(queries, 'countUncategorized')
        .mockImplementationOnce(async (...args) => {
          const count = await original(...args);
          entered();
          await barrier;
          return count;
        });
      const reading = service.getSummary(userId);
      try {
        await paused;
        const inserted = await notification();
        release();
        const snapshot = await reading;
        expect(snapshot.unreadNotificationCount).toBe(
          before.unreadNotificationCount,
        );
        expect(snapshot.uncategorizedTransactionCount).toBe(
          before.uncategorizedTransactionCount,
        );
        expect(Date.parse(snapshot.computedAt)).toBeLessThanOrEqual(
          inserted.createdAt.getTime(),
        );
        expect((await service.getSummary(userId)).unreadNotificationCount).toBe(
          before.unreadNotificationCount + 1,
        );
      } finally {
        release();
        spy.mockRestore();
        await reading;
      }
    });

    it('rebinds only an authenticated owner and explicit disable cancels migration eligibility', async () => {
      const fixture = await delivery();
      const raw = randomUUID();
      await harness.database.getRepository(RefreshTokenEntity).save({
        token: createHash('sha256').update(raw).digest('hex'),
        userId,
        sessionId: fixture.session.id,
        expiresAt: new Date(Date.now() + 86400000),
        revoked: false,
      });
      const repository = harness.database.getRepository(PushSubscriptionEntity);
      const legacy = await repository.save(
        repository.create({
          userId,
          endpoint: `https://push.example.test/${randomUUID()}`,
          p256dh: 'synthetic',
          auth: 'synthetic',
          sessionId: null,
          enrollmentId: randomUUID(),
          rebindRequired: true,
          revokedAt: new Date(),
        }),
      );
      await expect(
        service.getCurrentSubscriptionStatus(userId, legacy.endpoint),
      ).rejects.toThrow('A browser session is required');
      await expect(
        service.getCurrentSubscriptionStatus(foreignUser, legacy.endpoint, raw),
      ).rejects.toThrow('A browser session is required');
      expect(
        await service.getCurrentSubscriptionStatus(
          userId,
          legacy.endpoint,
          raw,
        ),
      ).toMatchObject({
        subscribed: false,
        rebindRequired: true,
        enrollmentId: null,
      });
      await service.revokeCurrentPushSubscription(userId, legacy.endpoint);
      expect(
        await service.getCurrentSubscriptionStatus(
          userId,
          legacy.endpoint,
          raw,
        ),
      ).toMatchObject({ subscribed: false, rebindRequired: false });
      const registered = await service.registerPushSubscription(
        userId,
        {
          protocolVersion: 2,
          endpoint: legacy.endpoint,
          keys: { p256dh: 'synthetic', auth: 'synthetic' },
        },
        raw,
      );
      expect(
        await service.getEnrollmentEligibility(
          userId,
          registered.enrollmentId,
          raw,
        ),
      ).toEqual({ eligible: true });
      expect(
        await service.getEnrollmentEligibility(
          foreignUser,
          registered.enrollmentId,
          raw,
        ),
      ).toEqual({ eligible: false });
      expect(
        await service.getEnrollmentEligibility(
          userId,
          legacy.enrollmentId,
          raw,
        ),
      ).toEqual({ eligible: false });
      expect(
        await service.getEnrollmentEligibility(userId, registered.enrollmentId),
      ).toEqual({ eligible: false });
      expect(registered.enrollmentId).not.toBe(legacy.enrollmentId);
      expect(
        await service.getCurrentSubscriptionStatus(
          userId,
          legacy.endpoint,
          raw,
        ),
      ).toMatchObject({
        subscribed: true,
        rebindRequired: false,
        enrollmentId: registered.enrollmentId,
      });
    });

    it('revoked enrollments fail the live display eligibility check', async () => {
      const fixture = await delivery();
      const raw = randomUUID();
      await harness.database.getRepository(RefreshTokenEntity).save({
        token: createHash('sha256').update(raw).digest('hex'),
        userId,
        sessionId: fixture.session.id,
        expiresAt: new Date(Date.now() + 86400000),
        revoked: false,
      });
      expect(
        await service.getEnrollmentEligibility(
          userId,
          fixture.subscription.enrollmentId,
          raw,
        ),
      ).toEqual({ eligible: true });
      await sessions.revokeToken(raw);
      expect(
        await service.getEnrollmentEligibility(
          userId,
          fixture.subscription.enrollmentId,
          raw,
        ),
      ).toEqual({ eligible: false });
    });

    it('claims in parallel without sharing claims and sends a claim only once', async () => {
      const fixture = await delivery();
      await harness.database
        .getRepository(NotificationPushDeliveryEntity)
        .update(fixture.delivery.id, { status: 'pending', claimToken: null });
      const batches = await Promise.all([
        service.claimPendingPushDeliveries(25),
        service.claimPendingPushDeliveries(25),
      ]);
      const selected = batches
        .flat()
        .filter((item) => item.id === fixture.delivery.id);
      expect(selected).toHaveLength(1);
      expect(selected[0].claimToken).toEqual(expect.any(String));
      await Promise.all([
        service.sendPushDelivery(selected[0]),
        service.sendPushDelivery(selected[0]),
      ]);
      expect(adapter.send).toHaveBeenCalledTimes(1);
    });

    it('fences an old claimed copy after a lease is reclaimed', async () => {
      const fixture = await delivery();
      const repo = harness.database.getRepository(
        NotificationPushDeliveryEntity,
      );
      const outcomes = jest.spyOn((service as any).logger, 'log');
      const newClaim = randomUUID();
      await repo.update(fixture.delivery.id, { claimToken: newClaim });
      await service.sendPushDelivery(fixture.delivery);
      expect(adapter.send).not.toHaveBeenCalled();
      expect(
        (await repo.findOneByOrFail({ id: fixture.delivery.id })).claimToken,
      ).toBe(newClaim);
      expect(outcomes).toHaveBeenCalledWith(
        expect.objectContaining({
          deliveryId: fixture.delivery.id,
          outcome: 'stale_claim_ignored',
          attempt: 1,
          durationMs: expect.any(Number),
          backlogAgeMs: expect.any(Number),
        }),
        'Push delivery outcome',
      );
      expect(JSON.stringify(outcomes.mock.calls)).not.toContain(
        fixture.subscription.endpoint,
      );
      outcomes.mockRestore();
      const current = { ...fixture.delivery, claimToken: newClaim };
      await service.sendPushDelivery(current);
      expect(adapter.send).toHaveBeenCalledTimes(1);
      expect(adapter.send.mock.calls[0][1]).toMatchObject({
        version: 2,
        badgeCount: 0,
        enrollmentId: fixture.subscription.enrollmentId,
        body: '2 new uncategorized transactions were added',
      });
    });

    it('serializes competing sends and lets revocation finish after a failed bounded send', async () => {
      const fixture = await delivery();
      let release!: () => void;
      let entered!: () => void;
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      adapter.send.mockImplementationOnce(async () => {
        entered();
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        throw new Error('Push total deadline exceeded');
      });
      const sending = service.sendPushDelivery(fixture.delivery);
      await started;
      let revoked = false;
      const revoking = sessions.revokeAll(userId).then(() => {
        revoked = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(revoked).toBe(false);
      release();
      await Promise.all([sending, revoking]);
      expect(revoked).toBe(true);
      expect(
        (
          await harness.database
            .getRepository(PushSubscriptionEntity)
            .findOneByOrFail({ id: fixture.subscription.id })
        ).revokedAt,
      ).not.toBeNull();
      await service.sendPushDelivery(fixture.delivery);
      expect(adapter.send).toHaveBeenCalledTimes(1);
    });

    it('does not send expired or now-resolved connection alerts', async () => {
      for (const mode of ['expired', 'resolved']) {
        const fixture = await delivery();
        if (mode === 'expired')
          await harness.database
            .getRepository(NotificationEntity)
            .update(fixture.item.id, {
              createdAt: new Date(Date.now() - 2 * 86400000),
            });
        else
          await harness.database
            .getRepository(NotificationEntity)
            .update(fixture.item.id, {
              type: 'bank_link.needs_attention',
              payload: { bankLinkId: randomUUID() } as any,
            });
        await service.sendPushDelivery(fixture.delivery);
        expect(
          (
            await harness.database
              .getRepository(NotificationPushDeliveryEntity)
              .findOneByOrFail({ id: fixture.delivery.id })
          ).status,
        ).toBe('skipped');
      }
      expect(adapter.send).not.toHaveBeenCalled();
    });

    it('uses twelve outstanding rows for a two-row batch and preserves the total on tests', async () => {
      const money = {
        money: { amount: '0', currency: 'USD' },
        sign: MoneySign.POSITIVE,
      };
      const account = await harness.database.getRepository(AccountEntity).save(
        AccountEntity.fromDto(
          {
            name: 'Synthetic',
            type: 'depository',
            currentBalance: money,
            availableBalance: money,
          } as any,
          userId,
        ),
      );
      for (let index = 0; index < 12; index++) {
        const id = randomUUID();
        await harness.database.query(
          `INSERT INTO account_activity_entity (id,"userId","accountId",provider,"externalActivityId","activityKind","activityDate","providerDate","amountAmount","amountCurrency","amountSign") VALUES ($1,$2,$3,'plaid',$4,'banking_transaction','2026-09-05','2026-09-05','1','USD','negative')`,
          [id, userId, account.id, randomUUID()],
        );
        await harness.database.query(
          `INSERT INTO banking_transaction_entity ("activityId",source,pending) VALUES ($1,'provider',false)`,
          [id],
        );
      }
      const fixture = await delivery();
      await service.sendPushDelivery(fixture.delivery);
      expect(adapter.send.mock.calls[0][1]).toMatchObject({
        badgeCount: 12,
        body: '2 new uncategorized transactions were added',
      });
      const test = await delivery();
      await harness.database
        .getRepository(NotificationEntity)
        .update(test.item.id, { type: 'system.test' });
      await service.sendPushDelivery(test.delivery);
      expect(adapter.send.mock.calls[1][1]).toMatchObject({
        badgeCount: 12,
        body: 'Push notifications are working.',
      });
      expect(
        (await service.getSummary(userId)).uncategorizedTransactionCount,
      ).toBe(12);
    });
  },
);
