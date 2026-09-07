# Appearance contract release

This release replaces `settings.theme` with atomic `settings.appearance`:
`{ mode: 'light' | 'dark' | 'oled', accent: '#rrggbb' | null }`.
Existing selections reset to Dark + sage. Currency, timezone, notification
preferences and other JSONB fields are preserved by the migration. Null means
neutral, not an omitted update. No old presets or browser keys are read.

Deploy backend, migration and frontend as one coordinated release. Run the
migration with the new backend before switching traffic to the new frontend.
Avoid serving the new client against the old API: it cannot save this contract.
Old cached clients sending `theme` receive HTTP 400; reload to acquire the new
client. Do not add a dual-write compatibility adapter. The service worker does
not cache authenticated HTML; existing CSS delivery remains server-first.

Before rollout, back up settings if preserving the old selections is operationally
important. The down migration intentionally refuses automatic reversal: deleted
selections cannot be reconstructed. Reverting requires the previous application
code plus an explicit settings backup recovery or a deliberate old-format reset.
Never describe a default reset as restoration of original selections.

Local validation uses the loopback `splice_backend_benchmark` database and random
schemas through `test/helpers/isolated-postgres.ts`. Migration coverage verifies
unknown fields, nested preferences, empty/JSON-null values and the SQL default.
The normal local database has also received this migration. No production deploy
has been performed for this implementation.


## Local incompatible-client recovery rehearsal (2026-09-06)

Used the isolated production build from revision `7bcfbd3` and the current
production build behind one loopback URL, `http://localhost:5173/settings`.
A temporary GET/HEAD proxy switched upstream from the historical build (4010) to
the current build (4002). Both used the current local backend and migrated database.
Port 5173 is already a permitted local API origin; no CORS configuration changed.

1. Opened the historical Settings UI and selected Dracula. Its actual Save changes
   action showed “Failed to save settings.” A before/after comparison of the whole
   settings object showed no changes.
2. Switched the proxy to the new build and reloaded the same URL. Light/Dark/OLED,
   neutral/curated accent choices and the custom picker replaced the four presets.
   Dark/sage was selected from the authoritative server preference, despite the old
   client's local preset preference. Canvas/header/meta matched #1f2528.
3. A direct old-format PATCH from that origin returned HTTP 400 with the `theme`
   key rejected. A new-format PATCH containing the already-saved appearance returned
   HTTP 200, and the entire settings object remained unchanged.
4. The browser error list was empty. Closed the named browser, both production
   previews and the proxy. The normal development app and workbench remain running.

This rehearses the incompatible-client window and reload recovery without adding
compatibility code or deploying production. Migration/reset integrity is covered
by the isolated PostgreSQL tests described above. The rehearsal does not simulate
an actual CDN deployment or claim recovery of deleted historical preferences.
