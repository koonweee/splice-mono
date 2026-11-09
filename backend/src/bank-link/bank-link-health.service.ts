import { getPostgresMutationAffectedCount } from '../common/postgres-mutation-result';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AccountEntity } from '../account/account.entity';
import {
  BankLinkEvents,
  BankLinkNeedsAttentionEvent,
} from '../events/bank-link.events';
import type {
  BankLinkHealth,
  ConnectionIssue,
  ProviderConnectionHealth,
} from '../types/BankLinkHealth';
import { BankLinkEntity } from './bank-link.entity';
import { BANK_LINK_LIFECYCLE_TRANSACTION_LOCK_SQL } from './bank-link-lifecycle-lock';
import {
  getConnectionIssue,
  isProviderUpdateOverdue,
  MissingProviderAccountsError,
} from './providers/plaid/plaid-connection-health';
import { ProviderRegistry } from './providers/provider.registry';

const CHECK_CACHE_MS = 60 * 60 * 1000;
const CHECK_LEASE_MS = 5 * 60 * 1000;
const STALE_ACCOUNT_DAYS = 7;

type CheckResult = {
  checked: boolean;
  changed: boolean;
  health: BankLinkHealth | null;
};
type ImportState = { lastImportedAt: string | null; stalled: boolean };

@Injectable()
export class BankLinkHealthService {
  private readonly logger = new Logger(BankLinkHealthService.name);

  constructor(
    @InjectRepository(BankLinkEntity)
    private readonly links: Repository<BankLinkEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    private readonly providers: ProviderRegistry,
    private readonly events: EventEmitter2,
  ) {}

  private activeAccounts(link: BankLinkEntity): Promise<AccountEntity[]> {
    return this.accounts.find({
      where: { bankLinkId: link.id, userId: link.userId, archivedAt: IsNull() },
    });
  }

  async validateAccounts(
    link: BankLinkEntity,
    returnedIds: string[],
    investmentOnly = false,
  ): Promise<void> {
    const expected = (await this.activeAccounts(link)).filter(
      (account) =>
        !investmentOnly || ['investment', 'brokerage'].includes(account.type),
    );
    if (
      expected.some(
        (account) =>
          account.externalAccountId &&
          !returnedIds.includes(account.externalAccountId),
      )
    ) {
      throw new MissingProviderAccountsError();
    }
  }

  /** Observe real provider failures without swallowing the original sync failure. */
  async recordSyncFailure(link: BankLinkEntity, error: unknown): Promise<void> {
    if (link.providerName !== 'plaid') return;
    const issue = getConnectionIssue(error);
    if (!issue) return;
    const now = new Date();
    await this.apply(link, this.issueHealth(issue, now), issue);
  }

  private issueHealth(issue: ConnectionIssue, now: Date): BankLinkHealth {
    return {
      state: 'needs_attention',
      reason: issue.reason,
      message: issue.message,
      checkedAt: now.toISOString(),
      lastImportedAt: null,
      providerUpdates: [],
    };
  }

  async check(
    bankLinkId: string,
    userId: string,
    options: { force?: boolean; afterReconnect?: boolean } = {},
  ): Promise<CheckResult> {
    const link = await this.links.findOne({
      where: { id: bankLinkId, userId, archivedAt: IsNull() },
    });
    if (!link) throw new NotFoundException('Bank connection not found');
    const provider = this.providers.getProvider(link.providerName);
    if (!provider.getConnectionHealth)
      return { checked: false, changed: false, health: link.health ?? null };
    const startedAt = new Date();
    const cacheMs = options.afterReconnect
      ? 0
      : options.force
        ? 60 * 1000
        : CHECK_CACHE_MS;
    const claimed: unknown = await this.links.query(
      `
      UPDATE bank_link_entity SET "healthCheckStartedAt" = $3
      WHERE id = $1 AND "userId" = $2 AND "archivedAt" IS NULL
        AND ($6 OR "healthCheckStartedAt" IS NULL OR "healthCheckStartedAt" < $4)
        AND ($6 OR "healthCheckedAt" IS NULL OR "healthCheckedAt" < $5)
      RETURNING id`,
      [
        bankLinkId,
        userId,
        startedAt,
        new Date(startedAt.getTime() - CHECK_LEASE_MS),
        new Date(startedAt.getTime() - cacheMs),
        options.afterReconnect ?? false,
      ],
    );
    if (getPostgresMutationAffectedCount(claimed) === 0)
      return { checked: false, changed: false, health: link.health ?? null };

    let snapshot: ProviderConnectionHealth;
    try {
      snapshot = await provider.getConnectionHealth(link.authentication);
    } catch (error) {
      const issue = getConnectionIssue(error);
      if (issue) {
        snapshot = { externalAccountIds: [], issue, providerUpdates: [] };
      } else {
        // Transient errors never prescribe reconnect or erase an existing error.
        const health: BankLinkHealth = {
          state: 'unknown',
          reason: 'check_failed',
          message: 'Connection check unavailable. Try again later.',
          checkedAt: startedAt.toISOString(),
          lastImportedAt: null,
          providerUpdates: [],
        };
        const changed = await this.apply(link, health, null, startedAt, false);
        this.logger.warn({ bankLinkId }, 'Connection health check unavailable');
        return { checked: true, changed, health };
      }
    }
    let issue = snapshot.issue;
    if (!issue) {
      try {
        await this.validateAccounts(link, snapshot.externalAccountIds);
      } catch (error) {
        issue = getConnectionIssue(error);
        if (!issue) throw error;
      }
    }
    const imports = await this.importState(link);
    const health = issue
      ? this.issueHealth(issue, startedAt)
      : await this.availableHealth(link, snapshot, imports, startedAt);
    health.providerUpdates = snapshot.providerUpdates;
    health.lastImportedAt = imports.lastImportedAt;
    const changed = await this.apply(
      link,
      health,
      issue,
      startedAt,
      options.afterReconnect ?? false,
      snapshot.externalAccountIds,
    );
    return { checked: true, changed, health };
  }

