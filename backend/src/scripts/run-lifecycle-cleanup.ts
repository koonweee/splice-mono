import {
  REFRESH_TOKEN_CLEANUP_BATCH_SIZE,
  RefreshTokenCleanupService,
} from '../auth/refresh-token-cleanup.service';
import {
  BankLinkLifecycleService,
  EmptyBankLinkArchiveGuard,
} from '../bank-link/bank-link-lifecycle.service';
import {
  NOTIFICATION_CLEANUP_BATCH_SIZE,
  NotificationService,
} from '../notification/notification.service';
import {
  CategorizationRuleRecommendationService,
  SUGGESTION_EXPIRY_BATCH_SIZE,
} from '../transaction-categorization/recommendations/categorization-rule-recommendation.service';
import { BankLinkStatusEnum } from '../types/BankLink';
import {
  WEBHOOK_CLEANUP_BATCH_SIZE,
  WebhookEventCleanupService,
} from '../webhook-event/webhook-event-cleanup.service';

const MAX_BATCHES_PER_CLEANUP = 10;
const MAX_EXACT_BANK_LINK_GUARDS = 100;

export const LIFECYCLE_CLEANUP_CONFIRMATION = 'cleanup-stale-lifecycle-data';
export const BANK_LINK_ARCHIVE_GUARDS_ENV =
  'LIFECYCLE_CLEANUP_BANK_LINK_GUARDS_JSON';

type CleanupEnvironment = Record<string, string | undefined>;

export type LifecycleCleanupDependencies = {
  webhookCleanup: Pick<WebhookEventCleanupService, 'cleanupExpiredPending'>;
  refreshTokenCleanup: Pick<
    RefreshTokenCleanupService,
    'cleanupInactiveTokens'
  >;
  recommendationCleanup: Pick<
    CategorizationRuleRecommendationService,
    'expireOldPendingSuggestions'
  >;
  notificationCleanup: Pick<
    NotificationService,
    'cleanupOldNotificationRecords'
  >;
  bankLinkLifecycle: Pick<
    BankLinkLifecycleService,
    'archiveEmptyBankLink' | 'archiveStaleEmptyBankLinks'
  >;
};

export type LifecycleCleanupResult = {
  bankLinks: {
    automaticArchivedCount: number;
    automaticBatchCount: number;
    automaticBatchLimitReached: boolean;
    exactGuardRequestedCount: number;
    exactGuardArchivedCount: number;
    exactGuardAlreadyArchivedCount: number;
  };
  webhookContexts: BatchCleanupResult;
  refreshTokens: BatchCleanupResult;
  suggestions: BatchCleanupResult;
  notifications: {
    deliveryDeletedCount: number;
    notificationDeletedCount: number;
    batchCount: number;
    batchLimitReached: boolean;
  };
};

type BatchCleanupResult = {
  affectedCount: number;
  batchCount: number;
  batchLimitReached: boolean;
};

export function readLifecycleCleanupGuards(
  environment: CleanupEnvironment,
): EmptyBankLinkArchiveGuard[] {
  if (environment.DISABLE_SCHEDULES !== 'true') {
    throw new Error('Refusing lifecycle cleanup unless DISABLE_SCHEDULES=true');
  }
  if (
    environment.CONFIRM_LIFECYCLE_CLEANUP !== LIFECYCLE_CLEANUP_CONFIRMATION
  ) {
    throw new Error('Lifecycle cleanup confirmation is missing or invalid');
  }

  const encodedGuards = environment[BANK_LINK_ARCHIVE_GUARDS_ENV];
  if (!encodedGuards) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(encodedGuards);
  } catch {
    throw new Error(`${BANK_LINK_ARCHIVE_GUARDS_ENV} must be valid JSON`);
  }
  if (!Array.isArray(parsed) || parsed.length > MAX_EXACT_BANK_LINK_GUARDS) {
    throw new Error(
      `${BANK_LINK_ARCHIVE_GUARDS_ENV} must be an array with at most ${MAX_EXACT_BANK_LINK_GUARDS} entries`,
    );
  }

  const seenBankLinkIds = new Set<string>();
  return parsed.map((value, index) => {
    if (!isRecord(value)) {
      throw new Error(`Bank link guard at index ${index} must be an object`);
    }
    const expectedKeys = [
      'bankLinkId',
      'expectedStatus',
      'expectedUpdatedAt',
      'userId',
    ];
    const actualKeys = Object.keys(value).sort();
    if (
      actualKeys.length !== expectedKeys.length ||
      actualKeys.some((key, keyIndex) => key !== expectedKeys[keyIndex])
    ) {
      throw new Error(`Bank link guard at index ${index} has invalid fields`);
    }
    const { bankLinkId, userId, expectedStatus, expectedUpdatedAt } = value;
    if (
      typeof bankLinkId !== 'string' ||
      bankLinkId.length === 0 ||
      typeof userId !== 'string' ||
      userId.length === 0
    ) {
      throw new Error(`Bank link guard at index ${index} has invalid identity`);
    }
    if (seenBankLinkIds.has(bankLinkId)) {
      throw new Error(`Bank link guard at index ${index} duplicates an id`);
    }
    const status = BankLinkStatusEnum.safeParse(expectedStatus);
    if (!status.success) {
      throw new Error(`Bank link guard at index ${index} has invalid status`);
    }
    if (typeof expectedUpdatedAt !== 'string') {
      throw new Error(
        `Bank link guard at index ${index} has invalid updatedAt`,
      );
    }
    const updatedAt = new Date(expectedUpdatedAt);
    if (
      !Number.isFinite(updatedAt.getTime()) ||
      updatedAt.toISOString() !== expectedUpdatedAt
    ) {
      throw new Error(
        `Bank link guard at index ${index} must use an exact ISO updatedAt`,
      );
    }
    seenBankLinkIds.add(bankLinkId);
    return {
      bankLinkId,
      userId,
      expectedStatus: status.data,
      expectedUpdatedAt: updatedAt,
    };
  });
}

