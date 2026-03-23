# Personal Access Token Management UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add responsive PAT management to the existing `/settings` page so users can create, view, copy, and revoke personal access tokens through the frontend.

**Architecture:** Keep the feature localized to the existing settings route, but split the PAT UI into a focused section component so the current settings form does not turn into one oversized file. Regenerate the Orval client for the new backend endpoints, keep PAT query/mutation state local to the settings surface, and cover behavior with Vitest component/helper tests plus manual responsive verification.

**Tech Stack:** React 19, TanStack Router, TanStack Query, Mantine, Orval, Vitest, Testing Library

---

## File Structure

### Files to Create

- `frontend/src/components/settings/PersonalAccessTokenSection.tsx`
  - Dedicated PAT UI: create form, one-time reveal, active-token list, revoke/copy actions, section-level loading/error states.
- `frontend/src/components/settings/PersonalAccessTokenSection.test.tsx`
  - Component tests for PAT-section loading, error, empty, create-success, revoke-success, and responsive structure.
- `frontend/src/lib/personal-access-tokens.ts`
  - Small UI helper functions for filtering active tokens, trimming/validating token names, and formatting token usage text.
- `frontend/src/lib/personal-access-tokens.test.ts`
  - Unit tests for helper logic that is easier to verify outside the component.

### Files to Modify

- `frontend/src/routes/_authed/settings.tsx`
  - Keep existing appearance/currency/timezone behavior intact and render the new PAT section below the current settings card.
- `frontend/orval.config.ts`
  - Only if needed to keep generation stable; otherwise leave unchanged.
- `frontend/src/api/clients/spliceAPI.ts`
  - Regenerated Orval hooks for `POST /user/tokens`, `GET /user/tokens`, `DELETE /user/tokens/:id`.
- `frontend/src/api/models/*`
  - Regenerated models for PAT request/response types and exports.

### Existing References to Read Before Editing

- `frontend/src/routes/_authed/settings.tsx`
- `frontend/package.json`
- `frontend/orval.config.ts`
- `frontend/src/api/axios.ts`
- `backend/docs/superpowers/specs/2026-03-22-personal-access-tokens-design.md`
- `docs/superpowers/specs/2026-03-22-pat-management-ui-design.md`

---

### Task 1: Regenerate Frontend API Client For PAT Endpoints

**Files:**
- Modify: `frontend/src/api/clients/spliceAPI.ts`
- Modify: `frontend/src/api/models/*`
- Test/Verify: `frontend/orval.config.ts`

- [ ] **Step 1: Start the feature backend on port 3000 so Orval can read the updated OpenAPI**

Run from the backend worktree:

```bash
cd /home/jtkw/splice-mono/.worktrees/personal-access-tokens/backend
set -a
source /home/jtkw/splice-mono/backend/.env
set +a
PORT=3000 yarn start
```

Expected: backend serves `http://localhost:3000/api-json` with `/user/tokens` in the schema.

- [ ] **Step 2: Regenerate the frontend API client**

Run:

```bash
cd /home/jtkw/splice-mono/frontend
yarn orval
```

Expected: regenerated hooks/models for the PAT endpoints appear under `src/api/clients` and `src/api/models`.

- [ ] **Step 3: Verify the generated surface matches the backend feature**

Check for generated hooks and types similar to:

```ts
useUserControllerCreateToken()
useUserControllerListTokens()
useUserControllerRevokeToken()
```

Also confirm the create response type includes `id`, `name`, `token`, `tokenPreview`, `expiresAt`, and `createdAt`.

- [ ] **Step 4: Run typecheck after generation**

Run:

```bash
cd /home/jtkw/splice-mono/frontend
yarn typecheck
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /home/jtkw/splice-mono/.worktrees/personal-access-tokens
git add frontend/src/api frontend/orval.config.ts
git commit -m "chore: regenerate frontend pat api client"
```

---

### Task 2: Add PAT UI Helper Logic With Unit Tests

**Files:**
- Create: `frontend/src/lib/personal-access-tokens.ts`
- Create: `frontend/src/lib/personal-access-tokens.test.ts`

