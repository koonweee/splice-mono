import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import { AccountActivityEntity } from '../account-activity/account-activity.entity';
import { AccountEntity } from '../account/account.entity';
import { BankLinkEntity } from '../bank-link/bank-link.entity';
import type {
  InvestmentActivity,
  InvestmentActivityQuery,
  InvestmentHoldingsResponse,
  InvestmentHoldingsSyncResult,
  InvestmentTransactionsSyncResult,
  PaginatedInvestmentActivityResponse,
  ProviderInvestmentHoldingsResponse,
  ProviderInvestmentSecurity,
  ProviderInvestmentTransactionsResponse,
} from '../types/Investment';
import { InvestmentHoldingSnapshotEntity } from './investment-holding-snapshot.entity';
import { InvestmentSecurityEntity } from './investment-security.entity';
import { InvestmentTransactionEntity } from './investment-transaction.entity';
import { HoldingsQueryService } from './holdings-query.service';
import { investmentWriteValues } from './investment-write-values';
import {
  InvestmentSyncStateEntity,
  type InvestmentSyncKind,
  type InvestmentSyncToken,
} from './investment-sync-state.entity';

const WRITE_CHUNK_SIZE = 300;

@Injectable()
export class InvestmentService {
  private readonly logger = new Logger(InvestmentService.name);

  constructor(
    @InjectRepository(InvestmentSecurityEntity)
    private readonly securityRepository: Repository<InvestmentSecurityEntity>,
    @InjectRepository(InvestmentHoldingSnapshotEntity)
    private readonly holdingRepository: Repository<InvestmentHoldingSnapshotEntity>,
    @InjectRepository(InvestmentTransactionEntity)
    private readonly transactionRepository: Repository<InvestmentTransactionEntity>,
    @InjectRepository(AccountEntity)
    private readonly accountRepository: Repository<AccountEntity>,
    private readonly dataSource: DataSource,
    private readonly holdingsQueryService: HoldingsQueryService,
  ) {}

  async beginProviderSync(
    userId: string,
    bankLinkId: string,
    kind: InvestmentSyncKind,
  ): Promise<InvestmentSyncToken> {
    return this.dataSource.transaction(async (manager) => {
      await this.lockBankLink(manager, userId, bankLinkId);
      const rows: Array<{ requestedGeneration: string }> = await manager.query(
        `
        INSERT INTO investment_sync_state_entity ("userId","bankLinkId",kind,"requestedGeneration") VALUES ($1,$2,$3,1)
        ON CONFLICT ("bankLinkId",kind) DO UPDATE SET "requestedGeneration"=investment_sync_state_entity."requestedGeneration"+1,"updatedAt"=now()
        RETURNING "requestedGeneration"::text`,
        [userId, bankLinkId, kind],
      );
      return { bankLinkId, kind, generation: rows[0].requestedGeneration };
    });
  }

