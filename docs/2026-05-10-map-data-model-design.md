# Map Data Model And Editing Workflow

Date: 2026-05-10

Superseded by: `docs/2026-05-11-final-workspace-design.md`

This document captured an intermediate seed/candidate-centric model. Keep it for discussion history only. The final direction is the workspace-first Place/Branch model.

## Goal

Define a stable data model for MyMap before adding more editing features.

The main design problem is that generated render JSON should not become the source of truth. Map rendering output, AI previews, user edits, POI cache, LLM selection, and route data need separate responsibilities.

## Core Principles

1. `branch_id` is display-only.
2. Long-term references must use stable candidate IDs.
3. `places/*.json` is an external POI candidate store, not a final map.
4. `selections/*.selection.json` is an AI workflow result, not a user override file.
5. User-confirmed edits should be stored separately from AI selections.
6. `map-points.*.json` files are render artifacts.
7. Preview files are temporary and should be removable without losing confirmed state.
8. Routes should reference stable candidate IDs, not UI labels or branch numbers.

## Proposed Data Layers

```text
data/seeds.json
  user-requested place groups

data/places/*.json
  external POI candidates per group

data/selections/*.selection.json
  LLM candidate selection per group

data/user-overrides.json
  user-confirmed include/exclude changes

data/map-points.merged.json
  current render output for points

data/map-points.preview.json
  temporary point preview

data/routes.json
  confirmed route state

data/routes.preview.json
  temporary route preview

data/pending-edit.json
  operation-level preview metadata
```

## Stable Candidate Identity

AMap returns a POI `id` described by official docs as a POI unique identifier. It is much more stable than search result order, but external IDs can still become stale when POIs are merged, corrected, renamed, or removed.

MyMap should keep an internal stable ID:

```json
{
  "candidate_id": "cand_01hx...",
  "provider": "amap",
  "provider_place_id": "B0FF...",
  "name": "禾味点(曙光路店)",
  "address": "广东省广州市...",
  "district": "花都区",
  "longitude": 113.123,
  "latitude": 23.123,
  "coordinate_system": "GCJ-02",
  "last_seen_at": "2026-05-10T00:00:00.000Z",
  "status": "active"
}
```

Selection, override, and route files should reference `candidate_id`.

`branch_id` and `label` should be regenerated during rendering:

```json
{
  "branch_id": 1,
  "label": "1"
}
```

## POI Refresh And Reconciliation

Refreshing `places/*.json` should merge new POI results into the existing candidate store instead of replacing it.

Matching priority:

1. Same `provider` and `provider_place_id`: update candidate fields, keep `candidate_id`.
2. Different provider ID but highly similar name, address, and nearby coordinates: update external binding, keep `candidate_id`.
3. Old candidate not found in fresh results: keep it and mark as `stale`.
4. New unmatched POI: create a new `candidate_id`.

This keeps routes, selections, and overrides stable even if the provider result order changes.

## Merge Pipeline

The deterministic merge pipeline should be:

```text
seeds.json
  + places/*.json
  + selections/*.selection.json
  + user-overrides.json
  -> map-points.merged.json
```

Precedence:

1. Start from candidates in `places/*.json`.
2. Apply LLM selections from `selections/*.selection.json`.
3. Apply user overrides last.
4. Remove hidden/excluded candidates from render output.
5. Regenerate display `branch_id`, `label`, and point IDs.
6. Write `map-points.merged.json`.

`map-points.merged.json` should be reproducible from source layers.

## Preview Model

Preview should not directly mutate confirmed files.

AI edits should write:

```text
data/pending-edit.json
data/map-points.preview.json
data/routes.preview.json
```

The frontend reads:

```text
points = map-points.preview.json ?? map-points.merged.json
routes = routes.preview.json ?? routes.json
```

`pending-edit.json` records operation semantics, for example:

```json
{
  "operations": [
    {
      "type": "exclude_candidate",
      "candidate_id": "cand_01hx...",
      "group_name": "禾味点"
    }
  ]
}
```

This avoids treating a preview JSON diff as the source of truth.

## Apply And Revert

Apply:

