# AI Editing and Routing Plan

## Goal

Add an AI-assisted editing layer on top of the generated Guangzhou map so users can ask for changes in natural language, preview the proposed result, and apply or revert the change.

Implementation is now underway following the decisions in this document and `docs/2026-05-06-react-node-implementation-decisions.md`.

## Principles

- Do not let AI directly mutate source cache files.
- Every AI change must be previewed first.
- A change is only persisted after the user explicitly applies it.
- Revert means resetting the editable map state back to the generated baseline.
- Agent tools must be narrow and path-limited.
- The map should remain JSON-driven and refresh from local state.

## Proposed Data Files

### `data/places/*.json`

Role: AMap candidate cache.

Rules:

- Created by `fetch:places`.
- Keeps raw-ish AMap candidates after deterministic cleanup.
- Not edited by AI chat.
- Useful for cache, debugging, and reproducibility.

### `data/map-points.generated.json`

Role: generated baseline after `merge:points`.

Rules:

- Created by `merge:points`.
- Rebuildable from `data/seeds.json` + `data/places/*.json`.
- Not directly edited by AI chat.
- Used as reset baseline.

### `data/map-state.json`

Role: current editable map state.

Rules:

- Actual map renderer reads this file.
- Created from `map-points.generated.json` when generated output changes or user resets.
- AI proposals target this state.
- Persisted only after user applies a preview.
- Revert resets this file from `map-points.generated.json`.

Suggested state shape:

```json
{
  "city": "广州",
  "coordinate_system": "GCJ-02",
  "map_provider": "amap",
  "points": [
    {
      "id": "cuiwanrenjia-1",
      "group_name": "脆鲩人家",
      "group_type": "restaurant",
      "group_color": "#3d7f89",
      "branch_id": 1,
      "branch_name": "脆鲩人家(天河店)",
      "label": "1",
      "address": "...",
      "district": "天河区",
      "longitude": 113.402119,
      "latitude": 23.169062,
      "visible": true
    }
  ]
}
```

Prefer `visible: false` over deleting points so the user can restore hidden points without rerunning generation.

### `data/routes.json`

Role: optional route layer.

Rules:

- AI can propose and persist routes after user approval.
- First version should support visual straight-line routes.
- Real walking/driving routes can come later via AMap route APIs.

Suggested first version:

```json
{
  "routes": [
    {
      "id": "route-1",
      "name": "珠江新城到荔湾半日线",
      "color": "#2563eb",
      "point_ids": [
        "haixinsha-1",
        "haixinqiao-1",
        "yongqingfang-1",
        "enningxuegaoxing-1"
      ],
      "visible": true
    }
  ]
}
```

## AI Edit Flow

Example user request:

> 只保留脆鲩人家的天河店。

Flow:

1. Frontend sends the user message to local backend.
2. Backend reads `data/map-state.json`.
3. Backend asks OpenAI for a structured edit proposal.
4. Backend writes the proposal to a temporary preview state, not to the canonical state.
5. Frontend renders preview result.
6. User clicks Apply or Revert.
7. Apply persists preview to `data/map-state.json`.
8. Revert discards preview and reloads `data/map-points.generated.json`.

## Preview Model

Two implementation options:

### Option A: separate preview file

```text
data/map-state.preview.json
```

Pros:

- Very transparent.
- Easy to inspect and debug.
- Easy to compare with current state.

Cons:

- More files.

### Option B: in-memory preview on backend

Pros:

- Less file clutter.
- No stale preview file.

Cons:

- Preview disappears if server restarts.
- Harder to debug.

Recommendation: Option A for the MVP because the project is file-first and debuggability matters.

## Narrow Agent Tools

Do not expose generic filesystem access.

Recommended backend functions:

```text
read_generated_points()
read_map_state()
write_map_state(json)
write_map_preview(json)
read_map_preview()
apply_map_preview()
reset_map_state()
read_routes()
write_routes_preview(json)
apply_routes_preview()
reset_routes()
```

Allowed paths:

```text
data/map-points.generated.json
data/map-state.json
data/map-state.preview.json
data/routes.json
data/routes.preview.json
```

Disallowed:

```text
.env
src/**
app/**
data/places/**
package.json
package-lock.json
```

## Frontend Requirements

### Current Bug

When hovering a marker, the displayed name repeats `group_name` in some cases. Example risk:

```text
脆鲩人家 脆鲩人家(天河店)
```

Expected:

```text
脆鲩人家(天河店)
```

Likely cause:

- `markerTitle(point)` concatenates `group_name + branch_name`.
- New fetch behavior stores full AMap POI name as `branch_name`.
- If `branch_name` already contains `group_name`, concatenation duplicates the name.

Planned fix:

