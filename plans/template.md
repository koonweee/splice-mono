# Plan Title

## Status

Planned

## Goal

Describe the outcome this plan is meant to achieve. Be concrete about user-facing behavior, system behavior, and any boundaries that should not change.

## Current Behavior

- Summarize the relevant current implementation.
- Include important files, APIs, tables, jobs, or workflows.
- Note known constraints or risks.

## Target Data Shape

Use this section when the plan changes API contracts, database shape, event payloads, generated clients, or shared types.

```ts
type Example = {
  existingField: string
  newField: string | null
}
```

If the plan does not change shared data shape, say so explicitly.

## Milestones

### 1. Milestone Name

Implementation tasks:

- Add the smallest coherent set of changes for this milestone.
- Keep tasks specific enough that an implementer can execute without re-planning the whole feature.
- Include migrations, generated-code steps, or compatibility work when relevant.

Exit criteria:

- State the observable conditions that prove this milestone is complete.
- Include command-level validation when it is specific to this milestone.
- Include rollback or compatibility expectations when relevant.

### 2. Milestone Name

Implementation tasks:

- Continue with the next independently reviewable slice.

Exit criteria:

- Define what must be true before moving on.

## Tests

### Backend

- List unit, integration, e2e, migration, or service tests that must be added or updated.
- Include negative cases, ownership/authorization cases, and sync/background behavior where applicable.

### Frontend

- List component, route, interaction, and generated-client tests that must be added or updated.
- Include loading, error, empty, optimistic update, and accessibility-relevant states where applicable.

## Validation Commands

Backend:

```bash
cd backend && yarn test
cd backend && yarn lint
```

Frontend:

```bash
cd frontend && yarn test
cd frontend && yarn lint
cd frontend && yarn typecheck
```

Add any feature-specific commands, such as migrations, API generation, or targeted tests.

## Overall Exit Criteria

- Describe the end-to-end behavior that must work for the plan to be considered done.
- Include user-facing acceptance criteria.
- Include API, data, migration, or sync invariants.
- Include required validation commands passing.
