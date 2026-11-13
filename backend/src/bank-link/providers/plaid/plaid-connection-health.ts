import type { ConnectionIssue } from '../../../types/BankLinkHealth';

export class MissingProviderAccountsError extends Error {
  constructor(
    message = 'The provider no longer exposes one or more linked accounts.',
  ) {
    super(message);
  }
}

/** Extract only machine-readable codes; never serialize SDK request credentials. */
export function getConnectionIssue(error: unknown): ConnectionIssue | null {
  if (error instanceof MissingProviderAccountsError) {
    return {
      code: 'ACCOUNTS_MISSING',
      reason: 'accounts_missing',
      message: error.message,
    };
  }
  if (typeof error !== 'object' || error === null) return null;
  const response: unknown = 'response' in error ? error.response : undefined;
  const data: unknown =
    typeof response === 'object' && response !== null && 'data' in response
      ? response.data
      : error;
  if (typeof data !== 'object' || data === null || !('error_code' in data))
    return null;
  switch (data.error_code) {
    case 'ITEM_LOGIN_REQUIRED':
    case 'INVALID_ACCESS_TOKEN':
    case 'ITEM_NOT_FOUND':
    case 'ACCESS_NOT_GRANTED':
      return {
        code: String(data.error_code),
        reason: 'login_required',
        message: 'Reconnect this connection to restore account access.',
      };
    case 'CONSENT_EXPIRING':
      return {
        code: 'CONSENT_EXPIRING',
        reason: 'consent_required',
        message: 'Renew consent to keep these accounts connected.',
      };
    case 'ACCOUNTS_MISSING':
    case 'NO_ACCOUNTS':
    case 'NO_INVESTMENT_ACCOUNTS':
      return {
        code: String(data.error_code),
        reason: 'accounts_missing',
        message:
          'The provider cannot access the linked accounts. Reconnect and review the accounts shared with Splice.',
      };
    default:
      return null;
  }
}
