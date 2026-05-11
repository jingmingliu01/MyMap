# Final Workspace Design

Date: 2026-05-11

Status: final design baseline for future implementation.

This document unifies:

- `docs/2026-05-10-map-data-model-design.md`
- `docs/2026-05-11-workspace-data-model-design.md`

It resolves the conflict between the earlier seed/candidate-centric model and the later workspace-first model.

## Final Product Definition

MyMap is an AI-assisted map workspace.

It is not primarily a one-shot `seed -> fetch -> merge -> screenshot` workflow. Seed files are import recipes. Once data is added, the user's workspace becomes the source of truth.

The workspace maintains:

```text
Places
Branches
Categories
Tags
Routes
Archives
Imports
Render artifacts
Previews
```

## Conflict Resolution

### 2026-05-10 Model

The older model used:

```text
candidate
group
selection
user-overrides
map-points.merged.json
```

It correctly identified several durable principles:

1. Render JSON is not source of truth.
2. Preview JSON is temporary.
3. Long-term references must not use display order or marker labels.
4. LLM selection should be separate from user-confirmed edits.
5. Provider POI IDs should be stored.

But it still treated seed/group/candidate selection as the center of the system.

### 2026-05-11 Model

The later model replaced this with:

```text
Place
Branch
Category
Tag
Route
Archive
Import
```

This is the final direction.

The older concepts map as follows:

