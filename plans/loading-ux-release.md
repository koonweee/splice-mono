# Loading UX release

Scope: frontend-only implementation of `instant-navigation-stable-loading.md`.
User explicitly authorized implementation and deployment. No database migration,
API change, infrastructure configuration change, or backend rollout is needed.

1. Complete plan ledger, independent review, production-fixture browser checks,
   frontend tests/lint/typecheck/build. Commit the isolated implementation branch.
2. Open and merge its PR to main after required checks pass on the final head.
3. Dispatch the repository Deploy workflow from main (`confirm=deploy`). Wait for
   its protected main-to-deploy comparison checks and merge.
4. Observe the webhook-triggered frontend build; match its image source commit to
   the promoted deploy commit. Do not dispatch a duplicate build.
5. Record all existing frontend/backend container identities. Pre-pull the exact
   successful frontend image on vps, sg, sf; deploy only splice-frontend services.
6. Verify each operation reaches successful completion, all frontend replicas are
   healthy and have the intended published digest, and backend identities remain
   unchanged. Check public SSR/auth redirects, static assets/styles and API health.

Rollback: keep the preceding successful frontend image digest and each server's
image identity in the release evidence. If verification fails, restore that image
for the frontend services through the established Komodo procedure, then verify
health and public assets. Keep backend untouched. Reconcile any lasting change to
infrastructure configuration in the stack repository; this rollout requires none.

Operational source of truth: `/Users/jtkw/projects/stack` Komodo resource files.
Credentials are loaded only in the API helper process and are never included in
artifacts or command output. Release outcomes and exact commits/digests will be
recorded after execution.
