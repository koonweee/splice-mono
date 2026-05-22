import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountEntity } from '../account/account.entity';
import { AccountActivityEntity } from './account-activity.entity';
import { AccountActivityService } from './account-activity.service';

@Module({
  imports: [TypeOrmModule.forFeature([AccountActivityEntity, AccountEntity])],
  providers: [AccountActivityService],
  exports: [AccountActivityService, TypeOrmModule],
})
export class AccountActivityModule {}
