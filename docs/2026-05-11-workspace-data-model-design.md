# Workspace Data Model Design

Date: 2026-05-11

Superseded by: `docs/2026-05-11-final-workspace-design.md`

This document captured the accepted workspace direction before reconciling it with the earlier data-model draft and AMap POI 2.0 details. Keep it for discussion history only.

## Status

Design proposal accepted for future implementation.

This document supersedes the earlier seed-centric model. MyMap should evolve from a one-shot `seed -> fetch -> merge -> map` workflow into an AI-assisted map workspace.

## Product Definition

MyMap is an AI-assisted map workspace.

It maintains real map places, concrete map branches, provider-derived categories, user/AI-defined tags, routes, archived records, and import history.

Seed files are import recipes. They are not the long-term source of truth.

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

Map markers represent Branches, not Places.

A Branch belongs to exactly one Place. If a Branch needs multiple organization dimensions, use Tags.

### Category

A Category is system/provider-derived.

For AMap, Categories come from POI `type` / `typecode`.

Examples:

```text
餐饮
景点
购物
住宿
咖啡
```

Users should not manually rename or edit Categories. User-defined organization belongs in Tags.

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

Tags can be assigned to Branches and Routes.

Tags should not be assigned to Places in the first version because the map renders Branches.

### Route

A Route is an ordered list of Branches.

Routes should reference stable `branch_id` values, not UI labels or display sequence numbers.

### Archive

All delete actions are soft deletes.

Delete in UI means archive in data.

Archived records remain restorable from a recycle bin.

## Stable Identity

Provider IDs should be stored, but MyMap should use internal IDs for long-term references.

AMap POI `id` is documented as a POI unique identifier and should be stored as `provider_place_id`, but it should not be the only internal primary key.

Recommended Branch shape:

```json
{
  "branch_id": "branch_abc",
  "place_id": "place_zhen_da_la_mian",
  "provider": "amap",
  "provider_place_id": "B0FF...",
  "name": "真打拉面(天河店)",
  "address": "广东省广州市...",
  "district": "天河区",
  "longitude": 113.123,
  "latitude": 23.123,
  "coordinate_system": "GCJ-02",
  "category_ids": ["cat_food"],
  "status": "active"
}
```

Display labels such as `1`, `2`, `3` should be regenerated at render time and must not be used for persistent references.

## Workspace Source Of Truth

The workspace source of truth should eventually be represented by files like:

```text
data/workspace/places.json
data/workspace/branches.json
data/workspace/categories.json
data/workspace/tags.json
data/workspace/tag-assignments.json
data/workspace/routes.json
data/workspace/imports.json
```

The implementation can start with fewer files, but the conceptual boundaries should stay stable.

### Place

```json
{
  "place_id": "place_heweidian",
  "name": "禾味点",
  "status": "active"
}
```

### Branch

```json
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
```

### Tag

```json
{
  "tag_id": "tag_guangzhou_tower_dinner",
  "name": "广州塔附近晚餐",
  "color": "#d97706",
  "icon": "utensils",
  "status": "active"
}
```

### Tag Assignment

```json
{
  "tag_id": "tag_guangzhou_tower_dinner",
  "target_type": "branch",
  "target_id": "branch_abc",
  "status": "active"
}
```

Route tag assignment:

```json
{
  "tag_id": "tag_day_1",
  "target_type": "route",
  "target_id": "route_abc",
  "status": "active"
}
```

### Route

```json
{
  "route_id": "route_abc",
  "branch_ids": ["branch_a", "branch_b", "branch_c"],
  "color": "#1f6f8b",
  "status": "active"
}
```

## Render Artifacts

Render files are derived output, not source of truth.

Recommended future files:

```text
data/render/map-points.json
data/render/routes.json
```

Preview files are temporary:

```text
data/preview/pending-edit.json
data/preview/map-points.json
data/preview/routes.json
```

Frontend rendering should use:

```text
preview if present, otherwise render output
```

Apply should commit typed operations to workspace source files, regenerate render output, then delete preview files.

Revert should delete preview files and keep workspace source files unchanged.

## Imports And Seeds

Seeds should become import files under a directory:

```text
data/imports/seeds/*.json
```

A seed file is a batch import recipe, not the map source of truth.

Example:

```json
{
  "city": "广州",
  "items": ["真打拉面", "禾味点", "广州塔"]
}
```

Running a seed import should not reset the map. It should incrementally add or update Places and Branches in the workspace.

Future import sources can use the same import abstraction:

```text
data/imports/xiaohongshu/*.json
data/imports/dianping/*.json
data/imports/amap-favorites/*.json
```

## Selection Repositioning

LLM selection still exists, but it becomes an import-time recommendation.

Old role:

```text
places/*.json -> selection -> final map points
```

New role:

```text
import source
  -> provider candidates
  -> LLM selection recommendation
  -> import preview
  -> user Apply
  -> workspace Places + Branches
```

After Apply, workspace data is the source of truth. Selection does not control day-to-day rendering.

Selection should be saved as import audit/cache data.

Recommended import run layout:

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

## Discovery Search

Discovery search is for queries where the user does not yet know the exact place.

Examples:

