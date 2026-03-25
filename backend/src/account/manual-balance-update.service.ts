import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AccountType } from 'plaid';
import { MoreThan, LessThan, Repository } from 'typeorm';
import { BalanceSnapshotEntity } from '../balance-snapshot/balance-snapshot.entity';
import { BalanceColumns } from '../common/balance.columns';
import {
  TransactionEntity,
  TransactionSource,
} from '../transaction/transaction.entity';
import { UpdateManualBalanceDto } from '../types/Account';
import { BalanceSnapshotType } from '../types/BalanceSnapshot';
import { MoneySign, SerializedMoneyWithSign } from '../types/MoneyWithSign';
import { Account } from '../types/Account';
import { AccountEntity } from './account.entity';

@Injectable()
export class ManualBalanceUpdateService {
  constructor(
    @InjectRepository(AccountEntity)
    private readonly accountRepository: Repository<AccountEntity>,
    @InjectRepository(BalanceSnapshotEntity)
    private readonly snapshotRepository: Repository<BalanceSnapshotEntity>,
    @InjectRepository(TransactionEntity)
    private readonly transactionRepository: Repository<TransactionEntity>,
  ) {}

  async updateManualBalance(
    accountId: string,
    userId: string,
    dto: UpdateManualBalanceDto,
  ): Promise<Account> {
    return this.accountRepository.manager.transaction(async (manager) => {
      const accountRepository = manager.getRepository(AccountEntity);
      const snapshotRepository = manager.getRepository(BalanceSnapshotEntity);
      const transactionRepository = manager.getRepository(TransactionEntity);

      const account = await accountRepository.findOne({
        where: { id: accountId, userId },
      });

      if (!account) {
        throw new NotFoundException(`Account with id ${accountId} not found`);
      }

      if (account.bankLinkId) {
        throw new BadRequestException(
          `Account with id ${accountId} is linked and cannot be manually updated`,
        );
      }

      const priorSnapshot = await snapshotRepository.findOne({
        where: {
          accountId,
          userId,
          snapshotDate: LessThan(dto.effectiveDate),
        },
        order: { snapshotDate: 'DESC' },
      });

      const futureSnapshot = await snapshotRepository.findOne({
        where: {
          accountId,
          userId,
          snapshotDate: MoreThan(dto.effectiveDate),
        },
        order: { snapshotDate: 'ASC' },
      });

      if (futureSnapshot && !dto.confirmHistoryReset) {
        throw new BadRequestException(
          'Confirm history reset before saving a backdated balance update',
        );
      }

      const nextCurrentBalance = dto.balance;
      const nextAvailableBalance = this.getAvailableBalance(
        account,
        nextCurrentBalance,
      );

      const existingSnapshot = await snapshotRepository.findOne({
        where: {
          accountId,
          userId,
          snapshotDate: dto.effectiveDate,
        },
      });

      const snapshot = existingSnapshot ?? new BalanceSnapshotEntity();
      if (existingSnapshot) {
        snapshot.id = existingSnapshot.id;
      }
      snapshot.userId = userId;
      snapshot.accountId = accountId;
      snapshot.snapshotDate = dto.effectiveDate;
      snapshot.currentBalance =
        BalanceColumns.fromMoneyWithSign(nextCurrentBalance);
      snapshot.availableBalance =
        BalanceColumns.fromMoneyWithSign(nextAvailableBalance);
      snapshot.snapshotType = BalanceSnapshotType.USER_UPDATE;

      await snapshotRepository.save(snapshot);

      await snapshotRepository.delete({
        accountId,
        userId,
        snapshotDate: MoreThan(dto.effectiveDate),
      });

      await transactionRepository.delete({
        accountId,
        userId,
        source: TransactionSource.MANUAL_BALANCE_UPDATE,
        date: MoreThan(dto.effectiveDate),
      });

      const existingSyntheticTransaction = await transactionRepository.findOne({
        where: {
          accountId,
          userId,
          date: dto.effectiveDate,
          source: TransactionSource.MANUAL_BALANCE_UPDATE,
        },
      });

      if (priorSnapshot) {
        const deltaAmount =
          this.toSignedAmount(nextCurrentBalance) -
          this.toSignedAmount(
            this.serializeSnapshotBalance(priorSnapshot.currentBalance),
          );

        const syntheticTransaction =
          existingSyntheticTransaction ?? new TransactionEntity();
        if (existingSyntheticTransaction) {
          syntheticTransaction.id = existingSyntheticTransaction.id;
        }
        syntheticTransaction.userId = userId;
        syntheticTransaction.accountId = accountId;
        syntheticTransaction.amount = BalanceColumns.fromMoneyWithSign(
          this.fromSignedAmount(deltaAmount, nextCurrentBalance.money.currency),
        );
        syntheticTransaction.merchantName = 'Balance update';
        syntheticTransaction.pending = false;
        syntheticTransaction.externalTransactionId = null;
        syntheticTransaction.logoUrl = null;
        syntheticTransaction.date = dto.effectiveDate;
        syntheticTransaction.source = TransactionSource.MANUAL_BALANCE_UPDATE;
        syntheticTransaction.datetime = null;
        syntheticTransaction.authorizedDate = null;
        syntheticTransaction.authorizedDatetime = null;
        syntheticTransaction.categoryId = null;

        await transactionRepository.save(syntheticTransaction);
      } else if (existingSyntheticTransaction) {
        await transactionRepository.delete({
          id: existingSyntheticTransaction.id,
          userId,
        });
      }

      const latestSnapshot = await snapshotRepository.findOne({
        where: { accountId, userId },
        order: { snapshotDate: 'DESC' },
      });

      if (!latestSnapshot) {
        throw new NotFoundException(
          `No balance snapshot found for account ${accountId} after manual update`,
        );
      }

      account.currentBalance = latestSnapshot.currentBalance;
      account.availableBalance = latestSnapshot.availableBalance;

      const savedAccount = await accountRepository.save(account);
      return {
        ...savedAccount.toObject(),
        latestSnapshotDate: latestSnapshot.snapshotDate,
      };
    });
  }

  private serializeSnapshotBalance(
    balance: BalanceColumns | SerializedMoneyWithSign,
  ): SerializedMoneyWithSign {
    return 'toMoneyWithSign' in balance ? balance.toMoneyWithSign() : balance;
  }

  private getAvailableBalance(
    account: AccountEntity,
    currentBalance: SerializedMoneyWithSign,
  ): SerializedMoneyWithSign {
    const isInvestmentType =
      account.type === String(AccountType.Investment) ||
      account.type === String(AccountType.Brokerage);

    if (!isInvestmentType) {
      return currentBalance;
    }

    return {
      money: { amount: 0, currency: currentBalance.money.currency },
      sign: MoneySign.POSITIVE,
    };
  }

  private toSignedAmount(balance: SerializedMoneyWithSign): number {
    return balance.sign === MoneySign.NEGATIVE
      ? -balance.money.amount
      : balance.money.amount;
  }

  private fromSignedAmount(
    amount: number,
    currency: string,
  ): SerializedMoneyWithSign {
    return {
      money: {
        amount: Math.abs(amount),
        currency,
      },
      sign: amount < 0 ? MoneySign.NEGATIVE : MoneySign.POSITIVE,
    };
  }
}
