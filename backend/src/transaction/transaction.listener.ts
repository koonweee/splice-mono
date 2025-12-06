import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { Repository } from 'typeorm';
import { AccountEntity } from '../account/account.entity';
import {
  TransactionCreatedEvent,
  TransactionDeletedEvent,
  TransactionEvents,
  TransactionUpdatedEvent,
} from '../events/transaction.events';
import { BalanceSnapshotType } from '../types/BalanceSnapshot';
import { MoneySign, SerializedMoneyWithSign } from '../types/MoneyWithSign';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Listens for transaction events and updates account balances
 */
@Injectable()
export class TransactionListener {
  private readonly logger = new Logger(TransactionListener.name);

  constructor(
    @InjectRepository(AccountEntity)
    private readonly accountRepository: Repository<AccountEntity>,
  ) {}

  /**
   * Handle transaction created event - update account balance and snapshot atomically
   *
   * Credit transactions increase the balance, debit transactions decrease it.
   * Uses a CTE to atomically:
   * 1. Update the account balance
   * 2. Upsert a balance snapshot with the new balance
   *
   * This prevents race conditions where concurrent transactions could result
   * in a snapshot with a stale balance value.
   */
  @OnEvent(TransactionEvents.CREATED)
  async handleTransactionCreated(
    event: TransactionCreatedEvent,
  ): Promise<void> {
    const { transaction } = event;

    this.logger.log(
      `Handling transaction created event: transactionId=${transaction.id}, accountId=${transaction.accountId}`,
    );

    try {
      const signedAmount = this.getSignedAmount(transaction.amount);
      const snapshotDate = this.getSnapshotDate();

      // Atomic CTE: update account balance and upsert snapshot in one statement
      await this.accountRepository.query(
        `
        WITH updated_account AS (
          UPDATE account_entity
          SET "currentBalanceAmount" = "currentBalanceAmount" + $1,
              "availableBalanceAmount" = "availableBalanceAmount" + $1
          WHERE id = $2
          RETURNING
            id,
            "userId",
            "currentBalanceAmount",
            "currentBalanceCurrency",
            "currentBalanceSign",
            "availableBalanceAmount",
            "availableBalanceCurrency",
            "availableBalanceSign"
        )
        INSERT INTO balance_snapshot_entity (
          id,
          "accountId",
          "userId",
          "snapshotDate",
          "currentBalanceAmount",
          "currentBalanceCurrency",
          "currentBalanceSign",
          "availableBalanceAmount",
          "availableBalanceCurrency",
          "availableBalanceSign",
          "snapshotType",
          "createdAt",
          "updatedAt"
        )
        SELECT
          gen_random_uuid(),
          id,
          "userId",
          $3,
          "currentBalanceAmount",
          "currentBalanceCurrency",
          "currentBalanceSign",
          "availableBalanceAmount",
          "availableBalanceCurrency",
          "availableBalanceSign",
          $4,
          NOW(),
          NOW()
        FROM updated_account
        ON CONFLICT ("accountId", "snapshotDate") DO UPDATE SET
          "currentBalanceAmount" = EXCLUDED."currentBalanceAmount",
          "currentBalanceCurrency" = EXCLUDED."currentBalanceCurrency",
          "currentBalanceSign" = EXCLUDED."currentBalanceSign",
          "availableBalanceAmount" = EXCLUDED."availableBalanceAmount",
          "availableBalanceCurrency" = EXCLUDED."availableBalanceCurrency",
          "availableBalanceSign" = EXCLUDED."availableBalanceSign",
          "snapshotType" = EXCLUDED."snapshotType",
          "updatedAt" = NOW()
        `,
        [
          signedAmount,
          transaction.accountId,
          snapshotDate,
          BalanceSnapshotType.USER_UPDATE,
        ],
      );

      this.logger.log(
        `Updated account balance and snapshot for accountId=${transaction.accountId}, amount=${signedAmount}, date=${snapshotDate}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to update account balance for transaction ${transaction.id}: ${error}`,
      );
    }
  }

