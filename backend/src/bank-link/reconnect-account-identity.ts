import { MissingProviderAccountsError } from './providers/plaid/plaid-connection-health';

type LinkedAccountIdentity = {
  id: string;
  externalAccountId: string | null;
  archivedAt: Date | null;
};

/** Server-captured binding of the account the user chose to repair. */
export type ReconnectAccountTarget = {
  accountId: string;
  externalAccountId: string | null;
};

/**
 * Resolve ID rotation by explicit reconnect scope, never by account metadata.
 * Plaid can rotate account_id after permission restoration. Its mask/name are
 * not unique identifiers: https://plaid.com/docs/errors/invalid-input/#invalid_account_id
 * A replacement is unambiguous only when every other active account retains
 * its ID and precisely one previously unknown ID remains in this same Item.
 */
export function resolveReconnectAccountReplacement(
  stored: LinkedAccountIdentity[],
  returnedIds: string[],
  target?: ReconnectAccountTarget,
): { accountId: string; previousId: string; replacementId: string } | null {
  const returned = new Set(returnedIds);
  const active = stored.filter((account) => !account.archivedAt);
  const missing = active.filter(
    (account) =>
      account.externalAccountId && !returned.has(account.externalAccountId),
  );
  if (returned.size !== returnedIds.length) {
    throw new MissingProviderAccountsError(
      'The provider returned duplicate account identifiers. Try checking the connection again.',
    );
  }
  const selected = target
    ? active.find((account) => account.id === target.accountId)
    : active.length === 1
      ? active[0]
      : undefined;
  if (target && !selected) {
    throw new MissingProviderAccountsError(
      'The account selected for repair is no longer active on this connection.',
    );
  }
  if (!missing.length) return null;
  if (!selected?.externalAccountId) {
    throw new MissingProviderAccountsError(
      'The bank reconnected, but the replacement must be associated with a specific Splice account.',
    );
  }
  if (target && selected.externalAccountId !== target.externalAccountId) {
    throw new MissingProviderAccountsError(
      'This account was changed by another reconnect. Start a new repair from the account.',
    );
  }
  const existingIds = new Set(
    stored.map((account) => account.externalAccountId),
  );
  const replacements = returnedIds.filter((id) => !existingIds.has(id));
  if (
    missing.length !== 1 ||
    missing[0].id !== selected.id ||
    replacements.length !== 1
  ) {
    throw new MissingProviderAccountsError(
      'The bank reconnected, but the returned accounts cannot be associated unambiguously. Existing account history has been preserved.',
    );
  }
  return {
    accountId: selected.id,
    previousId: selected.externalAccountId,
    replacementId: replacements[0],
  };
}
