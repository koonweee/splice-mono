import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountEntity } from '../account/account.entity';
import { InvestmentController } from './investment.controller';
import { InvestmentHoldingSnapshotEntity } from './investment-holding-snapshot.entity';
import { InvestmentSecurityEntity } from './investment-security.entity';
import { InvestmentService } from './investment.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AccountEntity,
      InvestmentHoldingSnapshotEntity,
      InvestmentSecurityEntity,
    ]),
  ],
  controllers: [InvestmentController],
  providers: [InvestmentService],
  exports: [InvestmentService],
})
export class InvestmentModule {}