  async upsertPlaidHoldings(
    userId: string,
    accountIdMap: Map<string, string>,
    snapshotDate: string,
    response: ProviderInvestmentHoldingsResponse,
    token: InvestmentSyncToken,
  ): Promise<InvestmentHoldingsSyncResult> {
    return this.applyProviderSync(
      userId,
      accountIdMap,
      response.externalAccountIds,
      token,
      'holdings',
      async (manager, mappedAccountIds) => {
        const securityMap = await this.upsertSecurities(
          manager,
          userId,
          response.securities,
        );
        const uniqueHoldings = new Map(
          response.holdings.map((holding) => [
            `${holding.externalAccountId}:${holding.externalSecurityId}`,
            holding,
          ]),
        );
        const declared = new Set(response.externalAccountIds);
        for (const holding of uniqueHoldings.values()) {
          if (
            !declared.has(holding.externalAccountId) ||
            !accountIdMap.has(holding.externalAccountId) ||
            !securityMap.has(holding.externalSecurityId)
          ) {
            throw new BadRequestException(
              'Investment holdings response references an unknown account or security',
            );
          }
        }
        const headerRows: Array<{ id: string; accountId: string }> =
          mappedAccountIds.length
            ? await manager.query(
                `
        INSERT INTO holdings_snapshot_header_entity ("userId","accountId",provider,"snapshotDate","completedAt")
        SELECT $1, id, 'plaid', $3::date, now() FROM unnest($2::uuid[]) id
        ON CONFLICT ("accountId",provider,"snapshotDate") DO UPDATE SET revision=holdings_snapshot_header_entity.revision+1,"completedAt"=now(),"updatedAt"=now()
        RETURNING id,"accountId"`,
                [userId, mappedAccountIds, snapshotDate],
              )
            : [];
        const headers = new Map(
          headerRows.map((row) => [row.accountId, row.id]),
        );
        const holdings = [...uniqueHoldings.values()].map((providerHolding) => {
          const accountId = accountIdMap.get(
            providerHolding.externalAccountId,
          )!;
          const security = securityMap.get(providerHolding.externalSecurityId)!;
          const holding = InvestmentHoldingSnapshotEntity.fromProvider(
            providerHolding,
            userId,
            accountId,
            security.id,
            snapshotDate,
          );
          holding.headerId = headers.get(accountId)!;
          return holding;
        });
        const repository = manager.getRepository(
          InvestmentHoldingSnapshotEntity,
        );
        // Capture obsolete row IDs before the upsert; identity remains stable for existing positions.
        const existing = mappedAccountIds.length
          ? await repository.find({
              where: {
                userId,
                accountId: In(mappedAccountIds),
                provider: 'plaid',
                snapshotDate,
              },
              select: { id: true, accountId: true, securityId: true },
              loadEagerRelations: false,
            })
          : [];
        const incomingKeys = new Set(
          holdings.map(
            (holding) => `${holding.accountId}:${holding.securityId}`,
          ),
        );
        const staleIds = existing
          .filter(
            (holding) =>
              !incomingKeys.has(`${holding.accountId}:${holding.securityId}`),
          )
          .map((holding) => holding.id);
        for (
          let start = 0;
          start < holdings.length;
          start += WRITE_CHUNK_SIZE
        ) {
          await repository.upsert(
            investmentWriteValues(
              repository,
              holdings.slice(start, start + WRITE_CHUNK_SIZE),
            ),
            {
              conflictPaths: ['accountId', 'snapshotDate', 'securityId'],
              skipUpdateIfNoValuesChanged: true,
            },
          );
        }
        let deletedStaleHoldings = 0;
        for (
          let start = 0;
          start < staleIds.length;
          start += WRITE_CHUNK_SIZE
        ) {
          const result = await repository.delete({
            userId,
            id: In(staleIds.slice(start, start + WRITE_CHUNK_SIZE)),
          });
          deletedStaleHoldings += result.affected ?? 0;
        }
        return {
          accounts: mappedAccountIds.length,
          securities: securityMap.size,
          holdings: holdings.length,
          deletedStaleHoldings,
        };
      },
    );
  }

  async findLatestHoldingsForAccount(
    userId: string,
    accountId: string,
  ): Promise<InvestmentHoldingsResponse> {
    const [result] = await this.holdingsQueryService.read(userId, {
      accountIds: [accountId],
      includeArchived: true,
    });
    return result.snapshot;
  }

  async findHoldingsForAccountOnDate(
    userId: string,
    accountId: string,
    snapshotDate: string,
  ): Promise<InvestmentHoldingsResponse> {
    const [result] = await this.holdingsQueryService.read(userId, {
      accountIds: [accountId],
      snapshotDate,
      includeArchived: true,
    });
    return result.snapshot;
  }

