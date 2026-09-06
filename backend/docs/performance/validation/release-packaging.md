# Release PR packaging validation

The backend query/exact-money changes were packaged on 2026-09-05 (America/Los_Angeles) in an isolated worktree based on `origin/main` at `e8f815c9842dc28f698d10388f8c9f66f6fcf332`. Existing SSR changes remain present. The original checkout, HEAD and index were preserved.

All 749 files under `backend/src` and `frontend/src` match the validated final source snapshot byte for byte. This includes the generated API client, currency registry and MCP App runtime. The frontend build regenerated only a type augmentation in `routeTree.gen.ts`; the existing generated file shared by current main and the frozen snapshot was restored afterward. No application behavior changed during packaging.

## Fresh checks in the isolated worktree

| Check | Result |
| --- | --- |
| Backend `yarn lint` and `yarn typecheck` | Passed |
| Backend `yarn test --runInBand`, with the guarded local database configured | 109 suites / 1,150 tests passed; one benchmark harness test required compilation first |
| `yarn tsc --project tsconfig.build.json --outDir .benchmark-build --incremental false`, then `yarn test --runInBand test/performance/backend-postgres.spec.ts` | Passed; remaining suite / test passed, giving 110 suites / 1,151 tests across the two runs |
| Backend `yarn build` | Passed, including regenerated MCP App runtime |
| Frontend `yarn lint` and `yarn typecheck` | Passed; three existing lint warnings |
| Frontend `yarn test --maxWorkers=2 --minWorkers=1` | 69 files / 435 tests passed |
| Frontend `yarn build` | Passed, including SSR/Nitro production output |
| Existing relative links in changed Markdown documentation | 141 checked; no missing targets |
| Independent, read-only packaging review | No major packaging blockers |

The first frontend run had one five-second settings-test timeout while both apps and their static checks were running concurrently. The complete suite passed with two workers. The initial backend runs lacked the benchmark harness's separate compiled fixture; the remaining test passed after compiling it with the explicit command above. PostgreSQL checks used synthetic schemas in the dedicated loopback `splice_backend_benchmark` database and the existing guarded cleanup. No production or user-data workload was run.

The completed performance measurements and browser/MCP App checks were not repeated because the application source is unchanged. Their scope, results and known costs remain in [the performance report](../../backend-query-performance.md) and [the implementation validation](backend-checks.md). The user-approved shorter benchmark scope remains unchanged.

## Included files and release boundary

Application code, tests, maintained benchmark tools, generated client/App code, release documentation and durable benchmark evidence are included. The source archives exclude dependencies, secrets and build output. Documented superseded and diagnostic captures remain available for provenance; they are not presented as current acceptance results. Machine-captured JSON is marked generated for GitHub review so that code and Markdown reports are easier to inspect.

The three migrations are:

- `ExactMoney1788642000000`
- `AddHoldingsSnapshots1788643000000`
- `CanonicalTransactionActivityDates1788644000000`

Transient compiled benchmark files, node_modules, environment files and production build output are excluded from the PR. Docker package caching remains in the independent PR #261; Dockerfiles and deployment workflows are unchanged here. This packaging task does not merge, deploy or run production migrations. The release coordinator must still validate the combined build/CI and perform the coordinated backup, migration and application cutover described in [the release notes](../../backend-query-release-notes.md).
