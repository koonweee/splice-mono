import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoryEntity } from './category.entity';

/**
 * Category module - reference entity only.
 * No service or controller needed as categories are global lookup data.
 */
@Module({
  imports: [TypeOrmModule.forFeature([CategoryEntity])],
  exports: [TypeOrmModule],
})
export class CategoryModule {}