  async upsertPlaidInvestmentTransactions(
    userId: string,
    accountIdMap: Map<string, string>,
    response: ProviderInvestmentTransactionsResponse,
    token: InvestmentSyncToken,
  ): Promise<InvestmentTransactionsSyncResult> {
    return this.applyProviderSync(
      userId,
      accountIdMap,
      response.externalAccountIds,
      token,
      'transactions',
      async (manager, mappedAccountIds, bankLink) => {
        const securityMap = await this.upsertSecurities(
          manager,
          userId,
          response.securities,
        );
        const unique = new Map(
          response.transactions.map((transaction) => [
            `${transaction.externalAccountId}:${transaction.externalActivityId}`,
            transaction,
          ]),
        );
        const declared = new Set(response.externalAccountIds);
        let skippedMissingAccount = 0;
        const transactions = [...unique.values()].filter((transaction) => {
          if (!declared.has(transaction.externalAccountId))
            throw new BadRequestException(
              'Investment transaction references an undeclared account',
            );
          if (!accountIdMap.has(transaction.externalAccountId)) {
            skippedMissingAccount++;
            return false;
          }
          if (
            transaction.externalSecurityId &&
            !securityMap.has(transaction.externalSecurityId)
          )
            throw new BadRequestException(
              'Investment transaction references an unknown security',
            );
          return true;
        });
        const activityRepository = manager.getRepository(AccountActivityEntity);
        const activities = transactions.map((transaction) =>
          AccountActivityEntity.create({
            userId,
            accountId: accountIdMap.get(transaction.externalAccountId)!,
            provider: 'plaid',
            externalActivityId: transaction.externalActivityId,
            activityKind: 'investment_transaction',
            activityDate: transaction.providerDate,
            providerDate: transaction.providerDate,
            providerDatetime: transaction.providerDatetime,
            amount: transaction.amount,
          }),
        );
        for (
          let start = 0;
          start < activities.length;
          start += WRITE_CHUNK_SIZE
        ) {
          await activityRepository.upsert(
            investmentWriteValues(
              activityRepository,
              activities.slice(start, start + WRITE_CHUNK_SIZE),
            ),
            {
              conflictPaths: [
                'userId',
                'accountId',
                'provider',
                'activityKind',
                'externalActivityId',
              ],
              indexPredicate: '"externalActivityId" IS NOT NULL',
              skipUpdateIfNoValuesChanged: true,
            },
          );
        }
        const activityByIdentity = new Map<string, string>();
        for (
          let start = 0;
          start < activities.length;
          start += WRITE_CHUNK_SIZE
        ) {
          const batch = activities.slice(start, start + WRITE_CHUNK_SIZE);
          const saved = await activityRepository.find({
            where: {
              userId,
              accountId: In(mappedAccountIds),
              provider: 'plaid',
              activityKind: 'investment_transaction',
              externalActivityId: In(
                batch.map((activity) => activity.externalActivityId!),
              ),
            },
            select: { id: true, accountId: true, externalActivityId: true },
          });
          for (const activity of saved)
            activityByIdentity.set(
              `${activity.accountId}:${activity.externalActivityId}`,
              activity.id,
            );
        }
        const details = transactions.map((transaction) =>
          InvestmentTransactionEntity.fromProvider(
            transaction,
            userId,
            activityByIdentity.get(
              `${accountIdMap.get(transaction.externalAccountId)}:${transaction.externalActivityId}`,
            )!,
            transaction.externalSecurityId
              ? securityMap.get(transaction.externalSecurityId)!.id
              : null,
          ),
        );
        const detailRepository = manager.getRepository(
          InvestmentTransactionEntity,
        );
        for (let start = 0; start < details.length; start += WRITE_CHUNK_SIZE) {
          await detailRepository.upsert(
            investmentWriteValues(
              detailRepository,
              details.slice(start, start + WRITE_CHUNK_SIZE),
            ),
            {
              conflictPaths: ['activityId'],
              skipUpdateIfNoValuesChanged: true,
            },
          );
        }
        bankLink.authentication = {
          ...bankLink.authentication,
          investmentTransactionsSync: {
            lastSyncedAt: new Date().toISOString(),
            lastStartDate: response.startDate,
            lastEndDate: response.endDate,
          },
        };
        await manager
          .getRepository(BankLinkEntity)
          .update(
            { id: bankLink.id, userId },
            { authentication: bankLink.authentication },
          );
        return {
          accounts: mappedAccountIds.length,
          securities: securityMap.size,
          transactions: transactions.length,
          skippedMissingAccount,
        };
      },
    );
  }

