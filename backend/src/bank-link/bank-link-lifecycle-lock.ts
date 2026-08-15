export const BANK_LINK_LIFECYCLE_LOCK_SQL =
  'SELECT pg_advisory_lock(hashtextextended($1, 1777502000))';

export const BANK_LINK_LIFECYCLE_UNLOCK_SQL =
  'SELECT pg_advisory_unlock(hashtextextended($1, 1777502000))';

export const BANK_LINK_LIFECYCLE_TRANSACTION_LOCK_SQL =
  'SELECT pg_advisory_xact_lock(hashtextextended($1, 1777502000))';
