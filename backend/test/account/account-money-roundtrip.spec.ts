import { EventEmitter2 } from '@nestjs/event-emitter';
import { AccountType } from 'plaid';
import { Repository } from 'typeorm';
import { AccountEntity } from '../../src/account/account.entity';
import { AccountService } from '../../src/account/account.service';
import { BalanceSnapshotEntity } from '../../src/balance-snapshot/balance-snapshot.entity';
import { BankLinkEntity } from '../../src/bank-link/bank-link.entity';
import { BalanceColumns } from '../../src/common/balance.columns';
import {
  AccountSchema,
  CreateManualAccountDtoSchema,
} from '../../src/types/Account';
import {
  MoneySign,
  MoneyWithSign,
  type SerializedMoneyWithSign,
} from '../../src/types/MoneyWithSign';
import { UpdateBalanceBodySchema } from '../../src/account/account.controller';
import { UserService } from '../../src/user/user.service';

interface PersistedBalanceWrite {
  currentBalance: SerializedMoneyWithSign;
  availableBalance: SerializedMoneyWithSign;
}

interface MoneyRoundTripCase {
  label: string;
  currency: string;
  sign: MoneySign;
  createMinorAmount: number;
  createMajorAmount: number;
  updateMinorAmount: number;
  updateMajorAmount: number;
}

const userId = '00000000-0000-4000-8000-000000000001';
const accountId = '00000000-0000-4000-8000-000000000002';
const persistedAt = new Date('2026-08-15T12:00:00.000Z');

const cases: MoneyRoundTripCase[] = [
  {
    label: 'positive USD',
    currency: 'USD',
    sign: MoneySign.POSITIVE,
    createMinorAmount: 12345,
    createMajorAmount: 123.45,
    updateMinorAmount: 6789,
    updateMajorAmount: 67.89,
  },
  {
    label: 'negative USD',
    currency: 'USD',
    sign: MoneySign.NEGATIVE,
    createMinorAmount: 12345,
    createMajorAmount: -123.45,
    updateMinorAmount: 6789,
    updateMajorAmount: -67.89,
  },
  {
    label: 'positive JPY',
    currency: 'JPY',
    sign: MoneySign.POSITIVE,
    createMinorAmount: 12345,
    createMajorAmount: 12345,
    updateMinorAmount: 6789,
    updateMajorAmount: 6789,
  },
  {
    label: 'negative JPY',
    currency: 'JPY',
    sign: MoneySign.NEGATIVE,
    createMinorAmount: 12345,
    createMajorAmount: -12345,
    updateMinorAmount: 6789,
    updateMajorAmount: -6789,
  },
];

function signedMajorAmount(balance: SerializedMoneyWithSign): number {
  const money = MoneyWithSign.fromSerialized(balance);
  const magnitude = money.toMajorUnit();
  return money.getSign() === MoneySign.NEGATIVE ? -magnitude : magnitude;
}

function serializeBalance(balance: BalanceColumns): SerializedMoneyWithSign {
  return {
    money: {
      amount: balance.amount,
      currency: balance.currency,
    },
    sign: balance.sign,
  };
}

function hydrateBigintBalance(balance: BalanceColumns): BalanceColumns {
  return Object.assign(new BalanceColumns(), balance, {
    // PostgreSQL bigint columns are hydrated as strings by the pg driver.
    amount: String(balance.amount) as unknown as number,
  });
}

describe('manual account money persistence round trips', () => {
  let service: AccountService;
  let persistedEntity: AccountEntity | null;
  let persistedWrites: PersistedBalanceWrite[];
  let repository: {
    save: jest.Mock;
    findOne: jest.Mock;
  };

  beforeEach(() => {
    persistedEntity = null;
    persistedWrites = [];
    repository = {
      save: jest.fn(async (entity: AccountEntity) => {
        persistedWrites.push({
          currentBalance: serializeBalance(entity.currentBalance),
          availableBalance: serializeBalance(entity.availableBalance),
        });

        persistedEntity = Object.assign(new AccountEntity(), entity, {
          id: accountId,
          createdAt: entity.createdAt ?? persistedAt,
          updatedAt: persistedAt,
          currentBalance: hydrateBigintBalance(entity.currentBalance),
          availableBalance: hydrateBigintBalance(entity.availableBalance),
        });
        return persistedEntity;
      }),
      findOne: jest.fn(async () => persistedEntity),
    };

    service = new AccountService(
      repository as unknown as Repository<AccountEntity>,
      {} as Repository<BalanceSnapshotEntity>,
      {} as Repository<BankLinkEntity>,
      { emit: jest.fn() } as unknown as EventEmitter2,
      {} as UserService,
    );
  });

  it.each(cases)(
    'preserves magnitude, sign, and currency for $label create and update',
    async ({
      label,
      currency,
      sign,
      createMinorAmount,
      createMajorAmount,
      updateMinorAmount,
      updateMajorAmount,
    }) => {
      const createBalance = {
        money: { amount: createMinorAmount, currency },
        sign,
      };
      const createRequest = CreateManualAccountDtoSchema.parse({
        name: label,
        type: AccountType.Depository,
        subType: null,
        currentBalance: createBalance,
        availableBalance: createBalance,
      });

      expect(createRequest.currentBalance.money.amount).toBeGreaterThanOrEqual(
        0,
      );
      expect(createRequest.currentBalance.sign).toBe(sign);

      const created = AccountSchema.parse(
        await service.create(createRequest, userId),
      );

      expect(persistedWrites[0]).toEqual({
        currentBalance: createBalance,
        availableBalance: createBalance,
      });
      expect(created.currentBalance).toEqual(createBalance);
      expect(created.availableBalance).toEqual(createBalance);
      expect(signedMajorAmount(created.currentBalance)).toBe(createMajorAmount);

      const updateBalance = {
        money: { amount: updateMinorAmount, currency },
        sign,
      };
      const updateRequest = UpdateBalanceBodySchema.parse({
        balance: updateBalance,
      });

      expect(updateRequest.balance.money.amount).toBeGreaterThanOrEqual(0);
      expect(updateRequest.balance.sign).toBe(sign);

      const updated = AccountSchema.parse(
        await service.updateManualBalance(
          accountId,
          userId,
          updateRequest.balance,
        ),
      );

      expect(persistedWrites[1]).toEqual({
        currentBalance: updateBalance,
        availableBalance: updateBalance,
      });
      expect(updated.currentBalance).toEqual(updateBalance);
      expect(updated.availableBalance).toEqual(updateBalance);
      expect(signedMajorAmount(updated.currentBalance)).toBe(updateMajorAmount);
    },
  );

  it.each(['USD', 'JPY'])(
    'rejects a negative %s magnitude at both public write schemas',
    (currency) => {
      const invalidBalance = {
        money: { amount: -1, currency },
        sign: MoneySign.NEGATIVE,
      };

      expect(() =>
        CreateManualAccountDtoSchema.parse({
          name: 'Invalid account',
          type: AccountType.Depository,
          subType: null,
          currentBalance: invalidBalance,
          availableBalance: invalidBalance,
        }),
      ).toThrow();
      expect(() =>
        UpdateBalanceBodySchema.parse({ balance: invalidBalance }),
      ).toThrow();
    },
  );
});