  private async importState(link: BankLinkEntity): Promise<ImportState> {
    const rows: Array<{ lastImportedAt: string | null; stalled: boolean }> =
      await this.links.query(
        `
      SELECT (SELECT MAX(s."updatedAt") FROM balance_snapshot_entity s
        JOIN account_entity a ON a.id=s."accountId"
        WHERE a."bankLinkId"=$1 AND a."userId"=$2 AND a."archivedAt" IS NULL AND s."snapshotType"='SYNC') AS "lastImportedAt",
        EXISTS (SELECT 1 FROM investment_sync_state_entity i WHERE i."bankLinkId"=$1 AND i."userId"=$2
          AND i."requestedGeneration">i."completedGeneration" AND i."updatedAt" < now()-interval '6 hours') AS stalled`,
        [link.id, link.userId],
      );
    const value = rows[0];
    return {
      lastImportedAt: value?.lastImportedAt
        ? new Date(value.lastImportedAt).toISOString()
        : null,
      stalled: value?.stalled ?? false,
    };
  }

  private async availableHealth(
    link: BankLinkEntity,
    snapshot: ProviderConnectionHealth,
    imports: ImportState,
    now: Date,
  ): Promise<BankLinkHealth> {
    const accounts = await this.activeAccounts(link);
    const investment = accounts.some((account) =>
      ['investment', 'brokerage'].includes(account.type),
    );
    const banking = accounts.some(
      (account) => !['investment', 'brokerage'].includes(account.type),
    );
    const overdue = snapshot.providerUpdates.some(
      (update) =>
        ((update.product === 'investments' && investment) ||
          (update.product === 'transactions' && banking)) &&
        isProviderUpdateOverdue(
          update.lastSuccessfulUpdateAt,
          now,
          update.product === 'investments',
        ),
    );
    const reason = imports.stalled
      ? 'import_delayed'
      : overdue
        ? 'provider_delayed'
        : null;
    return {
      state: reason ? 'delayed' : 'healthy',
      reason,
      message: imports.stalled
        ? 'A previous investment import has not completed. Retry syncing this connection.'
        : overdue
          ? 'The provider has not completed a recent update. Account access is available.'
          : 'The linked accounts are accessible.',
      checkedAt: now.toISOString(),
      lastImportedAt: imports.lastImportedAt,
      providerUpdates: snapshot.providerUpdates,
    };
  }

