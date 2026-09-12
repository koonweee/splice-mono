import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { z } from 'zod';
import { CategoryEntity } from '../category/category.entity';
import { TransactionEntity } from '../transaction/transaction.entity';

const IdSchema = z
  .string()
  .uuid()
  .transform((id) => id.toLowerCase());

export const TransactionCategoryUpdatesSchema = z
  .array(
    z
      .object({
        transactionIds: z
          .array(IdSchema)
          .min(1)
          .max(500)
          .describe(
            'Exact IDs from list_transactions. Use one ID for a single transaction.',
          ),
        categoryId: IdSchema.nullable().describe(
          'Active user category ID from list_categories; null explicitly sets Uncategorized.',
        ),
      })
      .strict(),
  )
  .min(1)
  .max(50)
  .superRefine((groups, context) => {
    if (
      groups.reduce((count, group) => count + group.transactionIds.length, 0) >
      500
    ) {
      context.addIssue({
        code: 'custom',
        message: 'At most 500 transaction IDs per call.',
      });
    }
    const assignments = new Map<string, string | null>();
    for (const group of groups) {
      for (const id of group.transactionIds) {
        if (assignments.has(id) && assignments.get(id) !== group.categoryId) {
          context.addIssue({
            code: 'custom',
            message: 'A transaction cannot have conflicting target categories.',
          });
        }
        assignments.set(id, group.categoryId);
      }
    }
  });

export const SetTransactionCategoriesOutputSchema = z.object({
  requested: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  results: z.array(
    z.object({
      categoryId: z.string().uuid().nullable(),
      updatedTransactionIds: z.array(z.string().uuid()),
      unchangedTransactionIds: z.array(z.string().uuid()),
    }),
  ),
});

@Injectable()
export class McpTransactionCategoriesService {
  constructor(
    @InjectRepository(TransactionEntity)
    private readonly transactions: Repository<TransactionEntity>,
  ) {}

  async setCategories(
    userId: string,
    updates: z.infer<typeof TransactionCategoryUpdatesSchema>,
  ): Promise<z.infer<typeof SetTransactionCategoriesOutputSchema>> {
    // Validate here too so callers outside the MCP transport cannot bypass limits.
    const validated = TransactionCategoryUpdatesSchema.parse(updates);
    const groups = new Map<string | null, Set<string>>();
    for (const group of validated) {
      const ids = groups.get(group.categoryId) ?? new Set<string>();
      group.transactionIds.forEach((id) => ids.add(id));
      groups.set(group.categoryId, ids);
    }
    const ids = [...groups.values()].flatMap((group) => [...group]).sort();
    const categoryIds = [...groups.keys()]
      .filter((id): id is string => id !== null)
      .sort();

    return this.transactions.manager.transaction(async (manager) => {
      // Hold category locks through commit so archiving/deleting cannot invalidate validation.
      if (categoryIds.length) {
        const categories = await manager
          .getRepository(CategoryEntity)
          .createQueryBuilder('category')
          .select(['category.id'])
          .where('category.id IN (:...categoryIds)', { categoryIds })
          .andWhere('category.userId = :userId', { userId })
          .andWhere('category.archivedAt IS NULL')
          .orderBy('category.id', 'ASC')
          .setLock('pessimistic_read')
          .getMany();
        if (categories.length !== categoryIds.length) {
          throw new NotFoundException(
            'One or more categories are unavailable or archived. No transactions were updated.',
          );
        }
      }
      const repository = manager.getRepository(TransactionEntity);
      const transactions = await repository
        .createQueryBuilder('transaction')
        .innerJoin('transaction.activity', 'activity')
        .select([
          'transaction.id',
          'transaction.categoryId',
          'transaction.categoryAssignmentSource',
          'transaction.categoryAssignmentRuleId',
        ])
        .where('transaction.id IN (:...ids)', { ids })
        .andWhere('activity.userId = :userId', { userId })
        .orderBy('transaction.id', 'ASC')
        .setLock('pessimistic_write', undefined, ['transaction'])
        .getMany();
      if (transactions.length !== ids.length) {
        throw new NotFoundException(
          'One or more transactions are unavailable. No transactions were updated.',
        );
      }
      const byId = new Map(
        transactions.map((transaction) => [transaction.id, transaction]),
      );
      const results: z.infer<
        typeof SetTransactionCategoriesOutputSchema
      >['results'] = [];
      const now = new Date();
      for (const [categoryId, groupIds] of groups) {
        const updatedTransactionIds: string[] = [];
        const unchangedTransactionIds: string[] = [];
        for (const id of groupIds) {
          const transaction = byId.get(id)!;
          const unchanged =
            transaction.categoryId === categoryId &&
            transaction.categoryAssignmentSource === 'manual' &&
            transaction.categoryAssignmentRuleId === null;
          (unchanged ? unchangedTransactionIds : updatedTransactionIds).push(
            id,
          );
        }
        if (updatedTransactionIds.length) {
          await repository.update(
            { id: In(updatedTransactionIds) },
            {
              categoryId,
              categoryUpdatedAt: categoryId === null ? null : now,
              categoryAssignmentSource: 'manual',
              categoryAssignmentRuleId: null,
            },
          );
        }
        results.push({
          categoryId,
          updatedTransactionIds,
          unchangedTransactionIds,
        });
      }
      const updated = results.reduce(
        (count, group) => count + group.updatedTransactionIds.length,
        0,
      );
      return {
        requested: ids.length,
        updated,
        unchanged: ids.length - updated,
        results,
      };
    });
  }
}