```text
read pending-edit.json
  -> commit operation into user-overrides.json or routes.json
  -> regenerate map-points.merged.json
  -> delete preview files
```

Revert:

```text
delete pending-edit.json
delete map-points.preview.json
delete routes.preview.json
```

Preview files should be deleted rather than marked stale. File existence is the cleanest state signal.

## Point Deletion

Deleting an existing point should create an exclude override.

Flow:

```text
natural language request
  -> read current candidates/render state
  -> produce exclude_candidate operation
  -> write preview
  -> user Apply
  -> append exclude override
  -> regenerate merged points
```

Do not modify `places/*.json`.

Do not rewrite `selections/*.selection.json`.

## Point Addition In Existing Group

Adding a point to an existing group:

```text
request: add X to group Y
  -> search existing places/Y.json
  -> if candidate exists:
       create include_candidate operation
  -> if candidate does not exist:
       run incremental POI search for X within current city
       reconcile into places/Y.json
       create include_candidate operation if a candidate is found
  -> write preview
  -> user Apply
  -> append include override
  -> regenerate merged points
```

This should not edit `seeds.json` if the group already exists.

## Point Addition As New Group

Adding a new group:

```text
request: add new place group X
  -> append X to seeds.json
  -> fetch/enrich places/X.json
  -> run LLM selection for X
  -> merge all source layers
  -> write preview or merged output depending on UX decision
```

This should edit `seeds.json` because the user is changing the long-term place group list.

## Routes

Routes should use stable candidate IDs:

```json
{
  "id": "route-1",
  "name": "上午路线",
  "color": "#1f6f8b",
  "candidate_ids": [
    "cand_01hx...",
    "cand_02ab..."
  ]
}
```

Route rendering resolves `candidate_ids` to currently visible map points.

If a candidate is hidden or excluded:

1. The route preview can show a warning.
2. Apply can filter invalid points.
3. Routes with fewer than two valid points should be removed or marked invalid.

Route addition/deletion:

```text
natural language request
  -> read routes.json and routeable points
  -> write routes.preview.json
  -> user Apply
  -> write routes.json
  -> delete routes.preview.json
```

## Natural Language Editing In AI Panel

The current manual seed-edit workflow can evolve into AI Panel commands.

Supported intent classes:

1. Add existing-group candidate
2. Add new group
3. Delete point from group
4. Restore previously hidden point
5. Add route
6. Delete route
7. Explain current points/routes

The agent should not directly write final state. It should write preview plus pending operations.

Example commands:

```text
把麗枫酒店附近的禾味点加回禾味点这个 group
新增一个 group：东山口
删掉禾味点的杨箕店
创建一条从海心桥到永庆坊再到北京路的路线
删除上午路线
```

## Tool Boundary For AI Panel

Recommended narrow tools:

```text
read_render_state()
read_group_candidates(group_name)
search_poi_candidates(query, city, target_group_name?)
preview_point_operations(operations)
preview_route_operations(operations)
apply_pending_edit()
revert_pending_edit()
```

For workflow-like tasks, the backend should still own deterministic steps such as POI reconciliation, ID generation, merge, and validation.

The LLM should decide intent and call tools. The backend should validate all tool arguments and reject impossible states.

## Open Questions

1. Should adding a new group produce preview first, or immediately update `seeds.json` and regenerate merged output?
2. Should `user-overrides.json` be append-only operation history or compact current policy?
3. Should stale POIs remain visible if selected by user override?
4. Should routes reference hidden candidates and show warnings, or automatically drop hidden candidates?
5. Should natural language edits to `seeds.json` require a separate confirmation from normal point preview Apply?

## Recommended Next Step

Implement in phases:

1. Add `candidate_id` and `provider_place_id` to `places/*.json`.
2. Migrate selections from branch IDs to candidate IDs.
3. Rename render outputs to `map-points.merged.json` and `map-points.preview.json`.
4. Remove legacy `map-points.json`.
5. Add `user-overrides.json`.
6. Add `pending-edit.json`.
7. Move AI Panel edits to operation previews.
8. Add natural language add/delete for points and routes.
