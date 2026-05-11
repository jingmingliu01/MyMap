# AGENTS.md

This file gives coding agents the durable context needed before changing this repository.

## Product Direction

MyMap is an AI-assisted map workspace.

It is not primarily a one-shot `seed -> fetch -> merge -> screenshot` workflow. Seed files are import recipes. Once data is imported or discovered, the workspace is the source of truth.

Read the canonical design before making data-model or AI Panel changes:

```text
docs/2026-05-11-final-workspace-design.md
```

## Core Terms

Use these terms consistently:

```text
Place     A real place name or search target, such as 禾味点 or 广州塔.
Branch    A concrete map node with coordinates, such as 禾味点(曙光路店).
Category  Provider/system-derived filter from POI type/typecode.
Tag       User/AI-defined organization label, such as 广州塔附近晚餐 or 第一天.
Route     Ordered list of Branches.
Archive   Soft delete state.
Import    Seed, favorites, Xiaohongshu, Dianping, or other source import.
```

Do not introduce new `Group` terminology. The final term is `Place`.

## Data Model Rules

- A `Place` can have multiple `Branches`.
- A `Branch` belongs to exactly one `Place`.
- Tags attach to `Branches` and `Routes`, not `Places`, in the first version.
- Categories are provider/system-derived and should not be user-edited.
- Deletion means archive. Do not physically delete user data for normal delete actions.
- There is no persistent "current hidden" state. Temporary visibility is UI filtering.
- Render JSON is a derived artifact, not source of truth.
- Preview JSON is temporary and should be removable without losing confirmed state.
- Display labels such as `1`, `2`, `3` are render-only and must not be used for persistent references.

## Imports And Selection

- Seed files are import recipes, not the long-term map source of truth.
- Future seed imports should live under `data/imports/seeds/`.
- Running a seed import should incrementally add/update workspace data, not reset the workspace.
- LLM selection is import-time recommendation/cache/audit data.
- After user Apply, workspace `Places` and `Branches` control rendering, not selection files.

## AMap Integration

- Store AMap POI `id` as `provider_place_id`.
- Store AMap `type` and `typecode` as provider facts.
- Derive MyMap `Categories` from provider `typecode` via a small product-owned mapping.
- Use AMap keyword search for seed/import place lookup.
- Use AMap nearby search for discovery requests such as `广州塔附近晚餐`.
- Use AMap ID search to refresh known provider POIs when useful.

## AI Panel Rules

AI Panel is a natural language command layer.

It should convert user requests into typed operations, render a preview, and commit only after user Apply.

Do not let the LLM directly edit arbitrary files.

Use narrow business operations such as:

```text
create_place
archive_place
add_branch
archive_branch
create_tag
assign_tag_to_branch
create_route
archive_route
create_seed_import
discover_nearby_branches
```

All AI edits should follow:

```text
natural language -> typed operations -> preview -> Apply/Revert -> workspace update
```

## Filter UI Direction

The map filter UI has three conceptual rows:

```text
Categories: [全部地点] [餐饮] [景点] [购物] ...
Tags:       [广州塔附近晚餐] [第一天] [想去] ...
Places:     [海心桥] [禾味点] [真打拉面] ...
```

Filtering operates on Branches.

`广州塔附近晚餐` is a Tag, not a Place.

## Current MVP Caveat

The current import path still contains older seed/candidate files such as:

```text
data/seeds.json
data/places/*.json
data/selections/*.selection.json
```

The current runtime model is workspace-first:

```text
data/workspace/*.json
data/render/*.json
data/preview/*.json
```

When changing imports, keep moving toward import-run records instead of deepening the old seed-centric model.
