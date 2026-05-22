import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { AccountActivityService } from '../account-activity/account-activity.service';
import { AccountEntity } from '../account/account.entity';
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
    private readonly accountActivityService: AccountActivityService,
  ) {}

  async upsertPlaidHoldings(
    userId: string,
    accountIdMap: Map<string, string>,
    snapshotDate: string,
    response: ProviderInvestmentHoldingsResponse,
  ): Promise<InvestmentHoldingsSyncResult> {
    const securityMap = await this.upsertSecurities(userId, response);
    const mappedAccountIds = response.externalAccountIds
      .map((externalAccountId) => accountIdMap.get(externalAccountId))
      .filter((accountId): accountId is string => !!accountId);

    const savedHoldingIds: string[] = [];

    for (const providerHolding of response.holdings) {
      const accountId = accountIdMap.get(providerHolding.externalAccountId);
      const security = securityMap.get(providerHolding.externalSecurityId);
      if (!accountId || !security) {
        this.logger.warn(
          {
            hasAccountMapping: !!accountId,
            hasSecurityMapping: !!security,
          },
          'Skipping investment holding without account or security mapping',
        );
        continue;
      }

      const existing = await this.holdingRepository.findOne({
        where: {
          userId,
          accountId,
          securityId: security.id,
          snapshotDate,
        },
      });

      const holding =
        existing ??
        InvestmentHoldingSnapshotEntity.fromProvider(
          providerHolding,
          userId,
          accountId,
          security.id,
          snapshotDate,
        );

      if (existing) {
        existing.applyProviderHolding(providerHolding);
      }

      const saved = await this.holdingRepository.save(holding);
      savedHoldingIds.push(saved.id);
    }

    const deletedStaleHoldings = await this.deleteStaleSameDayHoldings(
      userId,
      mappedAccountIds,
      snapshotDate,
      savedHoldingIds,
    );

    this.logger.log(
      {
        accountCount: mappedAccountIds.length,
        securityCount: securityMap.size,
        holdingCount: savedHoldingIds.length,
        deletedStaleHoldings,
      },
      'Upserted investment holding snapshots',
    );

    return {
      accounts: mappedAccountIds.length,
      securities: securityMap.size,
      holdings: savedHoldingIds.length,
      deletedStaleHoldings,
    };
  }

  async findLatestHoldingsForAccount(
    userId: string,
    accountId: string,
  ): Promise<InvestmentHoldingsResponse> {
    await this.ensureAccountOwned(userId, accountId);

    const latest = await this.holdingRepository.findOne({
      where: { userId, accountId },
      order: { snapshotDate: 'DESC', updatedAt: 'DESC' },
    });

    if (!latest) {
      return { accountId, snapshotDate: null, holdings: [] };
    }

    return this.findHoldingsForAccountOnDate(
      userId,
      accountId,
      latest.snapshotDate,
    );
  }

  async findHoldingsForAccountOnDate(
    userId: string,
    accountId: string,
    snapshotDate: string,
  ): Promise<InvestmentHoldingsResponse> {
    await this.ensureAccountOwned(userId, accountId);

    const holdings = await this.holdingRepository.find({
      where: { userId, accountId, snapshotDate },
      order: {
        institutionValue: 'DESC',
        updatedAt: 'DESC',
      },
    });

    return {
      accountId,
      snapshotDate,
      holdings: holdings.map((holding) => holding.toObject()),
    };
  }

  async upsertPlaidInvestmentTransactions(
    userId: string,
    accountIdMap: Map<string, string>,
    response: ProviderInvestmentTransactionsResponse,
  ): Promise<InvestmentTransactionsSyncResult> {
    const securityMap = await this.upsertSecurities(userId, response);
    const mappedAccountIds = response.externalAccountIds
      .map((externalAccountId) => accountIdMap.get(externalAccountId))
      .filter((accountId): accountId is string => !!accountId);

    let transactionCount = 0;
    let skippedMissingAccount = 0;

    for (const providerTransaction of response.transactions) {
      const accountId = accountIdMap.get(providerTransaction.externalAccountId);
      if (!accountId) {
        skippedMissingAccount++;
        this.logger.warn(
          {
            externalAccountId: providerTransaction.externalAccountId,
            externalActivityId: providerTransaction.externalActivityId,
          },
          'Skipping investment transaction without account mapping',
        );
        continue;
      }

      const securityId = providerTransaction.externalSecurityId
        ? (securityMap.get(providerTransaction.externalSecurityId)?.id ?? null)
        : null;

      const activity = await this.accountActivityService.upsertExternal({
        userId,
        accountId,
        provider: 'plaid',
        externalActivityId: providerTransaction.externalActivityId,
        activityKind: 'investment_transaction',
        activityDate: providerTransaction.providerDate,
        providerDate: providerTransaction.providerDate,
        providerDatetime: providerTransaction.providerDatetime,
        amount: providerTransaction.amount,
      });

      const existing = await this.transactionRepository.findOne({
        where: {
          userId,
          activityId: activity.id,
        },
      });
      const transaction =
        existing ??
        InvestmentTransactionEntity.fromProvider(
          providerTransaction,
          userId,
          activity.id,
          securityId,
        );
      if (existing) {
        existing.applyProviderTransaction(providerTransaction, securityId);
      }

      await this.transactionRepository.save(transaction);
      transactionCount++;
    }

    this.logger.log(
      {
        accountCount: mappedAccountIds.length,
        securityCount: securityMap.size,
        transactionCount,
        skippedMissingAccount,
      },
      'Upserted investment transactions',
    );

    return {
      accounts: mappedAccountIds.length,
      securities: securityMap.size,
      transactions: transactionCount,
      skippedMissingAccount,
    };
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
      .leftJoinAndSelect('activity.account', 'account')
      .leftJoinAndSelect('investmentTransaction.security', 'security')
      .where('investmentTransaction.userId = :userId', { userId })
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

  private async upsertSecurities(
    userId: string,
    response: { securities: ProviderInvestmentSecurity[] },
  ): Promise<Map<string, InvestmentSecurityEntity>> {
    const uniqueSecurities = new Map(
      response.securities.map((security) => [
        security.externalSecurityId,
        security,
      ]),
    );

    if (uniqueSecurities.size === 0) {
      return new Map();
    }

    const existingSecurities = await this.securityRepository.find({
      where: {
        userId,
        provider: 'plaid',
        externalSecurityId: In(Array.from(uniqueSecurities.keys())),
      },
    });
    const existingByExternalId = new Map(
      existingSecurities.map((security) => [
        security.externalSecurityId,
        security,
      ]),
    );

    const savedSecurities = new Map<string, InvestmentSecurityEntity>();
    for (const providerSecurity of uniqueSecurities.values()) {
      const existing = existingByExternalId.get(
        providerSecurity.externalSecurityId,
      );
      const security =
        existing ??
        InvestmentSecurityEntity.fromProvider(providerSecurity, userId);
      if (existing) {
        existing.applyProviderSecurity(providerSecurity);
      }
      const saved = await this.securityRepository.save(security);
      savedSecurities.set(saved.externalSecurityId, saved);
    }

    return savedSecurities;
  }

  private async deleteStaleSameDayHoldings(
    userId: string,
    accountIds: string[],
    snapshotDate: string,
    savedHoldingIds: string[],
  ): Promise<number> {
    if (accountIds.length === 0) {
      return 0;
    }

    const result = await this.holdingRepository.delete({
      userId,
      accountId: In(accountIds),
      snapshotDate,
      ...(savedHoldingIds.length > 0 ? { id: Not(In(savedHoldingIds)) } : {}),
    });

    return result.affected ?? 0;
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
