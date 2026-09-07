import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import { BankLinkEntity } from './bank-link.entity';
import { PlaidProvider } from './providers/plaid/plaid.provider';

/** A durable outbox on the link row. Multiple application nodes may run this worker. */
@Injectable()
export class BankLinkDisconnectService {
  private readonly logger = new Logger(BankLinkDisconnectService.name);

  constructor(
    @InjectRepository(BankLinkEntity)
    private readonly repository: Repository<BankLinkEntity>,
    private readonly plaid: PlaidProvider,
  ) {}

  @Cron('0 * * * * *', { name: 'bankLinkDisconnect', timeZone: 'UTC' })
  async processPending(): Promise<void> {
    const candidates = await this.repository
      .createQueryBuilder('link')
      .where('link."disconnectRequestedAt" IS NOT NULL')
      .andWhere('link."disconnectedAt" IS NULL')
      .andWhere('link."disconnectNextAttemptAt" <= NOW()')
      .orderBy('link."disconnectNextAttemptAt"', 'ASC')
      .addOrderBy('link.id', 'ASC')
      .take(25)
      .getMany();
    for (const candidate of candidates) {
      try {
        await this.disconnect(candidate.id);
      } catch {
        // A failed DB commit leaves the intent intact. Repeating item/remove is safe.
        this.logger.error(
          { bankLinkId: candidate.id },
          'Disconnect attempt could not be committed',
        );
      }
    }
  }

  async disconnect(id: string): Promise<void> {
    const completed = await this.repository.manager.transaction(
      async (manager) => {
        const locks: { acquired: boolean }[] = await manager.query(
          'SELECT pg_try_advisory_xact_lock(hashtextextended($1, 1777502000)) AS acquired',
          [id],
        );
        if (!locks[0]?.acquired) return;
        const links = manager.getRepository(BankLinkEntity);
        const link = await links.findOne({
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });
        const now = new Date();
        if (
          !link ||
          !link.disconnectRequestedAt ||
          link.disconnectedAt ||
          !link.disconnectNextAttemptAt ||
          link.disconnectNextAttemptAt > now
        )
          return;

        // Check every owner and any other row sharing this provider Item/token.
        const blockers: { blocked: boolean }[] = await manager.query(
          `
        SELECT EXISTS (
          SELECT 1 FROM account_entity a
          JOIN bank_link_entity b ON b.id = a."bankLinkId"
          WHERE a."archivedAt" IS NULL AND (
            b.id = $1 OR (b."providerName" = 'plaid' AND (
              b.authentication->>'itemId' = $2 OR b.authentication->>'accessToken' = $3
            ))
          )
        ) OR EXISTS (
          SELECT 1 FROM bank_link_entity b
          WHERE b.id <> $1 AND b."providerName" = 'plaid' AND b."archivedAt" IS NULL
          AND (b.authentication->>'itemId' = $2 OR b.authentication->>'accessToken' = $3)
        ) AS blocked`,
          [
            id,
            link.authentication.itemId ?? null,
            link.authentication.accessToken ?? null,
          ],
        );

        link.disconnectAttempts += 1;
        link.disconnectNextAttemptAt = new Date(
          now.getTime() +
            Math.min(
              3600_000,
              60_000 * 2 ** Math.min(link.disconnectAttempts - 1, 6),
            ),
        );
        if (
          !link.archivedAt ||
          link.providerName !== 'plaid' ||
          blockers[0]?.blocked !== false
        ) {
          this.logger.warn(
            { bankLinkId: id },
            'Disconnect blocked by lifecycle safety checks',
          );
        } else {
          try {
            // The bounded API call runs under the lifecycle/row locks. A crash or
            // rollback after remote success retries and accepts ITEM_NOT_FOUND.
            await this.plaid.disconnect(link.authentication);
            const itemId: unknown = link.authentication.itemId;
            link.authentication = typeof itemId === 'string' ? { itemId } : {};
            link.disconnectedAt = new Date();
            link.disconnectNextAttemptAt = null;
          } catch {
            this.logger.warn(
              { bankLinkId: id, attempt: link.disconnectAttempts },
              'Plaid disconnect will retry',
            );
          }
        }
        await links.save(link);
        return !!link.disconnectedAt;
      },
    );
    if (completed)
      this.logger.log({ bankLinkId: id }, 'Plaid disconnect completed');
  }
}
