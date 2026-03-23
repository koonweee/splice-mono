# Personal Access Token Management UI Design

**Date:** 2026-03-22

## Goal

Add frontend UI for personal access token (PAT) management inside the existing authenticated settings page so users can:

- create a token
- view active tokens
- copy the one-time raw token after creation
- revoke a token

This UI should match the current settings page patterns and remain usable on desktop and mobile.

## Product Scope

### In Scope

- Add PAT management to `frontend/src/routes/_authed/settings.tsx`
- Call the existing backend `/user/tokens` endpoints
- Show an inline one-time reveal after successful token creation
- Show active token rows/cards
- Allow copying the newly created raw token
- Allow revoking a token
- Remove revoked tokens from the default list immediately
- Make the PAT section responsive

### Out of Scope

- Separate route such as `/settings/tokens`
- Rename tokens
- Expiration selection in the UI
- Displaying revoked tokens in the default list
- Search, filtering, or pagination for tokens
- Broader security/account settings rework

## Existing Context

- The current settings route is `frontend/src/routes/_authed/settings.tsx`
- The page already uses Mantine `Paper`, `Stack`, `Title`, `Text`, `Alert`, `Button`, and TanStack Query-backed hooks
- Backend support already exists on the feature branch:
  - `POST /user/tokens`
  - `GET /user/tokens`
  - `DELETE /user/tokens/:id`
- Backend default expiration is no expiration when `expiresAt` is omitted

## UX Design

## Placement

Keep PAT management on `/settings` as a second card below the existing settings form.

Reasons:

- Matches the current single-page settings structure
- Avoids new routing and nav complexity
- Keeps the new capability discoverable without dominating the page

## PAT Card Structure

The new settings section should be rendered as a dedicated `Paper` with:

1. Section title: `Personal Access Tokens`
2. Short helper text explaining that tokens are for machine access and the raw token is shown once
3. Inline create form
4. Optional inline one-time reveal panel after creation
5. Active token list
6. Inline error/success messaging as needed

## Create Form

Inputs:

- `name` text input, required

Controls:

- `Create Token` button

Behavior:

- Submit only `name`
- Do not expose expiration controls in V1
- Disable input and button while the create request is pending
- On success:
  - show the one-time raw token reveal inline
  - prepend the new token metadata to the visible list
  - clear the input

## One-Time Reveal Panel

After successful creation, show an inline success panel above the token list.

Panel contents:

- success message
- raw token value in a wrapping monospace block
- prominent `Copy Token` action
- warning text such as `This token is shown once`

Behavior:

- The panel is page-local state only
- It disappears on refresh/navigation
- Creating another token replaces the currently shown raw token
- If the token is revoked immediately, clear the reveal panel if it belongs to that token

## Token List

Show only active tokens in the default list.

Each item should display:

- `name`
- `tokenPreview`
- `lastUsedAt`
  - show relative or readable absolute text
  - if missing, show `Never used`
- revoke action

Optional convenience action:

- `Copy Preview`

Notes:

- `Copy Preview` copies only the visible preview string, not the secret
- Revoked tokens should disappear immediately after successful revoke
- Empty state should explain that no active tokens exist yet

## Responsive Layout

### Desktop

- PAT card uses the existing page width pattern
- Token rows use a compact 3-part layout:
  - token information
  - copy-preview button
  - revoke button
- Create form can use a two-column row:
  - name input
  - create button

### Tablet

- Token rows may wrap actions under the info block when width is constrained
- Create form may wrap if the action no longer fits comfortably beside the input

### Mobile

- Each token item becomes a stacked card
- Token information appears first
- Action buttons become full-width or shared-row buttons beneath the info
- Create form stacks vertically:
  - input first
  - button below
- Raw token reveal must wrap safely without horizontal overflow

## State Model

The settings page will manage three related UI surfaces:

1. Existing user settings state
2. PAT query/mutation state
3. One-time reveal local UI state

Keep the PAT-specific transient state local to the settings route. Do not introduce global state for this feature.

Local state should include at minimum:

- `tokenName`
- currently revealed raw token payload
- optional local feedback message for clipboard errors

## Data Flow

## API Client

Regenerate the Orval client so the frontend gets typed hooks/models for the PAT endpoints.

Expected generated usage:

- query for token list
- mutation for create
- mutation for revoke

## Query Behavior

Use TanStack Query patterns consistent with the rest of the app.

Recommended behavior:

- fetch the token list when `/settings` loads
- on create success:
  - update or invalidate the list query
  - show the returned raw token in local state
- on revoke success:
  - remove the token from the visible list via cache update or invalidation

## Error Handling

Create errors:

- show a card-level inline `Alert`
- preserve the entered name so the user can retry

Revoke errors:

- keep the token visible
- show inline feedback near the PAT section or affected row

Clipboard errors:

- show a lightweight inline message
- do not block the rest of the UI

Load errors:

- show a PAT-section-specific error rather than failing the whole settings page

## Implementation Shape

Keep the first pass localized.

Primary file:

- `frontend/src/routes/_authed/settings.tsx`

Likely supporting additions:

- regenerated API files under `frontend/src/api/`
- optional tiny helper formatting function if the existing frontend utilities do not already cover `lastUsedAt`

Avoid introducing a new route or a large component tree unless the settings file becomes materially harder to maintain.

## Testing

## Frontend Tests

Add route/component coverage for:

- empty token state
- populated token list
- create success showing one-time reveal
- revoke success removing a token from the visible list
- create failure messaging

## Manual Verification

Verify in the browser:

- desktop layout
- mobile/narrow layout
- one-time reveal copy flow
- token removal after revoke
- settings save flow still works unchanged

## Open Questions Resolved

- Location: inside `/settings`
- V1 features: create, list, copy, revoke only
- Default expiration shown in UI: none, because backend default is `null`
- One-time reveal presentation: inline, not modal
- Revoked tokens in default list: no, they disappear after revoke

## Acceptance Criteria

- `/settings` includes a PAT management section below the existing settings controls
- User can create a PAT by entering a name and clicking `Create Token`
- Successful create shows the raw token inline exactly once in page state
- User can copy the raw token from the inline reveal panel
- User can see active tokens with preview and usage metadata
- User can revoke a token and it disappears from the list immediately
- Layout remains usable on mobile without overflow or cramped action controls