  private async upsertSecurities(
    manager: EntityManager,
    userId: string,
    input: ProviderInvestmentSecurity[],
  ): Promise<Map<string, InvestmentSecurityEntity>> {
    const unique = new Map(
      input.map((security) => [security.externalSecurityId, security]),
    );
    if (!unique.size) return new Map();
    const repository = manager.getRepository(InvestmentSecurityEntity);
    const securities = [...unique.values()].map((security) =>
      InvestmentSecurityEntity.fromProvider(security, userId),
    );
    for (let start = 0; start < securities.length; start += WRITE_CHUNK_SIZE) {
      await repository.upsert(
        investmentWriteValues(
          repository,
          securities.slice(start, start + WRITE_CHUNK_SIZE),
        ),
        {
          conflictPaths: ['userId', 'provider', 'externalSecurityId'],
          skipUpdateIfNoValuesChanged: true,
        },
      );
    }
    const saved = await repository.find({
      where: {
        userId,
        provider: 'plaid',
        externalSecurityId: In([...unique.keys()]),
      },
    });
    return new Map(
      saved.map((security) => [security.externalSecurityId, security]),
    );
  }

  private async lockBankLink(
    manager: EntityManager,
    userId: string,
    bankLinkId: string,
  ): Promise<BankLinkEntity> {
    const bankLink = await manager.getRepository(BankLinkEntity).findOne({
      where: { id: bankLinkId, userId, archivedAt: IsNull() },
      lock: { mode: 'pessimistic_write' },
    });
    if (!bankLink) throw new NotFoundException('Active bank link not found');
    return bankLink;
  }

  private async applyProviderSync<T>(
    userId: string,
    accountIdMap: Map<string, string>,
    externalAccountIds: string[],
    token: InvestmentSyncToken,
    kind: InvestmentSyncKind,
    apply: (
      manager: EntityManager,
      accountIds: string[],
      bankLink: BankLinkEntity,
    ) => Promise<T>,
  ): Promise<T> {
    if (!token || token.kind !== kind)
      throw new BadRequestException(
        'A matching investment sync generation is required',
      );
    return this.dataSource.transaction(async (manager) => {
      const bankLink = await this.lockBankLink(
        manager,
        userId,
        token.bankLinkId,
      );
      const state = await manager
        .getRepository(InvestmentSyncStateEntity)
        .findOne({
          where: { userId, bankLinkId: token.bankLinkId, kind },
          lock: { mode: 'pessimistic_write' },
        });
      if (
        !state ||
        String(state.requestedGeneration) !== token.generation ||
        BigInt(state.completedGeneration) >= BigInt(token.generation)
      )
        throw new ConflictException(
          'Investment sync was superseded or already applied; retry the sync',
        );
      const accountIds = [
        ...new Set(
          externalAccountIds
            .map((id) => accountIdMap.get(id))
            .filter((id): id is string => !!id),
        ),
      ].sort();
      const accounts = accountIds.length
        ? await manager
            .getRepository(AccountEntity)
            .createQueryBuilder('account')
            .where('account.id IN (:...accountIds)', { accountIds })
            .andWhere('account."userId"=:userId', { userId })
            .andWhere('account."bankLinkId"=:bankLinkId', {
              bankLinkId: token.bankLinkId,
            })
            .andWhere('account."archivedAt" IS NULL')
            .orderBy('account.id', 'ASC')
            .setLock('pessimistic_write')
            .getMany()
        : [];
      if (accounts.length !== accountIds.length)
        throw new ConflictException(
          'An investment account changed or was archived during sync',
        );
      const result = await apply(manager, accountIds, bankLink);
      await manager
        .getRepository(InvestmentSyncStateEntity)
        .update(
          { id: state.id, userId },
          { completedGeneration: token.generation, completedAt: new Date() },
        );
      return result;
    });
  }

