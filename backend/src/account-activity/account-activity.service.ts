import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountEntity } from '../account/account.entity';
import type {
  AccountActivityKind,
  AccountActivityProvider,
} from '../types/AccountActivity';
import type { SerializedMoneyWithSign } from '../types/MoneyWithSign';
import { AccountActivityEntity } from './account-activity.entity';

export type AccountActivityUpsertInput = {
  userId: string;
  accountId: string;
  provider: AccountActivityProvider;
  externalActivityId?: string | null;
  activityKind: AccountActivityKind;
  activityDate: string;
  providerDate: string;
  providerDatetime?: string | null;
  amount: SerializedMoneyWithSign;
};

@Injectable()
export class AccountActivityService {
  constructor(
    @InjectRepository(AccountActivityEntity)
    private readonly activityRepository: Repository<AccountActivityEntity>,
    @InjectRepository(AccountEntity)
    private readonly accountRepository: Repository<AccountEntity>,
  ) {}

  async ensureAccountOwned(
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

  async upsertExternal(
    input: AccountActivityUpsertInput & { externalActivityId: string },
  ): Promise<AccountActivityEntity> {
    const existing = await this.activityRepository.findOne({
      where: {
        userId: input.userId,
        accountId: input.accountId,
        provider: input.provider,
        activityKind: input.activityKind,
        externalActivityId: input.externalActivityId,
      },
    });

    const activity =
      existing ??
      AccountActivityEntity.create({
        ...input,
        externalActivityId: input.externalActivityId,
      });
    if (existing) {
      existing.apply(input);
    }

    return this.activityRepository.save(activity);
  }
}
