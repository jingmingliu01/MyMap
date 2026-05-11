# Workspace Implementation Progress

Date: 2026-05-11

Status: implementation snapshot for the workspace-first design.

Primary design reference:

- `docs/2026-05-11-final-workspace-design.md`

This document records what has been implemented against the final workspace design, what is partially implemented, and what remains open. Keep this file updated when major data model, workflow, or AI Panel behavior changes.

## Current Baseline

The current implementation has moved from the old `seed -> places -> selections -> map-points` runtime model toward a workspace-first model.

Implemented baseline:

- Workspace source files exist under `data/workspace/`.
- Render artifacts exist under `data/render/`.
- Preview artifacts exist under `data/preview/`.
- Runtime map rendering reads derived render/preview artifacts, not old root-level map JSON files.
- Code and UI now use Place/Branch terminology instead of Group.
- Category, Tag, Place, Route filter rows exist in the React UI.
- AI Panel creates preview changes and requires Apply/Revert before committing workspace changes.

## Implemented

### Workspace Files

Implemented files:

```text
data/workspace/places.json
data/workspace/branches.json
data/workspace/categories.json
data/workspace/tags.json
data/workspace/tag-assignments.json
data/workspace/routes.json
data/workspace/imports.json
```

These match the conceptual split in the design doc.

### Render Artifacts

Implemented files:

```text
data/render/map-points.json
data/render/routes.json
```

Render artifacts are derived from workspace files and are not treated as source of truth.

### Preview Artifacts

Implemented files:

```text
data/preview/pending-edit.json
data/preview/map-points.json
data/preview/routes.json
```

Apply commits pending operations to workspace files and regenerates render artifacts. Revert clears preview files and leaves workspace files unchanged.

### Place And Branch Terminology

Implemented:

- `MapPoint` uses `place_id`, `place_name`, `place_type`, `place_color`, and Branch fields.
- Runtime render output no longer contains `group_name`, `group_type`, or `group_color`.
- `GroupFilter` was removed.
- Frontend filter components are named around Category, Tag, Place, and Route.

### Stable Branch References

Implemented:

- Routes reference stable Branch IDs.
- Render-only marker labels are regenerated per Place and are not used as long-term references.
- Branch IDs are derived from provider IDs when available, with deterministic fallback hashing.

### Categories

Implemented:

- A small MyMap category model exists.
- AMap raw `type` and `typecode` are preserved on Branch records.
- AMap `typecode` prefixes map to MyMap categories.
- Category filter is single-select in the UI.

### Tags

Partially implemented:

- Workspace files and schema exist for Tags and Tag assignments.
- Render output includes `tag_ids` and `tag_names`.
- Tag filter row exists and hides itself when no active Tags exist.

Not yet implemented:

- Creating Tags.
- Archiving/restoring Tags.
- Assigning Tags to Branches or Routes through AI Panel or UI.
- Tag-related Apply/Revert operations.

### Routes

Implemented:

- Route render artifacts exist.
- Route filter row exists.
- AI Panel can preview route replacement.
- Route preview does not mutate Places or Branches.

Partially implemented:

- Route operations currently use coarse `replace_routes`.

Not yet implemented:

- `create_route`
- `archive_route`
- `restore_route`
- `add_route_branch`
- `archive_route_branch`
- Route Tag assignment workflows.

### Archive

Partially implemented:

- `archive_place`
- `restore_place`
- `archive_branch`
- `restore_branch`
- Applying an archived Branch removes it from render output.
- Restoring a Place leaves Branch status semantics intact.

Not yet implemented:

- Recycle bin UI.
- Archived Places view.
- Archived Branches view.
- Archived Tags view.
- Archived Routes view.
- Archived Imports view.
- Restore warning when a Route references archived Branches.
- `archive_tag`
- `restore_tag`
- `archive_tag_assignment`
- `archive_route`
- `restore_route`
- `archive_import`
- `restore_import`

### AI Panel

Implemented:

- AI Panel uses Chat Completions with tool calling.
- AI Panel sends recent chat messages as context.
- AI Panel previews changes before Apply.
- Apply/Revert behavior exists.
- Tool calls are scoped to preview routes or map-point visibility.

Implemented tools:

```text
read_routes_json
edit_routes_json
read_map_points_json
edit_map_points_json
```

Current limitation:

- Tools still operate on render-preview shapes instead of the final full typed operation set.

Automated tests currently cover:

- Branch archive preview affects only the requested Branch.
- Render output renumbers remaining Branches under a Place after archive.
- Route preview replacement does not mutate Places or Branches.
- Route sanitization removes hidden or missing Branch references and duplicate stops.

