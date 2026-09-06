# Loading UX: measured before and after

Three samples per scenario, production builds, synthetic data, identical desktop viewport and throttle. The [protocol](README.md) describes fixture continuity, browser-process renewal, observation windows, and limits. [Visual validation](validation.md) covers the broader interaction/layout audit.

The final 49px virtualizer estimate was checked with three rebuilt cold and three rebuilt warmed Transactions samples. Other rows and whole-document resource costs retain the completed matrix from immediately before that isolated estimate correction. The original 36 candidate samples remain under `after-previrtualizer-*`; no full-matrix retest of that final one-line change is claimed.

| Scenario               | Before useful | After useful | Change |
| ---------------------- | ------------: | -----------: | -----: |
| cold-home              |         789ms |        790ms |   +1ms |
| immediate-transactions |         966ms |        962ms |   -3ms |
| warmed-transactions    |         643ms |        109ms | -533ms |
| warmed-accounts        |         121ms |         25ms |  -95ms |
| warmed-analysis        |         119ms |         22ms |  -97ms |
| warmed-settings        |         149ms |         49ms | -100ms |
| cached-home            |          31ms |         32ms |   +1ms |
| cached-transactions    |         104ms |        115ms |  +11ms |
| stale-home             |          46ms |         45ms |   -2ms |
| period-week            |         114ms |        118ms |   +4ms |
| cold-transactions      |         843ms |        826ms |  -17ms |

Cold Home chart: **1,852ms → 1,876ms**. The first contended candidate is retained separately; these numbers include the foreground-chart scheduling correction.

First Analysis chart after five seconds on Home: **475ms → 329ms**. This is the first rendered chart, not a claim that every optional section has finished.

## Preparation cost

The whole-document supplement includes Home, its idle work, and navigation to Analysis. It captures work begun before link-click timing. These costs are deliberately reported alongside the navigation gains.

| Whole-document metric |     Before |      After | Difference |
| --------------------- | ---------: | ---------: | ---------: |
| Browser requests      |         49 |         87 |        +38 |
| API requests          |          2 |          4 |         +2 |
| All transferred bytes | 1654.5 KiB | 2082.2 KiB | +427.7 KiB |
| API transferred bytes |    1.1 KiB |   66.1 KiB |  +65.0 KiB |

## Layout and request-order checks

- Home period: layout-shift entries across three samples 6 → 0.
- Cold Home: layout-shift entries across three samples 0 → 0.
- Cold Transactions: layout-shift entries across three samples 0 → 0.
- before Home: chart code starts 1,379ms and finishes 1,830ms after document start. Transactions speculation does not occur in this window.
- after Home: chart code starts 1,397ms and finishes 1,853ms after document start. Transactions speculation starts 1,884ms.
- All 249 recorded shift entries in the selected final scenarios are classified as deliberate horizontal navigation-drawer motion. Cold loads and Home period changes have no shift entries.
- cold-home maximum retained anchor-origin movement: 0.00px → 0.00px. Within the 1px acceptance limit.
- cold-transactions maximum retained anchor-origin movement: 44.10px → 0.00px. Within the 1px acceptance limit.
- period-week maximum retained anchor-origin movement: 32.30px → 0.00px. Within the 1px acceptance limit.
- Final measured runtime/failed-request error count: 0. Cached script responses in cold samples: 0.
- Console warnings: 21, all the same Recharts initial-size warning. The rendered charts have positive bounds and their anchors remain stable. The original baseline did not capture console warnings, so warning-frequency parity is not claimed.

Every shift is retained in raw JSON and enumerated by the shift-classification artifacts. Deliberate drawer motion is reported separately from loading movement; source-less classifications cite adjacent anchor evidence. No aggregate CLS result substitutes for those checks.

These are frontend changes. The benchmark makes no backend or MCP performance claim.
