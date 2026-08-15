import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AccountEntity } from '../account/account.entity';
import type { BankLinkStatus } from '../types/BankLink';
import { BankLinkEntity } from './bank-link.entity';
import { BANK_LINK_LIFECYCLE_TRANSACTION_LOCK_SQL } from './bank-link-lifecycle-lock';

const EMPTY_BANK_LINK_GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
const EMPTY_BANK_LINK_SWEEP_BATCH_SIZE = 100;

export type EmptyBankLinkArchiveGuard = {
  bankLinkId: string;
  userId: string;
  expectedStatus: BankLinkStatus;
  expectedUpdatedAt: Date;
};

@Injectable()
export class BankLinkLifecycleService {
  constructor(
    @InjectRepository(BankLinkEntity)
    private readonly bankLinkRepository: Repository<BankLinkEntity>,
  ) {}

  async archiveEmptyBankLink(
    guard: EmptyBankLinkArchiveGuard,
  ): Promise<boolean> {
    return this.bankLinkRepository.manager.transaction(async (manager) => {
      await manager.query(BANK_LINK_LIFECYCLE_TRANSACTION_LOCK_SQL, [
        guard.bankLinkId,
      ]);
      const bankLinkRepository = manager.getRepository(BankLinkEntity);
      const accountRepository = manager.getRepository(AccountEntity);
      const bankLink = await bankLinkRepository.findOne({
        where: { id: guard.bankLinkId, userId: guard.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!bankLink) {
        throw new NotFoundException(`Bank link not found: ${guard.bankLinkId}`);
      }
      if (bankLink.archivedAt) {
        return false;
      }
      if (
        bankLink.status !== guard.expectedStatus ||
        bankLink.updatedAt.getTime() !== guard.expectedUpdatedAt.getTime()
      ) {
        throw new ConflictException(
          'Bank link changed after cleanup inspection',
        );
      }

      const activeAccountCount = await accountRepository.count({
        where: {
          bankLinkId: bankLink.id,
          userId: bankLink.userId,
          archivedAt: IsNull(),
        },
      });
      if (activeAccountCount !== 0) {
        throw new ConflictException('Bank link still has active accounts');
      }

      bankLink.archivedAt = new Date();
      await bankLinkRepository.save(bankLink);
      return true;
    });
  }

  async archiveStaleEmptyBankLinks(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - EMPTY_BANK_LINK_GRACE_PERIOD_MS);
    const candidates = await this.bankLinkRepository
      .createQueryBuilder('bankLink')
      .where('bankLink.archivedAt IS NULL')
      .andWhere('bankLink.status != :healthyStatus', { healthyStatus: 'OK' })
      .andWhere('bankLink.updatedAt < :cutoff', { cutoff })
      .andWhere(
        `NOT EXISTS (
          SELECT 1
          FROM "account_entity" "account"
          WHERE "account"."bankLinkId" = "bankLink"."id"
            AND "account"."archivedAt" IS NULL
        )`,
      )
      .orderBy('bankLink.updatedAt', 'ASC')
      .addOrderBy('bankLink.id', 'ASC')
      .take(EMPTY_BANK_LINK_SWEEP_BATCH_SIZE)
      .getMany();
    let archivedCount = 0;
    for (const candidate of candidates) {
      try {
        const archived = await this.archiveEmptyBankLink({
          bankLinkId: candidate.id,
          userId: candidate.userId,
          expectedStatus: candidate.status,
          expectedUpdatedAt: candidate.updatedAt,
        });
        if (archived) {
          archivedCount += 1;
        }
      } catch (error) {
        if (!(error instanceof ConflictException)) {
          throw error;
        }
      }
    }
    return archivedCount;
  }
}