export async function runLifecycleCleanup(
  dependencies: LifecycleCleanupDependencies,
  exactBankLinkGuards: EmptyBankLinkArchiveGuard[],
  now = new Date(),
): Promise<LifecycleCleanupResult> {
  const automaticBankLinks = await runUntilEmptyCountCleanup(
    (cleanupNow) =>
      dependencies.bankLinkLifecycle.archiveStaleEmptyBankLinks(cleanupNow),
    now,
  );
  let exactGuardArchivedCount = 0;
  let exactGuardAlreadyArchivedCount = 0;
  for (const guard of exactBankLinkGuards) {
    const archived =
      await dependencies.bankLinkLifecycle.archiveEmptyBankLink(guard);
    if (archived) {
      exactGuardArchivedCount += 1;
    } else {
      exactGuardAlreadyArchivedCount += 1;
    }
  }

  const webhookContexts = await runCountCleanup(
    (cleanupNow) =>
      dependencies.webhookCleanup.cleanupExpiredPending(
        cleanupNow,
        WEBHOOK_CLEANUP_BATCH_SIZE,
      ),
    WEBHOOK_CLEANUP_BATCH_SIZE,
    now,
  );
  const suggestions = await runCountCleanup(
    (cleanupNow) =>
      dependencies.recommendationCleanup.expireOldPendingSuggestions(
        cleanupNow,
      ),
    SUGGESTION_EXPIRY_BATCH_SIZE,
    now,
  );
  const refreshTokens = await runCountCleanup(
    (cleanupNow) =>
      dependencies.refreshTokenCleanup.cleanupInactiveTokens(
        cleanupNow,
        REFRESH_TOKEN_CLEANUP_BATCH_SIZE,
      ),
    REFRESH_TOKEN_CLEANUP_BATCH_SIZE,
    now,
  );
  const notifications = await runNotificationCleanup(
    dependencies.notificationCleanup,
    now,
  );

  return {
    bankLinks: {
      automaticArchivedCount: automaticBankLinks.affectedCount,
      automaticBatchCount: automaticBankLinks.batchCount,
      automaticBatchLimitReached: automaticBankLinks.batchLimitReached,
      exactGuardRequestedCount: exactBankLinkGuards.length,
      exactGuardArchivedCount,
      exactGuardAlreadyArchivedCount,
    },
    webhookContexts,
    refreshTokens,
    suggestions,
    notifications,
  };
}

async function runCountCleanup(
  cleanup: (now: Date) => Promise<number>,
  batchSize: number,
  now: Date,
): Promise<BatchCleanupResult> {
  let affectedCount = 0;
  let batchCount = 0;
  let lastBatchCount = 0;
  while (batchCount < MAX_BATCHES_PER_CLEANUP) {
    lastBatchCount = await cleanup(now);
    affectedCount += lastBatchCount;
    batchCount += 1;
    if (lastBatchCount < batchSize) {
      break;
    }
  }
  return {
    affectedCount,
    batchCount,
    batchLimitReached:
      batchCount === MAX_BATCHES_PER_CLEANUP && lastBatchCount === batchSize,
  };
}

async function runUntilEmptyCountCleanup(
  cleanup: (now: Date) => Promise<number>,
  now: Date,
): Promise<BatchCleanupResult> {
  let affectedCount = 0;
  let batchCount = 0;
  while (batchCount < MAX_BATCHES_PER_CLEANUP) {
    const batchAffectedCount = await cleanup(now);
    affectedCount += batchAffectedCount;
    batchCount += 1;
    if (batchAffectedCount === 0) {
      return { affectedCount, batchCount, batchLimitReached: false };
    }
  }
  return { affectedCount, batchCount, batchLimitReached: true };
}

async function runNotificationCleanup(
  cleanup: Pick<NotificationService, 'cleanupOldNotificationRecords'>,
  now: Date,
): Promise<LifecycleCleanupResult['notifications']> {
  let deliveryDeletedCount = 0;
  let notificationDeletedCount = 0;
  let batchCount = 0;
  let lastDeliveryCount = 0;
  let lastNotificationCount = 0;
  while (batchCount < MAX_BATCHES_PER_CLEANUP) {
    const batch = await cleanup.cleanupOldNotificationRecords(now);
    lastDeliveryCount = batch.deliveries;
    lastNotificationCount = batch.notifications;
    deliveryDeletedCount += batch.deliveries;
    notificationDeletedCount += batch.notifications;
    batchCount += 1;
    if (
      batch.deliveries < NOTIFICATION_CLEANUP_BATCH_SIZE &&
      batch.notifications < NOTIFICATION_CLEANUP_BATCH_SIZE
    ) {
      break;
    }
  }
  return {
    deliveryDeletedCount,
    notificationDeletedCount,
    batchCount,
    batchLimitReached:
      batchCount === MAX_BATCHES_PER_CLEANUP &&
      (lastDeliveryCount === NOTIFICATION_CLEANUP_BATCH_SIZE ||
        lastNotificationCount === NOTIFICATION_CLEANUP_BATCH_SIZE),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