  async findActivityForAccount(
    userId: string,
    accountId: string,
    query: Omit<InvestmentActivityQuery, 'accountId'>,
  ): Promise<PaginatedInvestmentActivityResponse> {
    await this.ensureAccountOwned(userId, accountId);
    return this.findActivity(userId, {
      ...query,
      accountId,
    });
  }

  async findActivity(
    userId: string,
    query: InvestmentActivityQuery,
  ): Promise<PaginatedInvestmentActivityResponse> {
    if (query.accountId) {
      await this.ensureAccountOwned(userId, query.accountId);
    }

    const queryBuilder = this.transactionRepository
      .createQueryBuilder('investmentTransaction')
      .leftJoinAndSelect('investmentTransaction.activity', 'activity')
      .leftJoin('activity.account', 'account')
      .addSelect([
        'account.id',
        'account.userId',
        'account.name',
        'account.customName',
      ])
      .leftJoinAndSelect('investmentTransaction.security', 'security')
      .where('investmentTransaction.userId = :userId', { userId })
      .andWhere('activity.userId = :userId AND account.userId = :userId', {
        userId,
      })
      .andWhere('activity.activityKind = :activityKind', {
        activityKind: 'investment_transaction',
      });

    if (query.accountId) {
      queryBuilder.andWhere('activity.accountId = :accountId', {
        accountId: query.accountId,
      });
    }
    if (query.startDate) {
      queryBuilder.andWhere('activity.activityDate >= :startDate', {
        startDate: query.startDate,
      });
    }
    if (query.endDate) {
      queryBuilder.andWhere('activity.activityDate <= :endDate', {
        endDate: query.endDate,
      });
    }
    if (query.type) {
      queryBuilder.andWhere(
        'investmentTransaction.investmentType = :investmentType',
        { investmentType: query.type },
      );
    }
    if (query.subtype) {
      queryBuilder.andWhere(
        'investmentTransaction.investmentSubtype = :investmentSubtype',
        { investmentSubtype: query.subtype },
      );
    }

    const [entities, total] = await queryBuilder
      .orderBy('activity.activityDate', 'DESC')
      .addOrderBy('activity.id', 'DESC')
      .skip(query.pageIndex * query.pageSize)
      .take(query.pageSize)
      .getManyAndCount();

    return {
      data: entities.map((entity) => this.toInvestmentActivity(entity)),
      total,
      pageIndex: query.pageIndex,
      pageSize: query.pageSize,
    };
  }

  private async ensureAccountOwned(
    userId: string,
    accountId: string,
  ): Promise<AccountEntity> {
    const account = await this.accountRepository.findOne({
      where: { id: accountId, userId },
    });
    if (!account) {
      throw new NotFoundException(`Account with id ${accountId} not found`);
    }
    return account;
  }

  private toInvestmentActivity(
    entity: InvestmentTransactionEntity,
  ): InvestmentActivity {
    const account = entity.activity.account;
    return {
      id: entity.id,
      activityId: entity.activityId,
      accountId: entity.activity.accountId,
      accountName: account?.customName ?? account?.name ?? null,
      provider: entity.activity.provider as 'plaid',
      externalActivityId: entity.activity.externalActivityId,
      activityDate: entity.activity.activityDate,
      providerDate: entity.activity.providerDate,
      providerDatetime: entity.activity.providerDatetime,
      amount: entity.activity.amount.toMoneyWithSign(),
      security: entity.security?.toObject() ?? null,
      externalSecurityId: entity.externalSecurityId,
      name: entity.name,
      providerDescription: entity.name,
      quantity: entity.quantity,
      price: entity.price,
      fees: entity.fees,
      investmentType: entity.investmentType,
      investmentSubtype: entity.investmentSubtype,
      cancelExternalActivityId: entity.cancelExternalActivityId,
    };
  }
}