| Old Concept | Final Concept |
|---|---|
| group | place |
| point / node / candidate after apply | branch |
| candidate before apply | import candidate |
| user-overrides | workspace archive/tag/route operations |
| seeds.json | import recipe |
| selections/*.selection.json | import-time recommendation |
| map-points.*.json | render artifact / preview artifact |

## Core Concepts

### Place

A Place is a real place name or search target.

Examples:

```text
真打拉面
禾味点
广州塔
海心桥
```

A Place can have multiple Branches.

### Branch

A Branch is a concrete map node with coordinates.

Examples:

```text
真打拉面(天河店)
真打拉面(北京路店)
禾味点(曙光路店)
广州塔
```

Map markers represent Branches.

Rules:

1. A Branch belongs to exactly one Place.
2. A Branch can have one or more Categories.
3. A Branch can have one or more Tags.
4. A Branch can appear in zero or more Routes.
5. Display labels such as `1`, `2`, `3` are render-only.

### Category

A Category is provider/system-derived.

For AMap, Categories are derived from POI `type` and `typecode`.

Examples:

```text
餐饮
景点
购物
住宿
咖啡
```

Categories are not user-defined. Users should use Tags for custom organization.

First version:

```text
Category filter is single-select.
```

### Tag

A Tag is user-defined or AI-defined.

Examples:

```text
广州塔附近晚餐
麗枫酒店附近奶茶
第一天
想去
备选
```

Rules:

1. Tags can be assigned to Branches.
2. Tags can be assigned to Routes.
3. Tags should not be assigned to Places in the first version.
4. Tags are single-select in the first version.
5. `rename_tag` can be added later.

### Route

A Route is an ordered list of Branches.

Routes reference stable Branch IDs, not marker labels.

Routes can have Tags.

### Archive

All delete operations are archive operations.

No user-facing delete should physically remove data.

Archive examples:

```text
archive_place
archive_branch
archive_tag
archive_tag_assignment
archive_route
archive_import
```

Restore examples:

```text
restore_place
restore_branch
restore_tag
restore_route
restore_import
```

There is no persistent "current hidden" state. Temporary visibility is a UI filter. Long-term removal is archive.

## AMap POI 2.0 Integration

Official AMap POI 2.0 supports:

```text
Keyword search: https://restapi.amap.com/v5/place/text
Nearby search:  https://restapi.amap.com/v5/place/around
Polygon search: https://restapi.amap.com/v5/place/polygon
ID search:      https://restapi.amap.com/v5/place/detail
```

Relevant documented behavior:

1. POI search supports keyword search, nearby search, polygon search, and ID search.
2. Keyword search uses `keywords`, optional `types`, `region`, `city_limit`, `page_size`, and `page_num`.
3. `types` accepts POI typecodes separated by `|`.
4. `region + city_limit=true` should be used when an import must be restricted to a city.
5. Nearby search uses `location`, optional `radius`, `keywords`, `types`, `sortrule`, `region`, and `city_limit`.
6. Nearby `location` is a single `longitude,latitude` center point.
7. Nearby `radius` range is `0-50000`, defaulting to 5000.
8. Nearby `sortrule` supports `distance` and `weight`.
9. POI result includes `id`, `name`, `location`, `type`, `typecode`, `pname`, `cityname`, `adname`, `address`, `adcode`, and `citycode`.
10. `id` is the POI unique identifier.
11. ID search uses `id` and accepts up to 10 POI IDs separated by `|`.
12. Optional `show_fields` can return extra business fields such as `tag`, `rating`, `cost`, photos, indoor information, and navigation points.

Design implications:

1. Store AMap `id` as `provider_place_id`.
2. Store AMap `type` and `typecode` as provider facts.
3. Derive MyMap Categories from provider `typecode`.
4. Use nearby search for discovery cases like "广州塔附近晚餐".
5. Use ID search to refresh known provider POIs when possible.
6. Keep internal IDs separate from provider IDs because provider records can be corrected, merged, or become stale over time.

## Stable Identity

MyMap should use internal stable IDs for long-term references.

Provider IDs should be stored for reconciliation and refresh.

Recommended Branch shape:

```json
{
  "branch_id": "branch_abc",
  "place_id": "place_heweidian",
  "provider": "amap",
  "provider_place_id": "B0FF...",
  "name": "禾味点(曙光路店)",
  "address": "广东省广州市...",
  "district": "花都区",
  "longitude": 113.123,
  "latitude": 23.123,
  "coordinate_system": "GCJ-02",
  "provider_type": "餐饮服务;中餐厅;中餐厅",
  "provider_typecode": "050100",
  "category_ids": ["cat_food"],
  "status": "active",
  "last_seen_at": "2026-05-11T00:00:00.000Z"
}
```

Display-only render fields:

```json
{
  "display_branch_number": 1,
  "label": "1"
}
```

These fields are regenerated for the current view and must not be referenced by imports, selections, tags, routes, or AI operations.

## Workspace Source Of Truth

Recommended future layout:

```text
data/workspace/places.json
data/workspace/branches.json
data/workspace/categories.json
data/workspace/tags.json
data/workspace/tag-assignments.json
data/workspace/routes.json
data/workspace/imports.json
```

Implementation can start with fewer files, but these conceptual boundaries should be preserved.

### places.json

```json
{
  "places": [
    {
      "place_id": "place_heweidian",
      "name": "禾味点",
      "status": "active"
    }
  ]
}
```

### branches.json

```json
{
  "branches": [
    {
      "branch_id": "branch_heweidian_shuguang",
      "place_id": "place_heweidian",
      "name": "禾味点(曙光路店)",
      "provider": "amap",
      "provider_place_id": "B0FF...",
      "longitude": 113.123,
      "latitude": 23.123,
      "category_ids": ["cat_food"],
      "status": "active"
    }
  ]
}
```

### categories.json

```json
{
  "categories": [
    {
      "category_id": "cat_food",
      "name": "餐饮",
      "icon": "utensils",
      "color": "#d84f3a",
      "source": "provider_mapping",
      "status": "active"
    }
  ],
  "provider_mappings": [
    {
      "provider": "amap",
      "typecode_prefix": "05",
      "category_id": "cat_food"
    }
  ]
}
```

Do not treat AMap's full typecode table as a fixed product taxonomy. Store raw provider fields and maintain a small MyMap category mapping.

### tags.json

```json
{
  "tags": [
    {
      "tag_id": "tag_guangzhou_tower_dinner",
      "name": "广州塔附近晚餐",
      "color": "#d97706",
      "icon": "utensils",
      "created_by": "ai",
      "status": "active"
    }
  ]
}
```

### tag-assignments.json

```json
{
  "assignments": [
    {
      "tag_id": "tag_guangzhou_tower_dinner",
      "target_type": "branch",
      "target_id": "branch_abc",
      "status": "active"
    },
    {
      "tag_id": "tag_day_1",
      "target_type": "route",
      "target_id": "route_abc",
      "status": "active"
    }
  ]
}
```

### routes.json

```json
{
  "routes": [
    {
      "route_id": "route_abc",
      "branch_ids": ["branch_a", "branch_b", "branch_c"],
      "color": "#1f6f8b",
      "status": "active"
    }
  ]
}
```

## Imports

Seeds are import recipes.

They should move from a single `data/seeds.json` file to import files:

```text
data/imports/seeds/*.json
```

Example seed import:

```json
{
  "city": "广州",
  "items": ["真打拉面", "禾味点", "广州塔"]
}
```

Running a seed import should not reset the workspace.

It should incrementally:

1. Create or reuse Places.
2. Fetch provider candidates.
3. Run import-time LLM selection.
4. Preview selected candidates.
5. On Apply, create or update Branches.
6. Update import audit records.
7. Regenerate render artifacts.

Future import sources should fit the same abstraction:

```text
data/imports/xiaohongshu/*.json
data/imports/dianping/*.json
data/imports/amap-favorites/*.json
```

## Selection

Selection still exists, but only as import-time recommendation.

It is not the long-term source of truth.

Old flow:

```text
places/*.json
  -> selections/*.selection.json
  -> map-points.json
```

Final flow:

```text
import source
  -> provider candidates
  -> LLM selection recommendation
  -> import preview
  -> user Apply
  -> workspace Places + Branches
  -> render artifacts
```

After Apply, workspace state controls rendering.

Selection files should be stored as import audit/cache records:

```text
data/imports/runs/import_20260511_001/
  source.json
  candidates.json
  selection.json
  apply-result.json
```

### source.json

```json
{
  "import_id": "import_20260511_001",
  "source_type": "seed",
  "city": "广州",
  "items": ["禾味点", "广州塔"]
}
```

### candidates.json

```json
{
  "import_id": "import_20260511_001",
  "candidates": [
    {
      "import_candidate_id": "impcand_abc",
      "source_item": "禾味点",
      "provider": "amap",
      "provider_place_id": "B0FF...",
      "name": "禾味点(曙光路店)",
      "address": "广东省广州市...",
      "longitude": 113.1,
      "latitude": 23.1,
      "provider_type": "餐饮服务;中餐厅",
      "provider_typecode": "050100"
    }
  ]
}
```

### selection.json

```json
{
  "import_id": "import_20260511_001",
  "provider": "deepseek",
  "model": "deepseek-v4-flash",
  "selected_import_candidate_ids": ["impcand_abc"],
  "rejected_import_candidate_ids": [],
  "notes": "Recommended branch for the requested place."
}
```

### apply-result.json

```json
{
  "import_id": "import_20260511_001",
  "created_branch_ids": ["branch_123"],
  "updated_branch_ids": [],
  "skipped_candidate_ids": []
}
```

## Provider Reconciliation

When refreshing or importing provider candidates:

1. Same `provider` and `provider_place_id`: update existing Branch, keep internal `branch_id`.
2. Different provider ID but highly similar name, address, and nearby coordinates: treat as possible same Branch and require confidence or user confirmation.
3. Existing Branch not returned by a later search: do not delete it; mark stale metadata if needed.
4. New unmatched provider candidate: create a new import candidate and, after Apply, a new Branch.

AMap ID search should be used to refresh known `provider_place_id` values when possible.

## Discovery Search

Discovery search handles cases where the user does not know the exact Branch.

Examples:

```text
广州塔附近有没有好吃的餐厅可以吃晚饭？
我记得麗枫酒店旁边有家很好喝的奶茶店，帮我找找是哪家？
海心桥附近找个咖啡店
```

Discovery flow:

```text
natural language request
  -> classify discovery intent
  -> resolve anchor Branch
  -> choose provider category/type filters
  -> run nearby search
  -> present candidates
  -> user/AI selects candidates
  -> preview Branch additions + Tag assignments
  -> Apply
```

Discovery should not create fake Places like `广州塔附近晚餐`.

Instead:

```text
Create/reuse real Places.
Create concrete Branches.
Create/reuse Tags like 广州塔附近晚餐.
Assign Tags to the new Branches.
```

Example:

```text
Tag: 广州塔附近晚餐

Place: 利苑酒家
  Branch: 利苑酒家(广州塔附近店)

Place: 点都德
  Branch: 点都德(广州塔附近店)
```

## Anchor Resolution

Nearby discovery requires an anchor Branch.

Example:

```text
我记得麗枫酒店旁边有家很好喝的奶茶店，帮我找找是哪家？
```

Flow:

1. Resolve `麗枫酒店` against existing active Branches.
2. If exactly one active Branch matches, use its coordinates.
3. If multiple Branches match, ask the user which one.
4. If none match, run provider keyword search and ask the user to confirm the anchor.
5. Run AMap nearby search with `location=<longitude,latitude>`.
6. Use `radius`, `keywords`, `types`, `sortrule`, `region`, and `city_limit` as appropriate.

## Preview And Apply

AI Panel and import workflows should not directly mutate confirmed workspace files.

They should write:

```text
data/preview/pending-edit.json
data/preview/map-points.json
data/preview/routes.json
```

`pending-edit.json` stores typed operations.

Apply:

```text
read pending-edit.json
  -> validate operations
  -> commit operations to workspace files
  -> regenerate render artifacts
  -> delete preview files
```

Revert:

```text
delete preview files
keep workspace unchanged
```

## Render Artifacts

Recommended render output:

```text
data/render/map-points.json
data/render/routes.json
```

Render artifacts are derived from workspace source files.

They exist for frontend speed and simpler map rendering.

They are not source of truth.

## Filters UI

The map filter UI should use three conceptual rows:

```text
Row 1: Categories
[全部地点] [餐饮] [景点] [购物] [住宿] ...

Row 2: Tags
[广州塔附近晚餐] [第一天] [想去] [备选] ...

Row 3: Places
[海心桥] [禾味点] [真打拉面] [广州塔] ...
```

If there are no active Tags, hide the Tags row.

The Places row supports collapse and expand.

Naming should be consistent in code and UI:

```text
Category
Tag
Place
Branch
Route
Archive
Import
```

Do not use the old `Group` naming in new code.

## Filter Semantics

Filtering operates on Branches.

```text
visibleBranches =
  active branches
  whose Place is active
  filtered by selected Category
  filtered by selected Tag
  filtered by selected Place
```

First version:

1. Category is single-select.
2. Tag is single-select.
3. Place is single-select.
4. Future versions can support multi-select combinations.
5. `全部地点` means no Category filter.
6. Places row shows Places that have at least one visible Branch under the current Category/Tag filters.

Examples:

### All Places

```text
Category = all
Tag = null
Place = null
```

Show all active Branches under active Places.

Places row shows all active Places with active Branches.

### Category Selected

```text
Category = 餐饮
Tag = null
Place = null
```

Show active food Branches.

Places row shows Places with at least one active food Branch.

### Tag Selected

```text
Category = all
Tag = 广州塔附近晚餐
Place = null
```

Show Branches assigned to that Tag.

Places row shows real Places for those Branches. It must not show a fake Place named `广州塔附近晚餐`.

### Category And Place Selected

```text
Category = 餐饮
Tag = null
Place = 禄运茶居
```

Show active Branches under `禄运茶居` that also match `餐饮`.

## Archive And Recycle Bin

Archive behavior:

1. Archiving a Place hides the Place and its Branches by default.
2. Restoring a Place restores the Place. Branches return according to their own statuses.
3. Archiving a Branch hides only that Branch.
4. Archiving a Tag hides the Tag and disables active filtering by that Tag.
5. Archiving a Route hides that Route.

The UI should provide a recycle bin for:

```text
Archived Places
Archived Branches
Archived Tags
Archived Routes
Archived Imports
```

If restoring a Route references archived Branches, the UI should warn the user or require restoring those Branches.

## AI Panel

AI Panel is a natural language command layer.

It should not directly edit files.

It should convert user requests into typed operations, generate previews, and commit only after Apply.

High-level flow:

```text
natural language
  -> classify intent
  -> resolve references
  -> produce typed operations
  -> validate operations
  -> render preview
  -> Apply or Revert
```

## Typed Operations

### Place Operations

```text
create_place
archive_place
restore_place
```

No `rename_place` in the first version.

### Branch Operations

```text
add_branch
archive_branch
restore_branch
assign_branch_to_place
```

### Tag Operations

```text
create_tag
archive_tag
restore_tag
assign_tag_to_branch
assign_tag_to_route
archive_tag_assignment
```

`rename_tag` can be added later because Tags are user-defined.

### Route Operations

```text
create_route
archive_route
restore_route
add_route_branch
archive_route_branch
```

No `rename_route` in the first version. Day labels and itinerary organization should use Tags.

### Import Operations

```text
create_seed_import
run_import
preview_import
apply_import
archive_import
```

### Discovery Operations

```text
resolve_anchor_branch
discover_nearby_branches
preview_discovered_branches
apply_discovered_branches
```

## Confirmed Decisions

1. A Branch belongs to exactly one Place.
2. A Place can have multiple Branches.
3. Tags are assigned only to Branches and Routes in the first version.
4. Categories are provider/system-derived.
5. Category is single-select in the first version.
6. Tags are single-select in the first version.
7. Deletion is always archive.
8. There is no persistent current-hide concept.
9. Seeds are import recipes and should not reset the workspace.
10. Discovery results create/reuse real Places and Branches, then assign Tags.
11. `Group` should be renamed to `Place` across future code and UI.
12. Selection is import-time recommendation, not long-term map state.

## Open Implementation Questions

1. Whether to store workspace data in one `workspace.json` initially or split into multiple files immediately.
2. How to migrate current `data/places/*.json` and `data/selections/*.selection.json` into import-run records.
3. Whether to keep current map render files temporarily during migration for backward compatibility.
4. How to generate stable internal IDs: deterministic slug/hash, random IDs, or hybrid.
5. How much raw provider response to preserve for future reconciliation.
6. Whether first implementation should include a full recycle bin UI or only archive/restore APIs.

## Recommended Migration Phases

1. Add a final workspace schema without changing current UI behavior.
2. Introduce Place/Branch terminology in types and UI.
3. Add provider `id`, `type`, and `typecode` to fetched data.
4. Add MyMap category mapping from provider typecodes.
5. Add stable internal Place and Branch IDs.
6. Move `seeds.json` to `data/imports/seeds/`.
7. Convert selection into import-run recommendation.
8. Add workspace source files.
9. Add archive statuses.
10. Add Tags and tag assignments.
11. Replace current filter UI with Categories / Tags / Places rows.
12. Add recycle bin.
13. Move AI Panel to typed workspace operations.

## References

- AMap POI Search 2.0: https://lbs.amap.com/api/webservice/guide/api-advanced/newpoisearch
- AMap POI typecode table download entry: https://lbs.amap.com/api/webservice/download