  /** Serialize health with archiving/reconnects; an older probe cannot replace a newer result. */
  private async apply(
    original: BankLinkEntity,
    health: BankLinkHealth,
    issue: ConnectionIssue | null,
    claim?: Date,
    afterReconnect = false,
    returnedIds?: string[],
  ): Promise<boolean> {
    let notification: BankLinkNeedsAttentionEvent | undefined;
    const changed = await this.links.manager.transaction(async (manager) => {
      await manager.query(BANK_LINK_LIFECYCLE_TRANSACTION_LOCK_SQL, [
        original.id,
      ]);
      const repository = manager.getRepository(BankLinkEntity);
      const link = await repository.findOne({
        where: {
          id: original.id,
          userId: original.userId,
          archivedAt: IsNull(),
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!link || link.disconnectRequestedAt || link.disconnectedAt)
        return false;
      if (
        link.statusDate.getTime() !== original.statusDate.getTime() ||
        link.authentication.accessToken !== original.authentication.accessToken
      )
        return false;
      if (claim && link.healthCheckStartedAt?.getTime() !== claim.getTime())
        return false;
      const accounts = await manager.getRepository(AccountEntity).find({
        where: {
          bankLinkId: link.id,
          userId: link.userId,
          archivedAt: IsNull(),
        },
      });
      if (!accounts.length) return false;
      // Recheck current membership under the lifecycle lock after remote I/O.
      if (
        !issue &&
        returnedIds &&
        accounts.some(
          (account) =>
            account.externalAccountId &&
            !returnedIds.includes(account.externalAccountId),
        )
      ) {
        issue = getConnectionIssue(new MissingProviderAccountsError());
        if (issue)
          health = {
            ...health,
            ...this.issueHealth(issue, new Date(health.checkedAt)),
            providerUpdates: health.providerUpdates,
            lastImportedAt: health.lastImportedAt,
          };
      }
      const status = issue
        ? issue.reason === 'consent_required'
          ? 'PENDING_REAUTH'
          : 'ERROR'
        : (afterReconnect || getConnectionIssue(link.statusBody) !== null) &&
            (health.state === 'healthy' || health.state === 'delayed')
          ? 'OK'
          : link.status;
      const issueChanged =
        issue && getConnectionIssue(link.statusBody)?.reason !== issue.reason;
      const transition =
        status !== link.status || Boolean(issue && issueChanged);
      const statusDate =
        transition || afterReconnect ? new Date() : link.statusDate;
      const statusBody = issue
        ? {
            error_code: issue.code,
            error_message: issue.message,
            suggested_action:
              'Reconnect and review the accounts shared with Splice.',
          }
        : status === 'OK'
          ? null
          : link.statusBody;
      const changedHealth =
        link.health?.state !== health.state ||
        link.health?.reason !== health.reason ||
        transition;
      await repository.update(
        { id: link.id, userId: link.userId },
        {
          health,
          healthCheckedAt: new Date(health.checkedAt),
          healthCheckStartedAt: null,
          status,
          statusDate,
          statusBody,
        },
      );
      if (issue && transition) {
        notification = new BankLinkNeedsAttentionEvent(
          link.userId,
          link.id,
          link.providerName,
          link.institutionName,
          status === 'PENDING_REAUTH' ? 'PENDING_REAUTH' : 'ERROR',
          statusBody,
          statusDate.toISOString(),
          accounts.map(
            (account) =>
              account.customName ??
              account.name ??
              (account.mask ? `Account …${account.mask}` : 'Linked account'),
          ),
        );
      }
      return changedHealth;
    });
    if (notification)
      await this.events.emitAsync(BankLinkEvents.NEEDS_ATTENTION, notification);
    return changed;
  }

  /** User reads request stale candidates; the daily sweep includes every active link. */
  async checkConnections(
    userId?: string,
    onlyStale = false,
  ): Promise<{ checked: number; changed: boolean }> {
    const links: Array<{ id: string; userId: string }> = await this.links.query(
      `
      SELECT b.id,b."userId" FROM bank_link_entity b
      WHERE b."providerName"='plaid' AND b."archivedAt" IS NULL AND b."disconnectRequestedAt" IS NULL
        AND ($1::uuid IS NULL OR b."userId"=$1)
        AND EXISTS (SELECT 1 FROM account_entity a WHERE a."bankLinkId"=b.id AND a."archivedAt" IS NULL)
        AND (NOT $2 OR b.status <> 'OK' OR b.health->>'state' IN ('delayed','unknown') OR EXISTS (
          SELECT 1 FROM account_entity a WHERE a."bankLinkId"=b.id AND a."archivedAt" IS NULL AND NOT EXISTS (
            SELECT 1 FROM balance_snapshot_entity s WHERE s."accountId"=a.id AND s."snapshotType"='SYNC' AND s."updatedAt">now()-$3::int*interval '1 day')))
      ORDER BY b."healthCheckedAt" NULLS FIRST,b.id`,
      [userId ?? null, onlyStale, STALE_ACCOUNT_DAYS],
    );
    let checked = 0;
    let changed = false;
    for (const link of links) {
      try {
        const result = await this.check(link.id, link.userId);
        checked += Number(result.checked);
        changed ||= result.changed;
      } catch {
        this.logger.warn(
          { bankLinkId: link.id },
          'Unable to check bank connection',
        );
      }
    }
    return { checked, changed };
  }
}
