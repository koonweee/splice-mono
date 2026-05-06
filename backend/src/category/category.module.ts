import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionEntity } from '../transaction/transaction.entity';
import { CategoryController } from './category.controller';
import { CategoryEntity } from './category.entity';
import { CategoryService } from './category.service';
import { CategoryVisibilityPreferenceEntity } from './category-visibility-preference.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CategoryEntity,
      CategoryVisibilityPreferenceEntity,
      TransactionEntity,
    ]),
  ],
  controllers: [CategoryController],
  providers: [CategoryService],
  exports: [TypeOrmModule, CategoryService],
})
export class CategoryModule {}
