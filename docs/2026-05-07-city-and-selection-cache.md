# City Scope and Selection Cache Workflow

## Goal

This round removes the Guangzhou-only assumption from the data pipeline and makes the LLM selection step easier to reason about.

The seed file remains the single source of truth for the target city:

```json
{
  "city": "广州",
  "items": ["海心桥", "永庆坊"]
}
```

## AMap Fetch Behavior

For AMap POI search, the requested city from `data/seeds.json` is passed as the search region/city constraint.

In the current v5 POI search request, the pipeline uses:

```text
region=<seed.city>
city_limit=true
```

`region` carries the actual city value. `city_limit` is the boolean switch that asks AMap to restrict results to that city/region.

The official AMap Web Service POI docs also describe the same split for the stable v3 API: `city` carries the city value, while `citylimit` is the true/false restriction flag.

## Places Output

Every generated place file now includes `city` at the group level:

```json
{
  "name": "海心桥",
  "city": "广州",
  "type": "place",
  "branches": []
}
```

This keeps each `data/places/*.json` file self-contained and prevents stale place data from a different city being merged into the current map.

## Selection Workflow

The merge step is an AI workflow, not an autonomous agent.

For each seed item:

1. Read the matching `data/places/<slug>.json` file.
2. Check whether `data/selections/<slug>.selection.json` exists and still matches the source place file, prompt, LLM provider, and model.
3. If the selection file is valid, reuse it.
4. If it is missing or stale, call the LLM for that one place group only.
5. Write the selection file.
6. Deterministically merge selected branches into `data/map-points.generated.json`, `data/map-state.json`, and `data/map-points.json`.

Cross-group conflict handling is intentionally not implemented in this workflow. Future interactive AI agent features can handle conflicts with user confirmation.

## LLM Context

The LLM receives only the fields needed for selection:

```json
{
  "query": "海心桥",
  "city": "广州",
  "candidates": [
    {
      "id": 1,
      "name": "海心桥",
      "address": "阅江西路",
      "district": "海珠区"
    }
  ]
}
```

Coordinates, provider metadata, and map-rendering fields stay in the source place JSON and are not sent to the LLM selection prompt.

## Selection File Format

Selection cache files under `data/selections/` use this shape:

```json
{
  "source_place_file": "data/places/place.json",
  "source_hash": "sha256...",
  "prompt_hash": "sha256...",
  "provider": "deepseek",
  "model": "deepseek-v4-flash",
  "name": "海心桥",
  "city": "广州",
  "group_type": "attraction",
  "selected_branch_ids": [1],
  "rejected_branch_ids": [2, 3],
  "notes": "Kept the canonical candidate."
}
```

The cache is invalidated when any of these change:

- source place JSON
- selection system prompt
- LLM provider
- LLM model
- place name
- city

## Files Changed

- `src/fetch-places.ts`
- `src/merge-points.ts`
- `src/shared/schema.ts`
- `src/shared/paths.ts`
- `src/prompts/poi-candidate-selection.md`
- `.gitignore`

