import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { getPostgresMutationAffectedCount } from '../common/postgres-mutation-result';
import { BankLinkEntity } from './bank-link.entity';
import { BankLinkService } from './bank-link.service';

const STALE_PENDING_RECONCILIATION_ADVISORY_LOCK = 1777503001;

/**
 * Daily recovery for pending-to-posted transitions missed by an older cursor
 * consumer. The underlying service applies explicit provider replacements and
 * strictly qualified authoritative absence cleanup; unresolved rows remain
 * unchanged and are surfaced in logs.
 */
@Injectable()
export class StalePendingTransactionScheduledService {
  private readonly logger = new Logger(
    StalePendingTransactionScheduledService.name,
  );

  constructor(
    private readonly bankLinkService: BankLinkService,
    @InjectRepository(BankLinkEntity)
    private readonly bankLinkRepository: Repository<BankLinkEntity>,
    private readonly dataSource: DataSource,
  ) {}

  @Cron('0 15 4 * * *', {
    name: 'stalePendingTransactionReconciliation',
    timeZone: 'America/Los_Angeles',
  })
  async handleReconciliation(): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    let lockAcquired = false;
    let connected = false;
    try {
      await queryRunner.connect();
      connected = true;
      const lockRows = (await queryRunner.query(
        'SELECT pg_try_advisory_lock($1) AS acquired',
        [STALE_PENDING_RECONCILIATION_ADVISORY_LOCK],
      )) as Array<{ acquired: boolean }>;
      lockAcquired = lockRows[0]?.acquired === true;
      if (!lockAcquired) {
        this.logger.log(
          {},
          'Skipping stale pending transaction reconciliation because another replica holds the scheduler lock',
        );
        return;
      }
      this.logger.log(
        {},
        'Acquired stale pending transaction reconciliation scheduler lock',
      );

      const purgeResult: unknown = await queryRunner.query(`
        WITH expired AS (
          SELECT id
          FROM "transaction_reconciliation_archive_entity"
          WHERE "expiresAt" < now()
          ORDER BY "expiresAt", id
          LIMIT 500
          FOR UPDATE SKIP LOCKED
        )
        DELETE FROM "transaction_reconciliation_archive_entity" archive
        USING expired
        WHERE archive.id = expired.id
        RETURNING archive.id
      `);
      this.logger.log(
        { purgedCount: getPostgresMutationAffectedCount(purgeResult) },
        'Purged expired transaction reconciliation archives',
      );

      await this.reconcileAllEligibleLinks();
    } finally {
      if (lockAcquired) {
        try {
          await queryRunner.query('SELECT pg_advisory_unlock($1)', [
            STALE_PENDING_RECONCILIATION_ADVISORY_LOCK,
          ]);
          this.logger.log(
            {},
            'Released stale pending transaction reconciliation scheduler lock',
          );
        } catch (error) {
          this.logger.error(
            { error: error instanceof Error ? error.message : String(error) },
            'Failed to explicitly release stale pending reconciliation scheduler lock',
          );
        }
      }
      if (connected) {
        await queryRunner.release();
      }
    }
  }

  private async reconcileAllEligibleLinks(): Promise<void> {
    const bankLinks = await this.bankLinkRepository.find({
      where: {
        providerName: 'plaid',
        status: 'OK',
        archivedAt: IsNull(),
      },
      order: { id: 'ASC' },
    });
    let candidateCount = 0;
    let reconciledCount = 0;
    let unresolvedCount = 0;
    let ambiguousCount = 0;
    let failedLinkCount = 0;

    // Run serially to bound provider request concurrency across all Items.
    for (const bankLink of bankLinks) {
      try {
        const result =
          await this.bankLinkService.reconcileStalePendingTransactions(
            bankLink.id,
            bankLink.userId,
          );
        candidateCount += result.candidateCount;
        reconciledCount += result.reconciledCount;
        unresolvedCount += result.unresolvedCount;
        ambiguousCount += result.ambiguousCount;
      } catch (error) {
        failedLinkCount += 1;
        this.logger.error(
          {
            bankLinkId: bankLink.id,
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed stale pending transaction reconciliation for bank link',
        );
      }
    }

    this.logger.log(
      {
        bankLinkCount: bankLinks.length,
        candidateCount,
        reconciledCount,
        unresolvedCount,
        ambiguousCount,
        failedLinkCount,
      },
      'Completed scheduled stale pending transaction reconciliation',
    );
  }
}
