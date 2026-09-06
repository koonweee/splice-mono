# Backend Query Implementation Ledger

Status: Done

All acceptance items and evidence are tracked in [the machine-readable ledger](./backend-query-implementation-ledger.json). The scope is the complete [implementation plan](./backend-query-performance-and-correctness.md), with the user's subsequently requested shorter benchmark protocol. All ten implementation milestones and correctness checks remain required. Original exhaustive sampling criteria are preserved as `originalText` where amended; they are no longer completion gates.

| Milestone | Status   | Evidence                                                                                                                                                                                       |
| --------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1         | verified | Frozen original/final archives and source/build/protocol identities retained. Rigorous 10k and focused comparisons pass; actual PostgreSQL/HTTP/MCP plans and measurements saved.              |
| 2         | verified | Exact money storage/API/frontend and browser precision pass. Four PostgreSQL migration/JSON/rollback checks, three million-row migration measurements and backup/restore rehearsal pass.       |
| 3         | verified | Shared holdings and atomic fenced writes; 12 PostgreSQL cases including inverse-rate ties pass. Complete/empty/0–100-position benchmark and browser/MCP cases pass.                            |
| 4         | verified | Shared transaction queries and cursor client; 11 PostgreSQL pagination/date-invariant cases pass. Scale/filter/ordered cursor measurements pass; retained deep-offset spill is documented.     |
| 5         | verified | Sparse batched FX and exact date policy pass. Real PostgreSQL proofs and bounded rare/no-match continuation oracles pass; historical quote costs are reported.                                 |
| 6         | verified | Shared coherent report context; 41 unit/property and 7 PostgreSQL/HTTP cases pass. Large report and matching CPU targets pass in the rigorous comparison.                                      |
| 7         | verified | Batched banking sync; 14 PostgreSQL cases and short 50/500/5,000-row measurements pass, including rollback/replacements/overlap. Mixed read/write evidence saved.                              |
| 8         | verified | Shared streamed history and explicit compact sampling pass exact-output checks. Daily/compact CPU, payload and four isolated memory shapes measured.                                           |
| 9         | verified | Atomic settings/PAT and sanitized metrics pass real races, physical usage-write checks, persisted patches and pool/transport measurements.                                                     |
| 10        | verified | 109 backend suites / 1,148 tests, 435 frontend tests and final 16 harness tests pass. Production web/official App checks, focused measurements and all six regression investigations complete. |

Baseline: `/tmp/splice-backend-baseline-20260905-135633`; source tree SHA-256 `b90c484a3ccd636fd02e8254508ec5367b166ac25dc425b59de5cd2d90184a56`.

The [completed 10,000-row comparison](../backend/docs/performance/backend-query/comparison-10000.md) covers 35 scenarios, with 100 measured calls in three independent processes for every successful latency case. Exact-output, ordering, provenance and query-budget checks passed, with no material regression flags. The two original amount-sort failures are recorded separately and the final sort results pass an ordered SQL oracle. The [focused comparison](../backend/docs/performance/backend-query/focused/comparison.md) completes 130 diagnostic pairs, eight paired 30-second mixed phases and four isolated memory shapes. It explicitly omits the superseded exhaustive repeats. All six diagnostic regression flags are investigated and explained in the [report](../backend/docs/backend-query-performance.md).

Review passes: 8 independent passes. The fifth identified benchmark provenance, coverage and labeling gaps; the sixth cleared all seven fixes. The seventh cleared the shortened protocol while preserving strict correctness and provenance gates. The eighth reviewed all 158 verified criteria, completed measurements, regression explanations, migration/recovery and browser/test evidence, and concluded: **No major issues remain.** See [final review](../backend/docs/performance/validation/final-review.md). No application source differs from the measured final, and no deployment was performed.
