# Bank connection health

Plaid status webhooks remain the immediate source of connection errors. Splice also checks expected account access after reconnect, records actionable errors from normal sync fetches, checks overdue connections after Home/Accounts data loads, and reconciles all active Plaid connections daily at 04:30 America/Los_Angeles.

Automatic checks are cached for one hour across replicas. Manual Check connection requests have a one-minute cooldown. A five-minute database lease prevents overlapping probes and recovers abandoned work. Reconnect verification supersedes an older probe; lifecycle locks and status/token checks prevent stale results from overwriting reconnects or archives. No provider call holds a lifecycle lock.

`NO_ACCOUNTS`, missing expected active account IDs, and login/access errors expose Fix and reuse the existing attention notification path. Repeated observations of the same issue do not create another notification. Reconnect uses Plaid update mode with account selection enabled. Account names identify the affected connection in new notifications. Reconnect remains available in account actions even while status is Connected.

Provider delay and unfinished imports are separate from missing access. Investment update timestamps allow three weekdays; banking updates allow 72 hours. An investment generation that remains incomplete for six hours is shown as an import delay. These delays expose Check connection and do not prescribe login repair. Provider connection timestamps advance even without new transactions; an empty holdings list is valid when the expected account remains present. Timeouts/outages produce an unavailable check, preserving an existing repair error.

Health checks read cached provider item/account information; they do not request a provider refresh, replace holdings, modify balances, delete missing accounts, or rotate credentials. Stale-load selection checks each active account's last provider-sync snapshot, excluding forward fills and manual balance writes. The legacy seven-day warning remains a fallback when no recent verified health result exists.

The migration adds nullable JSON health and check/lease timestamps to bank links. Older images can run with these extra columns retained during rollback. Public API responses expose only sanitized health; authentication and lease fields stay private. Health endpoints are authenticated and owner scoped.

## Account IDs after reconnect

Plaid can issue a new account_id when permissions are restored. Fix carries the stable Splice account UUID, and the server stores its current provider ID in the private reconnect-session context. After verified session success, a replacement is accepted only for that selected missing account, with all sibling IDs still present and exactly one previously unknown returned ID. Legacy single-account sessions can infer their sole target. Names, masks and balances never determine the mapping; multiple missing accounts or replacement candidates remain unresolved. The provider binding and connection ID cache change atomically under the lifecycle lock, preserving Splice history and user settings. Background sync and health probes retain strict ID validation.

See [Plaid's ID-rotation guidance](https://plaid.com/docs/errors/invalid-input/#invalid_account_id) and [account field limitations](https://plaid.com/docs/api/accounts/). This explicit-session policy is Splice's reconciliation rule; Plaid does not provide a universal immutable brokerage-account identifier.
