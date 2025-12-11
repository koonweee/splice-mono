import { z } from 'zod';
import { registerSchema } from '../common/zod-api-response';
import { MoneyWithSignSchema } from './MoneyWithSign';
import { OwnedSchema } from './Timestamps';

/**
 * Snapshot type indicates how the balance snapshot was created
 */
export enum BalanceSnapshotType {
  /** User manually added/updated a transaction that affected the balance */
  USER_UPDATE = 'USER_UPDATE',
  /** Balance synced from bank provider (e.g., Plaid) */
  SYNC = 'SYNC',
  /** Balance forward-filled from previous snapshot (e.g., if a snapshot is missing) */
  FORWARD_FILL = 'FORWARD_FILL',
}

export const BalanceSnapshotTypeSchema = z.nativeEnum(BalanceSnapshotType);

/**
 * Balance snapshot domain type
 */
export const BalanceSnapshotSchema = registerSchema(
  'BalanceSnapshot',
  z
    .object({
      id: z.string().uuid(),
      /** ID of the account this snapshot belongs to */
      accountId: z.string().uuid(),
      /** Date of snapshot (YYYY-MM-DD format) - used with accountId for uniqueness */
      snapshotDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
      /** Current balance at time of snapshot */
      currentBalance: MoneyWithSignSchema,
      /** Available balance at time of snapshot */
      availableBalance: MoneyWithSignSchema,
      /** How this snapshot was created */
      snapshotType: BalanceSnapshotTypeSchema,
    })
    .merge(OwnedSchema),
);

export type BalanceSnapshot = z.infer<typeof BalanceSnapshotSchema>;

/** Service arguments */

export const CreateBalanceSnapshotDtoSchema = registerSchema(
  'CreateBalanceSnapshotDto',
  z.object({
    /** ID of the account this snapshot belongs to */
    accountId: z.string().uuid(),
    /** Date of snapshot (YYYY-MM-DD format) */
    snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
    /** Current balance at time of snapshot */
    currentBalance: MoneyWithSignSchema,
    /** Available balance at time of snapshot */
    availableBalance: MoneyWithSignSchema,
    /** How this snapshot was created */
    snapshotType: BalanceSnapshotTypeSchema,
  }),
);

export type CreateBalanceSnapshotDto = z.infer<
  typeof CreateBalanceSnapshotDtoSchema
>;

/**
 * DTO for updating an existing BalanceSnapshot
 */
export const UpdateBalanceSnapshotDtoSchema = registerSchema(
  'UpdateBalanceSnapshotDto',
  CreateBalanceSnapshotDtoSchema.partial(),
);

export type UpdateBalanceSnapshotDto = z.infer<
  typeof UpdateBalanceSnapshotDtoSchema
>;
