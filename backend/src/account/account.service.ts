import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BalanceColumns } from '../common/balance.columns';
import { OwnedCrudService } from '../common/owned-crud.service';
import { Account, CreateAccountDto, UpdateAccountDto } from '../types/Account';
import { AccountEntity } from './account.entity';

@Injectable()
export class AccountService extends OwnedCrudService<
  AccountEntity,
  Account,
  CreateAccountDto,
  UpdateAccountDto
> {
  protected readonly logger = new Logger(AccountService.name);
  protected readonly entityName = 'Account';
  protected readonly EntityClass = AccountEntity;
  protected readonly relations = ['bankLink'];

  constructor(
    @InjectRepository(AccountEntity)
    repository: Repository<AccountEntity>,
  ) {
    super(repository);
  }

  protected applyUpdate(entity: AccountEntity, dto: UpdateAccountDto): void {
    if (dto.name !== undefined) entity.name = dto.name;
    if (dto.availableBalance !== undefined) {
      entity.availableBalance = BalanceColumns.fromMoneyWithSign(
        dto.availableBalance,
      );
    }
    if (dto.currentBalance !== undefined) {
      entity.currentBalance = BalanceColumns.fromMoneyWithSign(
        dto.currentBalance,
      );
    }
    if (dto.type !== undefined) entity.type = dto.type;
    if (dto.subType !== undefined) entity.subType = dto.subType;
    if (dto.externalAccountId !== undefined)
      entity.externalAccountId = dto.externalAccountId;
    if (dto.bankLinkId !== undefined) {
      entity.bankLinkId = dto.bankLinkId;
    }
  }
}
