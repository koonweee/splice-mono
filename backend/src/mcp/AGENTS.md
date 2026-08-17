# Splice MCP Apps Agent Guidance

These instructions apply to MCP App work anywhere under `backend/src/mcp/`,
including App resources, App-backed tool definitions, extensions, and browser
runtime code.

Read and follow
[`docs/mcp-app-product-guidance.md`](../../../docs/mcp-app-product-guidance.md)
before adding an App, changing an App-backed interaction or invocation contract,
or redesigning an App surface. Treat its product role, invocation rules,
lifecycle boundaries, mobile requirements, and validation checklist as
acceptance criteria.

In particular:

- Build curated, selectively invoked visual evidence for a conversation, not a
  miniature Splice dashboard.
- Keep model interpretation in the surrounding response and keep the App
  focused on values, relationships, provenance, and supporting evidence.
- Prefer a stable, mobile-first visual grammar and progressive disclosure over
  controls, alternate chart modes, or dense tables.
- Let conversation provide query parameters unless an in-App control has a
  demonstrated product advantage.
- Keep Apps read-only by default and preserve complete text/structured fallback
  results for hosts without App support.
- Use the official MCP Apps bridge through `@koonweee/mcp-kit/apps`; never add a
  local bridge or protocol implementation.
- Render only current authenticated data. Clear result-derived state at every
  lifecycle generation boundary and ignore late work from older results.
- Keep sample data in test fixtures, never in the production resource.
- Validate material UI changes through the official-host and responsive visual
  workflow in `docs/mcp.md`, including phone dark/light captures and truthful
  loading, empty, ready, and error states.

If a proposed App does not have a specific user question, selective invocation
contract, primary visual story, and useful non-App fallback, stop and resolve
those decisions before implementing it.
