# 2026-05-06 React and Local Node Implementation Decisions

## Final Short-Term Direction

Use React for the web UI and a local TypeScript Node server for API/state orchestration.

This keeps the current repo simple while preparing for a future React Native / Expo mobile app:

- TypeScript remains the shared language.
- Map data contracts stay in `src/shared`.
- React component boundaries can inform future mobile screens.
- OpenAI and file-state logic stay server-side.

## Vite Decision

Upgrade Vite to the current latest major version and use the matching latest React plugin.

Reason:

- `@vitejs/plugin-react@6` requires Vite `^8`.
- Using the current compatible pair avoids pinning an older React plugin.
- The project is new, so there is little migration risk.

Chosen stack:

```text
vite 8
@vitejs/plugin-react 6
react 19
react-dom 19
```

## Local Backend Decision

Use a small Node HTTP server with Vite middleware instead of adding Express, Fastify, FastAPI, or Spring Boot now.

Responsibilities:

- Serve the Vite React page.
- Expose fixed `/api/*` endpoints.
- Read/write only approved JSON state files.
- Call OpenAI from the server.
- Keep API keys out of browser code.

## State Files

```text
data/map-points.generated.json
data/map-state.json
data/map-state.preview.json
data/routes.json
data/routes.preview.json
```

Rules:

- `map-points.generated.json` is the generated baseline.
- `map-state.json` is the current editable map.
- `map-state.preview.json` is written only after an AI proposal.
- `routes.json` stores applied route lines.
- `routes.preview.json` stores proposed route lines.

## AI Edit Rule

AI changes are preview-first.

```text
user prompt
  -> POST /api/chat
  -> write preview files
  -> React renders preview
  -> user clicks Apply or Revert
```

Apply:

- Copies preview state into current state.
- Copies preview routes into routes.
- Deletes preview files.

Revert:

- Resets current state from generated state.
- Clears routes.
- Deletes preview files.

## Agent Boundary

Do not expose generic filesystem editing.

The server owns exact file paths and exposes only narrow operations:

```text
read full map state
create AI preview
apply preview
revert to generated
```

The AI is allowed to propose retained points and routes, but the server sanitizes output:

- No invented point ids.
- No invented coordinates.
- No arbitrary file paths.
- Routes can only reference retained visible point ids.
- A preview that removes every visible point is rejected.

## Route MVP

Render routes as straight AMap polylines by point ids.

Real walking/driving geometry from AMap route APIs is explicitly deferred.
