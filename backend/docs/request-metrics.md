# Request metrics and concurrent settings/authentication

`RequestMetricsModule` installs request-local measurement before HTTP guards. The standalone MCP runtime wraps the official SDK's existing Node request listener, preserving its authentication gate and lifecycle. Both use `AsyncLocalStorage`; no user data or authorization decisions persist between requests.

`installDatabaseMetrics(dataSource)` is idempotent and instruments that data source's query runners. Test or benchmark data sources created outside Nest must install it explicitly. `runWithRequestMetrics(work, complete)` scopes a service/transport operation and reports a copy of its counters to `complete`. `snapshotRequestMetrics()` returns only the current operation's counters.

The `Request performance` record includes:

- Elapsed request time, SQL statement count/time/errors, and returned row count. SQL time includes driver decoding but excludes connection acquisition. Transaction control statements count as SQL statements.
- Connection acquisition count/time/errors. Acquisition combines pool queue wait and connection setup; it is **not** a pure server-side query or pool-wait metric. A dedicated one-connection PostgreSQL test verifies actual contention is recorded here.
- Express JSON serialization/send duration when `res.json` is called; `null` when unavailable (including the SDK's independent serializer).
- Response bytes when a Content-Length is available; `null` for transports that do not provide it. Values are never estimated by serializing the response a second time.
- Transport and status. HTTP route attribution uses the framework's registered route template. No request URL, query string, token, user identity, raw SQL, parameters, provider payload, or financial values enter these records.

The performance harness must report its own instrumentation overhead in both comparison variants. Do not change the production pool size or timeout from these counters alone; retain concurrency results and distinguish acquisition delay from SQL time.

Settings, default notification initialization, and provider JSON replacement lock the user row for a short database transaction. Settings events are emitted only after successful commit, with the committed before/after settings. Each update writes its own fields; Google identity linking also avoids saving stale settings/provider JSON from an earlier lookup. Provider replacement retains its prior contract: replace one provider's object while preserving other providers.

PAT validation performs one narrow joined PostgreSQL statement. Its token row lock lasts only for the statement, serializing against revocation and user deletion via the existing cascading foreign key. The usage timestamp is conditionally written at most once per 60 seconds; a skipped usage write still returns the validated identity. Expiry is rechecked after lock waits. No authorization cache is used. These PAT changes benefit HTTP token authentication; standalone MCP uses Auth0 and receives no PAT speedup.

Run focused tests with `yarn test --runInBand test/user/user.service.spec.ts test/auth/personal-access-token.service.spec.ts test/observability/request-metrics.spec.ts`. For real races, set `BACKEND_BENCHMARK_DATABASE_URL` to the dedicated loopback `splice_backend_benchmark` database and run `test/user/settings-auth.postgres.spec.ts`. The helper applies real migrations in a fresh random schema and removes only that schema.
