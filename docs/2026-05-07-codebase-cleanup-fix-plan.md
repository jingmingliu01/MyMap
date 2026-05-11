# Codebase Cleanup Fix Plan

## Context

Sub-agent review found that the project is functional, but a few state-model and cleanup issues should be fixed before more features are added.

This document records the issues and the intended fix order.

## Fix Order

### 1. Preview and Apply State

Problems:

- Route-only AI previews can write `data/routes.preview.json`, but the UI only treats `data/map-state.preview.json` as a preview.
- `applyPreview()` refuses to apply route-only previews.
- Point-only preview application defaults missing route preview to an empty route list, which can wipe existing routes.

Fix:

- Treat either point preview or route preview as a real pending preview.
- Allow route-only preview application.
- Preserve existing routes when applying point-only previews.
- Preserve existing points when applying route-only previews.

### 2. Point ID Normalization

Problem:

- Applying point edits renumbers visible points but leaves hidden points with old IDs. That can create duplicate IDs after a middle point in a group is hidden.

Fix:

- On apply, keep only visible points in the persisted current state.
- Renumber the remaining points within each group.
- Rewrite route point IDs through the generated ID map and drop invalid route stops.

### 3. LLM Provider Boundaries

Problem:

- DeepSeek config falls back to OpenAI keys, base URL, and model names.

Fix:

- Keep DeepSeek and OpenAI config independent.
- Allow shared generic `LLM_MODEL` only as an explicit cross-provider override.
- Avoid sending one provider's key to another provider's endpoint.

### 4. Agent and Cache Error Recovery

Problems:

- Tool-call parse or schema errors abort the whole agent request.
- Invalid selection cache JSON stops `merge:points` instead of being treated as stale generated cache.

Fix:

- Return recoverable `{ ok: false }` tool results for malformed tool args.
- Treat invalid selection cache JSON as a cache miss.

### 5. Frontend and Legacy Cleanup

Problems:

- Marker click can leave route and group filters active at the same time.
- AMap overlays are removed on the next render but not on unmount.
- Browser-ready globals and labels still say Guangzhou after city was generalized.
- README still has old Guangzhou-only wording and a dev URL mismatch.

Fix:

- Make marker selection follow the same state-clearing behavior as group chips.
- Remove overlays in effect cleanup.
- Rename browser readiness global to a generic map name while keeping screenshot compatibility if needed.
- Update README for city-generic workflow and clearer user-facing instructions.
- Add current product screenshots to README.

### 6. Tests

Problem:

- There is no automated test entrypoint for stateful map operations.

Fix:

- Add focused tests for `applyPreview()`, route-only preview, point-only route preservation, and ID normalization.