```text
广州塔附近有没有好吃的餐厅可以吃晚饭？
我记得麗枫酒店旁边有家很好喝的奶茶店，帮我找找是哪家？
海心桥附近找个咖啡店
```

Discovery should not create a fake Place such as `广州塔附近晚餐`.

Instead:

1. Resolve anchor Branch.
2. Search nearby provider candidates.
3. User or AI selects candidates.
4. Create or reuse real Places.
5. Add concrete Branches.
6. Create or reuse Tags such as `广州塔附近晚餐`.
7. Assign Tags to Branches and optionally Routes.

Example result:

```text
Tag: 广州塔附近晚餐

Place: 利苑酒家
  Branch: 利苑酒家(广州塔附近店)

Place: 点都德
  Branch: 点都德(广州塔附近店)
```

The Tag appears in the Tags row. The real Places appear in the Places row.

## Anchor Resolution

For nearby discovery, the anchor should resolve to a Branch.

Example:

```text
我记得麗枫酒店旁边有家很好喝的奶茶店，帮我找找是哪家？
```

Flow:

1. Resolve `麗枫酒店`.
2. If exactly one matching active Branch exists, use its coordinates.
3. If multiple matching Branches exist, ask the user which one.
4. If none exists, run provider search and ask the user to confirm the anchor.
5. Run nearby search with the anchor coordinates.

## Archive Policy

All delete operations are archive operations.

No user-facing delete operation should physically remove data.

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
```

### Place Archive

Archiving a Place hides the Place and its Branches by default.

Restoring the Place restores the Place. Branches should return to their own previous statuses.

### Branch Archive

Archiving a Branch hides only that concrete map node.

Other Branches under the same Place remain active.

### Group Hide Removed

There is no persistent "current hidden" data concept.

Temporary visibility control is a UI filter.

Long-term removal is archive.

## Recycle Bin

The UI should provide a recycle bin or archive panel.

It should support restoring:

```text
Archived Places
Archived Branches
Archived Tags
Archived Routes
Archived Imports
```

If restoring a Route references archived Branches, the UI should warn the user or require restoring those Branches.

## Categories, Tags, Places UI

The top map filter should use three rows:

```text
Row 1: Categories
[全部地点] [餐饮] [景点] [购物] [住宿] ...

Row 2: Tags
[广州塔附近晚餐] [第一天] [想去] [备选] ...

Row 3: Places
[海心桥] [禾味点] [真打拉面] [广州塔] ...
```

If there are no Tags, hide the Tags row.

The Places row should support collapse and expand.

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

Avoid the previous `Group` naming.

## Filter Semantics

Filtering operates on Branches.

```text
visibleBranches =
  active branches
  filtered by selected Category
  filtered by selected Tag
  filtered by selected Place
```

Rules:

1. Category is single-select in the first version.
2. Tag is single-select in the first version.
3. Place is single-select in the first version.
4. Future versions can support multi-select combinations.
5. `全部地点` means no Category filter.
6. The Places row shows Places that have at least one visible Branch under the current Category/Tag filters.

Examples:

### All Places

```text
Category = all
Tag = null
Place = null
```

Show all active Branches.

Places row shows all active Places that have active Branches.

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

Places row shows real Places for those Branches. It should not show a fake Place named `广州塔附近晚餐`.

### Category And Place Selected

```text
Category = 餐饮
Tag = null
Place = 禄运茶居
```

Show active Branches under `禄运茶居` that also match `餐饮`.

## AI Panel Design

AI Panel is a natural language command layer.

It should not directly edit files.

It should convert user requests into typed operations, generate previews, and commit only after user Apply.

High-level flow:

```text
natural language
  -> classify intent
  -> resolve references
  -> produce typed operations
  -> validate operations
  -> render preview
  -> user Apply or Revert
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

## Confirmed Product Decisions

1. A Branch belongs to exactly one Place.
2. A Place can have multiple Branches.
3. Tags are assigned only to Branches and Routes in the first version.
4. Categories are provider/system-derived and single-select in the first version.
5. Tags are single-select in the first version.
6. Deletion is always archive.
7. There is no persistent current-hide concept.
8. Seeds are import recipes and should not reset the workspace.
9. Discovery results should create/reuse real Places and Branches, then assign Tags.
10. `Group` should be renamed to `Place` across future code and UI.

## Open Implementation Questions

1. Whether to store workspace data in one `workspace.json` initially or split into multiple files immediately.
2. How to migrate current `data/places/*.json` and `data/selections/*.selection.json` into import runs.
3. Whether to keep current map render files temporarily during migration for backward compatibility.
4. How to generate stable internal IDs deterministically versus randomly.
5. How much of provider raw response should be preserved for future reconciliation.

## Recommended Migration Phases

1. Introduce Place/Branch terminology in types and UI without changing behavior.
2. Add provider category fields from AMap `type` / `typecode`.
3. Add stable internal IDs for Places and Branches.
4. Move seed input to `data/imports/seeds/`.
5. Convert selection into import-run recommendation.
6. Add workspace source files.
7. Add archive statuses and recycle bin.
8. Add Tags and tag assignments.
9. Replace current filter UI with Categories / Tags / Places rows.
10. Move AI Panel to typed workspace operations.
