# Short-Term React and Node Decision

## Decision

Use React for the web frontend and a local TypeScript Node server for the backend.

## Why React Now

The map UI is moving from a static renderer to an interactive editor:

- Group selector.
- AI chat input.
- Proposal preview.
- Apply / revert controls.
- Route overlay controls.
- Current state vs preview state.

This amount of UI state is enough to justify React. It also keeps the future React Native / Expo path more natural because the interaction model, component boundaries, and shared TypeScript types can carry over.

## Backend Decision

Use a local TypeScript Node server for the MVP.

Responsibilities:

- Serve the Vite app.
- Provide narrow `/api/*` endpoints.
- Read and write only approved map state files.
- Call OpenAI from the server side so browser code never sees API keys.
- Keep generated state, editable state, preview state, and routes separate.

## Files and State

```text
data/map-points.generated.json
data/map-state.json
data/map-state.preview.json
data/routes.json
data/routes.preview.json
```

The renderer reads `map-state.json` and `routes.json` by default. When a preview exists, the frontend can render the preview before the user applies it.

## API Shape

```text
GET  /api/map-state
POST /api/chat
POST /api/apply-preview
POST /api/revert-preview
```

## Preview Rule

AI changes are never applied directly.

Flow:

```text
user message
  -> /api/chat
  -> write preview files
  -> frontend renders preview
  -> user clicks Apply or Revert
```

Apply persists preview to `map-state.json` / `routes.json`.

Revert discards preview and resets `map-state.json` from `map-points.generated.json`.

## Agent Tool Boundary

Expose narrow map tools, not generic filesystem tools:

```text
read_generated_points()
read_map_state()
write_map_preview(json)
read_map_preview()
apply_map_preview()
reset_map_state()
read_routes()
write_routes_preview(json)
apply_routes_preview()
reset_routes()
```

Allowed write paths:

```text
data/map-state.json
data/map-state.preview.json
data/routes.json
data/routes.preview.json
```

## Future Mobile Path

If this becomes a React Native / Expo app, keep shared types in TypeScript:

```text
packages/shared
apps/web
apps/mobile
apps/server
```

For a hosted mobile backend later, use a TypeScript API stack such as Hono or Fastify, plus Supabase/Postgres when persistence needs exceed local JSON files.