Not yet covered by automated tests:

- Real LLM end-to-end tool choice.
- Browser E2E flow from typed natural language to preview.
- Discovery/add/tag/recycle-bin flows.

## Partially Implemented

### Import From Seeds

Current implementation:

```text
data/seeds.json
  -> data/places/*.json
  -> data/selections/*.selection.json
  -> data/workspace/*.json
  -> data/render/*.json
```

This is an intermediate state.

Design target:

```text
data/imports/seeds/*.json
  -> data/imports/runs/<import_id>/source.json
  -> data/imports/runs/<import_id>/candidates.json
  -> data/imports/runs/<import_id>/selection.json
  -> data/imports/runs/<import_id>/apply-result.json
  -> data/workspace/*.json
  -> data/render/*.json
```

Gaps:

- `data/seeds.json` is still the main import recipe.
- Seed import still writes selected branches directly into workspace.
- Import preview/apply is not implemented.
- Import audit run folders are not implemented.
- Existing `data/places/*.json` and `data/selections/*.selection.json` have not been migrated into import run records.

### Selection

Current implementation:

- LLM selection still exists as import-time recommendation.
- Selection cache is invalidated by source hash, prompt hash, provider, model, city, and place name.
- Selection output now uses `place_type`.

Gaps:

- Selection records are still stored in `data/selections/*.selection.json`.
- Selection is not stored under import run audit folders.
- Selection preview before applying import candidates is not implemented.

### Provider Reconciliation

Current implementation:

- Existing Branches are reused when provider and `provider_place_id` match.
- Raw provider type fields are preserved.

Gaps:

- Similar-name/address/coordinate reconciliation is not implemented.
- User confirmation for possible duplicate Branches is not implemented.
- Stale metadata marking is not implemented when a previously known Branch is not returned by a later provider search.
- Raw provider response preservation strategy is not complete.

## Not Implemented

### AMap Search Modes

Implemented:

- Keyword search via `https://restapi.amap.com/v5/place/text`.

Not implemented:

- Nearby search via `https://restapi.amap.com/v5/place/around`.
- Polygon search via `https://restapi.amap.com/v5/place/polygon`.
- ID/detail search via `https://restapi.amap.com/v5/place/detail`.
- Discovery search using `location`, `radius`, `types`, `sortrule`, `region`, and `city_limit`.

### Discovery Search

Not implemented:

- Discovery intent classification.
- Anchor Branch resolution.
- Asking the user to choose among multiple possible anchor Branches.
- Provider keyword search to find a missing anchor.
- Nearby search from anchor coordinates.
- Candidate presentation for discovery results.
- Applying discovery results as real Places and Branches.
- Creating/reusing Tags such as `广州塔附近晚餐`.
- Assigning discovery Tags to newly added Branches.

### Final Typed Operation Set

Not implemented:

```text
create_place
add_branch
assign_branch_to_place
create_tag
archive_tag
restore_tag
assign_tag_to_branch
assign_tag_to_route
archive_tag_assignment
create_route
archive_route
restore_route
add_route_branch
archive_route_branch
create_seed_import
run_import
preview_import
apply_import
archive_import
resolve_anchor_branch
discover_nearby_branches
preview_discovered_branches
apply_discovered_branches
```

The current implementation only covers a small subset through Branch archive/restore and route replacement.

### Recycle Bin

Not implemented:

- Recycle bin entry point in UI.
- Archived object lists.
- Restore flows from UI.
- Restore validation for dependencies, especially Routes that reference archived Branches.

## Current Test Coverage

Passing command:

```bash
npm run check
```

Currently covered:

- TypeScript typecheck.
- React filter component tests.
- Route sanitization tests.
- Selection config tests.
- Workspace operation tests for Branch archive and route replacement.
- Next build.

Known missing tests:

- AI Panel browser E2E.
- Real LLM tool-choice E2E.
- Import preview/apply.
- Discovery search.
- Tag operations.
- Recycle bin restore flows.
- Provider reconciliation.

## Next Recommended Implementation Order

1. Replace coarse AI Panel render-edit tools with explicit typed operations.
2. Add Tag operations and tests.
3. Add archive/recycle-bin API surface and minimal UI.
4. Convert seed import into preview/apply without resetting workspace.
5. Move `data/places` and `data/selections` into import run records.
6. Add AMap nearby search and anchor resolution.
7. Add discovery flow that creates real Places/Branches plus Tags.
8. Add provider reconciliation tests and stale metadata handling.