  /**
   * Handle transaction deleted event - reverse balance changes and update historical snapshots
   *
   * When a transaction is deleted:
   * 1. Reverse the balance change on the account (credit becomes debit, debit becomes credit)
   * 2. Update all balance snapshots from the transaction date to today
   *
   * This ensures historical balance snapshots remain accurate after transaction deletion.
   */
  @OnEvent(TransactionEvents.DELETED)
  async handleTransactionDeleted(
    event: TransactionDeletedEvent,
  ): Promise<void> {
    const { transaction } = event;

    this.logger.log(
      `Handling transaction deleted event: transactionId=${transaction.id}, accountId=${transaction.accountId}`,
    );

    try {
      // Reverse the signed amount
      const reversedAmount = -this.getSignedAmount(transaction.amount);

      await this.updateAccountAndSnapshots(
        reversedAmount,
        transaction.accountId,
        transaction.date,
      );

      this.logger.log(
        `Reversed account balance and updated snapshots for accountId=${transaction.accountId}, reversedAmount=${reversedAmount}, from ${transaction.date} to today`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to reverse balance for deleted transaction ${transaction.id}: ${error}`,
      );
    }
  }

  /**
   * Handle transaction updated event - adjust balance for amount changes
   *
   * When a transaction amount is updated:
   * 1. Calculate the difference between old and new amounts
   * 2. Apply the difference to the account balance
   * 3. Update all balance snapshots from the transaction date to today
   *
   * This ensures historical balance snapshots remain accurate after amount changes.
   */
  @OnEvent(TransactionEvents.UPDATED)
  async handleTransactionUpdated(
    event: TransactionUpdatedEvent,
  ): Promise<void> {
    const { oldTransaction, newTransaction } = event;

    this.logger.log(
      `Handling transaction updated event: transactionId=${newTransaction.id}, accountId=${newTransaction.accountId}`,
    );

    try {
      const oldSignedAmount = this.getSignedAmount(oldTransaction.amount);
      const newSignedAmount = this.getSignedAmount(newTransaction.amount);
      const amountDifference = newSignedAmount - oldSignedAmount;

      // Skip if no actual change
      if (amountDifference === 0) {
        this.logger.log(
          `No balance change needed for transaction ${newTransaction.id}`,
        );
        return;
      }

      // Use the earlier of old and new transaction dates for snapshot updates
      const earlierDate =
        oldTransaction.date < newTransaction.date
          ? oldTransaction.date
          : newTransaction.date;

      await this.updateAccountAndSnapshots(
        amountDifference,
        newTransaction.accountId,
        earlierDate,
      );

      this.logger.log(
        `Updated account balance and snapshots for accountId=${newTransaction.accountId}, amountDifference=${amountDifference}, from ${earlierDate} to today`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to update balance for modified transaction ${newTransaction.id}: ${error}`,
      );
    }
  }

  /**
   * Convert a serialized MoneyWithSign to a signed number
   * Credit amounts are positive, debit amounts are negative
   */
  private getSignedAmount(amount: SerializedMoneyWithSign): number {
    return amount.sign === MoneySign.CREDIT
      ? amount.money.amount
      : -amount.money.amount;
  }

  /**
   * Atomically update account balance and all snapshots from a given date to today
   */
  private async updateAccountAndSnapshots(
    amountDelta: number,
    accountId: string,
    fromDate: string,
  ): Promise<void> {
    const todayDate = this.getSnapshotDate();

    await this.accountRepository.query(
      `
      WITH updated_account AS (
        UPDATE account_entity
        SET "currentBalanceAmount" = "currentBalanceAmount" + $1,
            "availableBalanceAmount" = "availableBalanceAmount" + $1
        WHERE id = $2
        RETURNING id
      )
      UPDATE balance_snapshot_entity
      SET "currentBalanceAmount" = "currentBalanceAmount" + $1,
          "availableBalanceAmount" = "availableBalanceAmount" + $1,
          "updatedAt" = NOW()
      WHERE "accountId" = $2
        AND "snapshotDate" >= $3
        AND "snapshotDate" <= $4
      `,
      [amountDelta, accountId, fromDate, todayDate],
    );
  }

  /**
   * Get the snapshot date by returning today in the user's timezone
   *
   * TODO: Fetch user's timezone from the account and localize the date. For now, hardcoded to PST
   */
  private getSnapshotDate(): string {
    return dayjs().tz('America/Los_Angeles').format('YYYY-MM-DD');
  }
}
