import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AccountEntity } from '../../src/account/account.entity';
import { InvestmentHoldingSnapshotEntity } from '../../src/investment/investment-holding-snapshot.entity';
import { InvestmentSecurityEntity } from '../../src/investment/investment-security.entity';
import { InvestmentService } from '../../src/investment/investment.service';
import type { ProviderInvestmentHoldingsResponse } from '../../src/types/Investment';

const userId = '11111111-1111-1111-1111-111111111111';
const accountId = '22222222-2222-2222-2222-222222222222';
const securityId = '33333333-3333-3333-3333-333333333333';

const providerResponse: ProviderInvestmentHoldingsResponse = {
  externalAccountIds: ['external-account-id'],
  securities: [
    {
      externalSecurityId: 'security-id',
      institutionId: 'ins_123',
      institutionSecurityId: 'institution-security-id',
      name: 'Vanguard FTSE All-World UCITS ETF',
      tickerSymbol: 'VWRA',
      isin: 'IE00BK5BQT80',
      cusip: null,
      sedol: null,
      type: 'etf',
      subtype: 'etf',
      isCashEquivalent: false,
      closePrice: '120.250000000001',
      closePriceAsOf: '2026-05-20',
      updateDatetime: '2026-05-20T21:00:00Z',
      isoCurrencyCode: 'USD',
      unofficialCurrencyCode: null,
      marketIdentifierCode: 'XLON',
      sector: null,
      industry: null,
    },
  ],
  holdings: [
    {
      externalAccountId: 'external-account-id',
      externalSecurityId: 'security-id',
      quantity: '10.123456789012',
      costBasis: '1000.000000000001',
      institutionPrice: '120.250000000001',
      institutionPriceAsOf: '2026-05-20',
      institutionPriceDatetime: '2026-05-20T21:00:00Z',
      institutionValue: '1217.345678901234',
      isoCurrencyCode: 'USD',
      unofficialCurrencyCode: null,
      vestedQuantity: null,
      vestedValue: null,
    },
  ],
};

function buildSecurity(): InvestmentSecurityEntity {
  const security = InvestmentSecurityEntity.fromProvider(
    providerResponse.securities[0],
    userId,
  );
  security.id = securityId;
  security.createdAt = new Date('2026-05-20T00:00:00Z');
  security.updatedAt = new Date('2026-05-20T00:00:00Z');
  return security;
}

function buildHolding(): InvestmentHoldingSnapshotEntity {
  const holding = InvestmentHoldingSnapshotEntity.fromProvider(
    providerResponse.holdings[0],
    userId,
    accountId,
    securityId,
    '2026-05-20',
  );
  holding.id = '44444444-4444-4444-4444-444444444444';
  holding.security = buildSecurity();
  holding.createdAt = new Date('2026-05-20T00:00:00Z');
  holding.updatedAt = new Date('2026-05-20T00:00:00Z');
  return holding;
}

describe('InvestmentService', () => {
  let service: InvestmentService;
  const securityRepository = {
    find: jest.fn(),
    save: jest.fn(),
  };
  const holdingRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };
  const accountRepository = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    securityRepository.find.mockResolvedValue([]);
    securityRepository.save.mockImplementation(
      async (security: InvestmentSecurityEntity) => ({
        ...security,
        id: security.id ?? securityId,
        createdAt: new Date('2026-05-20T00:00:00Z'),
        updatedAt: new Date('2026-05-20T00:00:00Z'),
      }),
    );
    holdingRepository.findOne.mockResolvedValue(null);
    holdingRepository.find.mockResolvedValue([]);
    holdingRepository.save.mockImplementation(
      async (holding: InvestmentHoldingSnapshotEntity) => ({
        ...holding,
        id: holding.id ?? '44444444-4444-4444-4444-444444444444',
        createdAt: new Date('2026-05-20T00:00:00Z'),
        updatedAt: new Date('2026-05-20T00:00:00Z'),
      }),
    );
    holdingRepository.delete.mockResolvedValue({ affected: 0 });
    accountRepository.findOne.mockResolvedValue({ id: accountId, userId });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvestmentService,
        {
          provide: getRepositoryToken(InvestmentSecurityEntity),
          useValue: securityRepository,
        },
        {
          provide: getRepositoryToken(InvestmentHoldingSnapshotEntity),
          useValue: holdingRepository,
        },
        {
          provide: getRepositoryToken(AccountEntity),
          useValue: accountRepository,
        },
      ],
    }).compile();

    service = module.get(InvestmentService);
  });

  it('upserts securities and daily holding snapshots with decimal strings intact', async () => {
    const result = await service.upsertPlaidHoldings(
      userId,
      new Map([['external-account-id', accountId]]),
      '2026-05-20',
      providerResponse,
    );

    expect(securityRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        externalSecurityId: 'security-id',
        closePrice: '120.250000000001',
      }),
    );
    expect(holdingRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId,
        securityId,
        quantity: '10.123456789012',
        institutionValue: '1217.345678901234',
      }),
    );
    expect(result).toEqual({
      accounts: 1,
      securities: 1,
      holdings: 1,
      deletedStaleHoldings: 0,
    });
  });

  it('updates existing same-day holding snapshot instead of creating intraday rows', async () => {
    const existingHolding = buildHolding();
    holdingRepository.findOne.mockResolvedValueOnce(existingHolding);

    await service.upsertPlaidHoldings(
      userId,
      new Map([['external-account-id', accountId]]),
      '2026-05-20',
      providerResponse,
    );

    expect(holdingRepository.save).toHaveBeenCalledWith(existingHolding);
  });

  it('returns latest holdings scoped by user account ownership', async () => {
    const holding = buildHolding();
    holdingRepository.findOne.mockResolvedValueOnce(holding);
    holdingRepository.find.mockResolvedValueOnce([holding]);

    const result = await service.findLatestHoldingsForAccount(
      userId,
      accountId,
    );

    expect(accountRepository.findOne).toHaveBeenCalledWith({
      where: { id: accountId, userId },
    });
    expect(result.snapshotDate).toBe('2026-05-20');
    expect(result.holdings[0].quantity).toBe('10.123456789012');
  });

  it('blocks cross-user account access', async () => {
    accountRepository.findOne.mockResolvedValueOnce(null);

    await expect(
      service.findLatestHoldingsForAccount(userId, accountId),
    ).rejects.toThrow(NotFoundException);
  });
});