- If compacted `branch_name` includes compacted `group_name`, use `branch_name` directly.
- Else use `group_name + branch_name`.
- Verify with Playwright screenshot before and after.

### AI Chat UI

Add a compact chat/editor surface on the map page.

Required states:

- Idle input.
- Generating proposal.
- Preview ready.
- Apply / Revert controls.
- Error state.

The map renderer should support:

- Current state.
- Preview state.
- Visible point filtering.
- Route overlay.
- Group selector still working with preview state.

## Backend Options

### Option 1: stay Node-only

Use a small local Node server with Express or Fastify.

Pros:

- Current project is already Node + TypeScript.
- Reuses OpenAI SDK, Vite, Playwright.
- Simplest setup for this repo.
- One `npm start` can install deps, run API server, run Vite, and open the map.

Cons:

- Requires Node/npm for users unless packaged later.

Recommendation for MVP: use Node-only.

### Option 2: FastAPI

Pros:

- Python is strong for local tooling and JSON/file manipulation.
- Easy to build small local APIs.
- Could package with `uv` later.

Cons:

- Adds a second runtime beside Node/Vite.
- Frontend still needs a JS toolchain unless converted to static no-build.
- More moving parts for this small app.

Recommendation: not yet.

### Option 3: Spring Boot

Pros:

- Strong for production backend structure.
- Good if this becomes a long-lived hosted service.

Cons:

- Heavy for a local map generator.
- Slower iteration.
- Too much ceremony for current scope.

Recommendation: not now.

## React Decision

Current frontend is plain TypeScript and DOM manipulation.

React becomes useful when:

- Chat panel gains several states.
- Preview/apply/revert state gets complex.
- Route editor appears.
- Group list, marker list, and route list need shared UI state.

Recommendation:

- Keep current plain TS for one more small iteration if only fixing hover + adding simple route rendering.
- Introduce React when implementing AI chat preview/apply/revert, because the UI state will become interactive enough to justify it.

If React is introduced:

```text
app/main.tsx
app/components/GroupFilter.tsx
app/components/AiEditor.tsx
app/map/amap.ts
app/state/api.ts
```

## Claude Code Native Installer Notes

Official docs now list Native Install as the recommended Claude Code install method:

- macOS/Linux/WSL: `curl -fsSL https://claude.ai/install.sh | bash`
- Windows PowerShell: `irm https://claude.ai/install.ps1 | iex`
- Homebrew: `brew install --cask claude-code`
- WinGet: `winget install Anthropic.ClaudeCode`

The docs also say npm install still exists, requires Node.js 18+, and installs the same native binary through platform optional dependencies plus a postinstall link step.

Implication:

- Claude Code avoids requiring Node/npm for users by distributing native per-platform binaries through native installers/package managers.
- The npm path still needs Node/npm only as an installer mechanism, not as the runtime for the installed binary.

Could this project do the same?

Yes, but not immediately with the current architecture.

Options:

1. Keep Node/npm for MVP.
2. Later package a native CLI that embeds or downloads a JS runtime.
3. Use Bun or Deno to reduce setup friction.
4. Use a Go/Rust native wrapper that downloads/runs the web app server.
5. Use Electron/Tauri for a desktop app.

Recommendation:

- Do not optimize installation packaging yet.
- First stabilize the JSON state model, AI proposal flow, and map UX.
- After product shape is proven, consider `pkg`, `nexe`, Bun single executable, or a small Rust/Go wrapper.

## Implementation Checklist After Decision

1. Done: Rename current output:
   - `data/map-points.json` -> generated baseline or keep as compatibility alias.
   - Introduce `data/map-points.generated.json`.
   - Introduce `data/map-state.json`.

2. Done: Update generation:
   - `merge:points` writes `map-points.generated.json`.
   - It also initializes `map-state.json` if missing or if user chooses reset.

3. Done: Update renderer:
   - Read `map-state.json` instead of `map-points.json`.
   - Respect `visible: false`.
   - Read `routes.json` if present.

4. Done: Fix marker hover title duplication:
   - Use `branch_name` directly when it already contains `group_name`.
   - Verify with Playwright screenshot.

5. Done: Add local backend:
   - Node server recommended for MVP.
   - Add narrow map-state and route tools.
   - Add `/api/map-state`, `/api/chat`, `/api/apply-preview`, `/api/revert-preview`.

6. Done: Add AI chat UI:
   - User input.
   - Proposal preview.
   - Apply and Revert buttons.
   - Error display.

7. Done: Add route overlay:
   - Start with straight-line polyline by point ids.
   - Later add AMap walking/driving route geometry.

8. Done: Update one-click script:
   - Start local backend + Vite.
   - Print map URL.
   - Preserve current API key prompts.

9. Done: Update docs after implementation:
   - Explain generated vs editable state.
   - Explain preview/apply/revert.
   - Explain route file.
