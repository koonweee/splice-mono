# Recovered styling baseline

Captured on 2026-09-06 from revision
`7bcfbd303b212bcbbb23461f27b16ea1fd2622ed` (`style(home): soften chart fill and bottom fade`).
This is a recovered historical baseline, made after implementation began. It is
not evidence that the audit and visual capture originally preceded centralization.

Artifact directory:
`/Users/jtkw/.codex/visualizations/2026/09/06/01a07786-1bbf-7880-8634-0d91a397310b/splice-theme-review/baseline-7bcfbd3/`.
`provenance.json` records the revision, capture conditions and image checksums.

## Source and isolation

Extracted `frontend/` with `git archive` to `/tmp/splice-baseline-7bcfbd3`.
Reused the installed dependencies; the dependency lockfile has not changed.
Only Vite's cache directory was changed in the extracted configuration. The old
component source, global CSS and theme implementation were not edited. Verified
SHA-256 against `git show`:

| Historical source | SHA-256 |
| --- | --- |
| `src/styles.css` | `ee7f0b24d5daf57cb6b1f8518e215d1f0621e1791803a1db97e3a61c64c0fabb` |
| `src/lib/theme.ts` | `ff2fc9e6e72b2184eef0ff5e1ae884162c4f5e1362c0eab30126abedd973dd94` |

The isolated production build ran on 4010, with a read-only synthetic API on 4011.
The API uses bundled workbench fixtures and returns the historical `theme:dracula`
setting; it accepts only GET/OPTIONS. No production account data, model, market
provider or real credentials were used. A noncredential sentinel cookie permitted
the old SSR session gate to read the synthetic user. The dedicated browser and
both temporary servers were closed after capture. Normal app/backend/workbench
servers were left running.

The initial extracted development server failed to serve its virtual client entry.
Those server-rendered captures were replaced with captures from the working
production build. Browser errors in the saved logs are cumulative and include
that failed attempt; this baseline is not a clean runtime-error audit.

## Captures

All screenshots use device scale 2 and a 1000px viewport height. Pages were allowed
to settle for 1200ms after navigation. Synthetic fixture dates use September 2026.
The old Dracula preset matches the original Home design reference.

| Surface | Widths | Files |
| --- | --- | --- |
| Home | 390, 1440 | `home-dracula-{width}.png` |
| Accounts | 390, 1440 | `accounts-dracula-{width}.png` |
| Transactions | 390, 1440 | `transactions-dracula-{width}.png` |
| Analysis | 390, 1440 | `analysis-dracula-{width}.png` |
| Settings | 390, 1440 | `settings-dracula-{width}.png` |
| Account details / holdings | 744 | `account-dialog-dracula-744.png` |
| Manual transaction editor | 744 | `transaction-editor-dracula-744.png` |
| Editor with date picker | 744 | `editor-date-dracula-744.png` |

Inspected raw Home/Accounts/Transactions phone captures, Settings phone,
account details and transaction editor. Earlier server-rendered inspection also
examined Analysis phone and Settings/Transactions desktop; final hydrated images
replace those earlier files. Review of every baseline image and the final annotated
before/after sheet remains separate from capture completion.

## Comparison findings

The recovered source confirms the previous broad purple surface treatment,
bright account separators, saturated green financial/graph colors, and large
four-preset Settings grid. The new implementation intentionally replaces those
with restrained base/accent surfaces, quieter separators, an independently
accented net-worth graph and compact appearance controls.

The same synthetic large/negative/zero amounts and long names are available in
both versions. Layout behavior should be compared on those shared fixtures;
changes in hue alone are intentional. The old phone Accounts layout shows the
long name squeezed alongside its actions; current responsive account rows were
already adjusted during workbench validation. This baseline does not replace the
remaining full current-mode, state and viewport review.