- [ ] **Step 1: Write the failing helper tests**

Cover:
- filtering active tokens (`revokedAt == null` and not expired)
- name normalization/validation (`trim`, reject blank, respect max length 100)
- usage text (`Never used` vs readable last-used text)

Suggested test shape:

```ts
import { describe, expect, it } from 'vitest'
import {
  getActivePersonalAccessTokens,
  normalizePersonalAccessTokenName,
} from './personal-access-tokens'

describe('personal access token helpers', () => {
  it('filters out revoked and expired tokens', () => {
    expect(getActivePersonalAccessTokens(tokens, now)).toEqual([activeToken])
  })

  it('trims valid names and rejects blank names', () => {
    expect(normalizePersonalAccessTokenName('  codex-local  ')).toBe('codex-local')
    expect(() => normalizePersonalAccessTokenName('   ')).toThrow()
  })
})
```

- [ ] **Step 2: Run the helper test to verify it fails**

Run:

```bash
cd /home/jtkw/splice-mono/frontend
yarn test src/lib/personal-access-tokens.test.ts
```

Expected: FAIL because the helper module does not exist yet.

- [ ] **Step 3: Write the minimal helper implementation**

Implement focused pure functions only. Keep this file UI-adjacent, not a dumping ground.

Expected exports:

```ts
export function getActivePersonalAccessTokens(tokens: PersonalAccessToken[], now = new Date()): PersonalAccessToken[]
export function normalizePersonalAccessTokenName(name: string): string
export function getPersonalAccessTokenUsageText(lastUsedAt: string | Date | null): string
```

- [ ] **Step 4: Run the helper test to verify it passes**

Run:

```bash
cd /home/jtkw/splice-mono/frontend
yarn test src/lib/personal-access-tokens.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /home/jtkw/splice-mono/.worktrees/personal-access-tokens
git add frontend/src/lib/personal-access-tokens.ts frontend/src/lib/personal-access-tokens.test.ts
git commit -m "feat: add frontend pat ui helpers"
```

---

### Task 3: Build The PAT Section Component With Component Tests

**Files:**
- Create: `frontend/src/components/settings/PersonalAccessTokenSection.tsx`
- Create: `frontend/src/components/settings/PersonalAccessTokenSection.test.tsx`
- Reference: `frontend/src/api/clients/spliceAPI.ts`
- Reference: `frontend/src/lib/personal-access-tokens.ts`

- [ ] **Step 1: Write the failing component tests**

Cover these states:
- section loader while PAT query is pending
- PAT-section error with retry button when token list fetch fails
- empty state when active-token list is empty
- create success shows one-time reveal panel with returned raw token
- revoke success removes a token from the visible list
- mobile-friendly structure is present (stackable action container / no assumption of fixed desktop row)

Use Testing Library with mocked generated hooks. Keep tests on behavior, not Mantine internals.

Suggested test skeleton:

