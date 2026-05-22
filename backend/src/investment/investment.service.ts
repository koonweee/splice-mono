import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { AccountEntity } from '../account/account.entity';
import type {
  InvestmentHoldingsResponse,
  InvestmentHoldingsSyncResult,
  ProviderInvestmentHoldingsResponse,
} from '../types/Investment';
import { InvestmentHoldingSnapshotEntity } from './investment-holding-snapshot.entity';
import { InvestmentSecurityEntity } from './investment-security.entity';

@Injectable()
export class InvestmentService {
  private readonly logger = new Logger(InvestmentService.name);

  constructor(
    @InjectRepository(InvestmentSecurityEntity)
    private readonly securityRepository: Repository<InvestmentSecurityEntity>,
    @InjectRepository(InvestmentHoldingSnapshotEntity)
    private readonly holdingRepository: Repository<InvestmentHoldingSnapshotEntity>,
    @InjectRepository(AccountEntity)
    private readonly accountRepository: Repository<AccountEntity>,
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

  private async upsertSecurities(
    userId: string,
    response: ProviderInvestmentHoldingsResponse,
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
}
