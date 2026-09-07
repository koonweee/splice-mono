# Appearance first-paint validation

Verified locally on 2026-09-06 using the real development server (4000), the
production Nitro build (temporary port 4002), and isolated agent-browser sessions.
The production build is the successful `/tmp/splice-category-token-build.log`
checkpoint; subsequent touch-size-only changes do not alter the SSR/provider code.
Repeat this check against the final build before closing the implementation plan.

## Method

Serve the original app responses through a temporary loopback proxy that adds
`Content-Security-Policy: script-src 'none'; object-src 'none'` and
`Cache-Control: no-store`. Forward the browser's Cookie, Accept and Sec-Fetch-Dest
headers to the local upstream. Preserve response Content-Type. Do not rewrite
HTML, stylesheets, theme variables or component CSS. This prevents application
JavaScript from creating a correctly styled page after an incorrect server paint.

The test browser's `h1` had no React-attached properties in every server-only
measurement below. For hydration comparisons, open the original server URL and
explicitly wait for React to attach before reading computed styles. Use independent
authenticated and anonymous sessions; anonymous appearance cookies are synthetic
and do not update the user's server settings.

Browser request-pattern blocking was not reliable after previously loaded modules
and was discarded as evidence for anonymous pages. Likewise, an initial proxy
request that omitted stylesheet headers made Vite return JavaScript for CSS URLs;
that proxy artifact was corrected before the recorded development measurements.

## Observed results

| Page / appearance | Development server-only | Production server-only | Hydrated result |
| --- | --- | --- | --- |
| Authenticated Home, saved Dark/sage | Canvas/header `#1f2528`, heading 18px, width 390px | Same canvas/header, heading and width | Same in development and production |
| Anonymous landing, Light + `#0000ff` | Canvas `#ecedf7`, light scheme | Canvas `#ecedf7`, light scheme | Same canvas after explicit hydration wait in both builds |
| Anonymous landing, OLED + `#ff00ff` | Canvas `#000000`, dark scheme | Canvas `#000000`, dark scheme | Same black canvas after hydration in both builds |
| Authenticated Home, conflicting OLED browser cookie | Saved Dark/sage canvas/header and 18px heading | Not separately repeated with conflicting cookie | Server authority demonstrated in development; provider tests cover reconciliation |

The `theme-color` meta value matched the corresponding canvas in each measured
case. The HTML already sets `data-mantine-color-scheme`; the inline Mantine script
is not required to make these server-only renders select the correct scheme.

Development loaded all five third-party CSS files, application CSS, and inline
component-module styles. Production loaded seven stylesheets including the
persistent component stylesheet. A real production Home → Settings navigation
kept all seven stylesheet links enabled, retained `#1f2528`, and rendered Settings.

## Scope and remaining checks

These results establish correct CSS availability and computed appearance before
hydration for the listed cases. They do not prove every intermediate animation
frame, every route, every custom seed, or coordinated stale-client recovery.
The full responsive/theme matrix, final-build repeat and cross-session release
recovery exercise remain part of the implementation plan.

No saved user appearance was changed. Both test browsers and temporary proxy/
production-preview processes were closed. The normal app and workbench servers
were left running.


## Current-build repeat (2026-09-06, after token source review)

Repeated against the production build in `/tmp/splice-tokens-app-build.log`, which
also passed the 589-test frontend checkpoint. The same script-disabled loopback
proxy method was used. No saved user preference was changed.

| Case | Server-only | Hydrated |
| --- | --- | --- |
| Authenticated Home at 390px, Dark/sage | Canvas/header rgb(31,37,40), meta #1f2528, heading 18px; React marker absent | Identical colors/meta/heading; React marker present |
| Anonymous Light/blue (#0000ff) | Canvas rgb(236,237,247), meta #ecedf7, light scheme; React marker absent | Identical colors/meta/scheme; React marker present |
| Anonymous OLED/magenta (#ff00ff) | Black canvas, meta #000000, dark scheme; React marker absent | Identical colors/meta/scheme; React marker present |
| Authenticated Home with conflicting OLED/magenta cookie | Saved Dark/sage canvas/header and meta before React | Covered by ordinary hydrated Home result above |

Home exposed 13 document stylesheets and landing 9, including dynamically emitted
style elements; these counts are not directly comparable to the seven external
stylesheet links recorded earlier.

The attempted Home → Settings click did not yield a confirmed Settings URL before
measurement, so it is **not** navigation evidence for this build. The browser error
command returned an unlabeled error marker; its source was not resolved. Repeat
that navigation and inspect its actual completion/error state before closing the
release gate. No inference of a production navigation regression is made from
this incomplete observation.

Both isolated browsers, production preview and script-disabled proxy were closed.
Normal development and workbench servers were not stopped. Old cached-client
recovery and the final full visual matrix remain outstanding.


## Navigation and development hydration follow-up (2026-09-06)

Resolved the preceding uncertain navigation observation. With the production
menu open, selecting Settings reached `http://localhost:4002/settings`. The
hydrated heading is Settings at 18px; canvas/header remain rgb(31,37,40) and meta
#1f2528. All seven external stylesheet links, including persistent
`/assets/style-Y9AFo792.css`, remain enabled. The initial automated click sequence
was not sufficient evidence of completion; a subsequent settled selection was.

The formerly unlabeled browser error was expanded using JSON output. Its stack
and resource URL identify **development port 4000**, visited by the local login
redirect, not the production preview. It reported a hydration mismatch between
SSR `/src/styles.css` and the client HMR export `/src/styles.css?t=...`.
The root now uses the stable `/src/styles.css` URL in development while preserving
the imported production asset URL. This keeps both sides of hydration consistent;
the development server still revalidates the stylesheet on refresh.

A fresh named browser followed local login, loaded Home, and reloaded it. Its
error list was empty, React was attached, and the stylesheet href remained
`/src/styles.css`. Typecheck and lint pass (three existing warnings). Both named
browsers and the production preview were closed; normal dev/workbench untouched.
Old cached-client release recovery and the broader final matrix remain pending.

The previously pending same-origin old-client reload recovery was subsequently completed; see the local rehearsal in `appearance-release.md`. No compatibility adapter or production deployment was used.


## Final-build acceptance (2026-09-06)

Repeated the script-disabled proxy comparison against `/tmp/splice-theme-final-build.log`. Light/blue resolves to rgb(236,237,247) and #ecedf7; OLED/magenta resolves to black and #000000. A fresh authenticated browser resolves saved Dark/sage to rgb(31,37,40) and #1f2528, including when its appearance cookie conflicts. Each server-only result has no React marker; each hydrated result has one and identical canvas/meta/scheme. Browser errors are empty. The earlier request to repeat against the final build is satisfied.

Measurements and the capture script are in `splice-theme-review/final-paint/` under the task visualization directory. The production preview, script-disabled proxy and both named browsers were closed. The completed navigation and stale-client recovery checks above remain applicable: no navigation, persistence or provider code changed after those checks. No saved preference was changed in this final repeat.