```tsx
it('shows the one-time reveal after create success', async () => {
  render(<PersonalAccessTokenSection />)
  await user.type(screen.getByLabelText(/token name/i), 'codex-local')
  await user.click(screen.getByRole('button', { name: /create token/i }))
  expect(await screen.findByText(/this token is shown once/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the PAT section test to verify it fails**

Run:

```bash
cd /home/jtkw/splice-mono/frontend
yarn test src/components/settings/PersonalAccessTokenSection.test.tsx
```

Expected: FAIL because the component does not exist yet.

- [ ] **Step 3: Implement the PAT section**

Requirements:
- use generated query/mutation hooks
- local state for `tokenName`, `revealedToken`, `revealedTokenId`, and lightweight clipboard feedback
- trim and validate `name` before submit
- section-specific loading/error/empty states
- inline one-time reveal with copy action
- active-token filtering via helper functions
- revoke clears the reveal panel only when the revoked token matches `revealedTokenId`
- responsive layout with wrapping/stacking action groups instead of hard-coded desktop-only widths

Keep the component self-contained and focused. If internal rendering branches become noisy, use small local render helpers in the same file before creating more files.

- [ ] **Step 4: Run the PAT section tests to verify they pass**

Run:

```bash
cd /home/jtkw/splice-mono/frontend
yarn test src/components/settings/PersonalAccessTokenSection.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /home/jtkw/splice-mono/.worktrees/personal-access-tokens
git add frontend/src/components/settings/PersonalAccessTokenSection.tsx frontend/src/components/settings/PersonalAccessTokenSection.test.tsx
git commit -m "feat: add settings pat management section"
```

---

### Task 4: Integrate PAT Section Into Settings Page

**Files:**
- Modify: `frontend/src/routes/_authed/settings.tsx`
- Reference: `frontend/src/components/settings/PersonalAccessTokenSection.tsx`

- [ ] **Step 1: Add a failing integration-level test or extend the PAT section test to protect the settings-page placement**

If a dedicated settings-route test is practical, create it; otherwise extend component coverage and verify the route render manually. The minimum automated check here is that the settings page still renders the original settings controls and now includes the PAT section heading.

Suggested assertion:

```tsx
expect(screen.getByRole('heading', { name: /settings/i })).toBeInTheDocument()
expect(screen.getByRole('heading', { name: /personal access tokens/i })).toBeInTheDocument()
```

- [ ] **Step 2: Run the relevant test to verify the expectation fails before integration**

Run whichever file you added or extended, for example:

```bash
cd /home/jtkw/splice-mono/frontend
yarn test src/components/settings/PersonalAccessTokenSection.test.tsx
```

Expected: FAIL because the settings route has not rendered the new section yet.

- [ ] **Step 3: Update the settings route**

Integrate `PersonalAccessTokenSection` below the existing settings `Paper`.

Guardrails:
- preserve current appearance/currency/timezone save behavior
- keep existing loading/error behavior for the user settings query
- avoid large unrelated refactors

- [ ] **Step 4: Run focused verification**

Run:

```bash
cd /home/jtkw/splice-mono/frontend
yarn test src/components/settings/PersonalAccessTokenSection.test.tsx
yarn typecheck
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /home/jtkw/splice-mono/.worktrees/personal-access-tokens
git add frontend/src/routes/_authed/settings.tsx
git commit -m "feat: integrate pat ui into settings page"
```

---

### Task 5: Full Frontend Verification And Manual Responsive Check

**Files:**
- Verify only

- [ ] **Step 1: Run the targeted frontend test set**

Run:

```bash
cd /home/jtkw/splice-mono/frontend
yarn test src/lib/personal-access-tokens.test.ts
yarn test src/components/settings/PersonalAccessTokenSection.test.tsx
```

Expected: PASS

- [ ] **Step 2: Run frontend quality checks**

Run:

```bash
cd /home/jtkw/splice-mono/frontend
yarn typecheck
yarn lint src/routes/_authed/settings.tsx src/components/settings/PersonalAccessTokenSection.tsx src/lib/personal-access-tokens.ts src/components/settings/PersonalAccessTokenSection.test.tsx src/lib/personal-access-tokens.test.ts
```

Expected: PASS

- [ ] **Step 3: Manually verify the UI against the feature backend**

Prereqs:
- feature backend running on `localhost:3000`
- frontend dev server running on `localhost:4000`

Run:

```bash
cd /home/jtkw/splice-mono/frontend
yarn dev
```

Manual checks:
- settings page still loads existing settings controls
- PAT section renders below the settings form
- create with blank/whitespace-only input is blocked client-side
- create success shows one-time reveal with copy button
- newly created token appears after PAT list refetch
- revoke removes the token from the list
- narrow viewport stacks token actions without horizontal overflow

- [ ] **Step 4: Commit any final verification-driven fixes**

If manual verification reveals issues, fix them with the smallest change and re-run the affected checks before committing.

- [ ] **Step 5: Commit**

```bash
cd /home/jtkw/splice-mono/.worktrees/personal-access-tokens
git add frontend
git commit -m "test: verify responsive pat settings ui"
```

