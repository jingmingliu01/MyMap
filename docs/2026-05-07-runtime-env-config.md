# Runtime Env Config Extraction

## Goal

This round extracts operational knobs into `.env` so the workflow can be tuned without editing source code.

The main targets are values that affect:

- local server address,
- POI fetch volume and retry behavior,
- LLM selection size,
- AI agent context budget,
- screenshot dimensions and wait time,
- AMap JS API version.

Pure visual styling, marker colors, layout spacing, and provider-specific constants that are better kept as source-controlled product decisions stay in code for now.

## New Config Surface

### Runtime

- `APP_HOST`: local Next.js host, default `127.0.0.1`.
- `APP_PORT`: local Next.js port, default `5173`.
- `SCREENSHOT_FALLBACK_PORT`: temporary screenshot server port, default `4173`.

### AMap POI Fetch

- `AMAP_POI_PAGE_SIZE`: page size for Web Service POI search, default `25`.
- `AMAP_POI_MAX_PAGES`: maximum pages per seed item, default `3`.
- `AMAP_POI_MAX_REQUEST_ATTEMPTS`: retry attempts per POI request, default `3`.
- `AMAP_POI_REQUEST_TIMEOUT_MS`: timeout per POI request, default `15000`.
- `AMAP_POI_RETRY_BACKOFF_MS`: retry backoff multiplier, default `350`.

### LLM Selection

- `LLM_MAX_SELECTED_BRANCHES`: maximum branches selected per normal group, default `5`.
- `LLM_MAX_SELECTED_ATTRACTION_BRANCHES`: maximum branches selected for attraction groups, default `1`.

The selection cache hash includes these limits so changing the policy invalidates stale cached selection files.

### AI Agent Context

- `AI_MAX_TOOL_STEPS`: maximum Chat Completions tool loop steps, default `8`.
- `AI_CONTEXT_MESSAGES`: number of prior chat messages sent to the backend agent, default `8`.
- `AI_MESSAGE_CHAR_LIMIT`: maximum characters per message sent to the backend agent, default `2000`.
- `AI_CLIENT_MESSAGE_HISTORY`: number of messages retained by the browser chat state, default `10`.

### Screenshot

- `SCREENSHOT_WIDTH`: default screenshot width, default `1920`.
- `SCREENSHOT_HEIGHT`: default screenshot height, default `1080`.
- `SCREENSHOT_OUTPUT`: default screenshot path, default `output/mymap.png`.
- `SCREENSHOT_READY_TIMEOUT_MS`: timeout for map readiness, default `30000`.
- `SCREENSHOT_SETTLE_MS`: extra settle time before capture, default `3000`.

### AMap JS API

- `AMAP_JS_API_VERSION`: frontend JS API loader version, default `2.0`.

## Implementation Plan

1. Add shared TypeScript env readers for app/runtime scripts.
2. Add a small JavaScript runtime-config helper for `scripts/*.mjs`.
3. Wire config into `fetch:places`, `merge:points`, AI agent, screenshot, dev server, and one-command script.
4. Update `.env.example` and README so users can discover the knobs.
5. Run type/build validation without changing generated seed data.

