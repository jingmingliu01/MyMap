# AMap SDK Refactor, Tests, and CI Plan

## Background

The current map page already uses AMap JavaScript API concepts such as `AMap.Map`, `AMap.Marker`, `AMap.Polyline`, and `setFitView`. The loading layer is still custom: `app/map/amap-loader.ts` injects the AMap script tag manually and the app maintains local AMap type definitions.

The next cleanup should move this closer to the official AMap JavaScript API usage pattern and add regression checks around the map data flow and viewer interactions.

## Goals

- Replace custom script injection with the official `@amap/amap-jsapi-loader`.
- Use `@amap/amap-jsapi-types` or compatible official type declarations where practical.
- Keep all current user-visible behavior unchanged:
  - render current `data/map-state.json`,
  - render markers and routes,
  - click top group chips to focus the matching markers,
  - click faded markers to switch groups,
  - keep screenshot generation working.
- Add tests and CI so future refactors do not break the data flow or map UI basics.

## Proposed Refactor

### 1. Add Official AMap Loader Packages

Install:

```bash
npm install @amap/amap-jsapi-loader
npm install -D @amap/amap-jsapi-types
```

Expected replacement:

```ts
import AMapLoader from "@amap/amap-jsapi-loader";

AMapLoader.load({
  key,
  version,
  securityJsCode,
  plugins: []
});
```

The exact `securityJsCode` handling should be checked against the current official package docs before implementation, because AMap has changed the security-code setup guidance across JS API versions.

### 2. Remove Custom Loader Responsibilities

`app/map/amap-loader.ts` should become a thin wrapper around the official loader:

- keep the app-level error message,
- keep one in-flight load promise,
- read version from `clientConfig.amapJsApiVersion`,
- avoid direct DOM script creation.

### 3. Consolidate AMap Types

Current local types should be reduced to only missing or app-specific shapes. If official package types cover `Map`, `Marker`, `Polyline`, `Pixel`, and event signatures well enough, remove local duplicated type definitions.

### 4. Preserve Runtime Config

Keep these `.env` knobs:

- `AMAP_JS_API_KEY`
- `AMAP_JS_API_SECURITY_JS_CODE`
- `AMAP_JS_API_VERSION`

Do not move AMap Web Service POI fetch logic into the frontend. POI fetching should remain server-side/script-side through Web Service HTTP APIs.

## Test Plan

### Unit Tests

Keep existing state-model tests and add targeted tests for:

- selection config invalidates selection cache hash,
- `normalizeAppliedMapState` renumbers only after apply,
- route sanitization keeps only visible valid point IDs,
- env parsing rejects invalid numeric config and falls back only where intended.

### Component-Level Tests

Use React Testing Library or lightweight DOM tests for:

- `GroupFilter` renders all visible groups and counts,
- clicking a group calls the expected selection callback,
- `RouteFilter` renders route counts and emits selection changes,
- AI panel can be hidden in a future viewer/share mode.

### Browser Regression Tests

Use Playwright against the local Next app:

- page loads without console errors,
- `window.__MYMAP__.ready === true`,
- marker count matches visible point count,
- clicking a group chip changes marker emphasis,
- clicking a faded marker switches to that marker's group,
- screenshot script can capture a non-empty 1920x1080 image.

For CI reliability, mock or gate browser tests that require a real AMap JS key. The default CI path should not require private API keys.

## CI Plan

Add GitHub Actions with a baseline workflow:

```bash
npm ci
npm run check
```

Suggested workflow file:

```text
.github/workflows/ci.yml
```

Initial CI should run on:

- pull requests to `main`,
- pushes to `main`.

Optional future CI jobs:

- Playwright smoke test when `AMAP_JS_API_KEY` and `AMAP_JS_API_SECURITY_JS_CODE` are available as repository secrets,
- screenshot artifact upload for visual inspection,
- static viewer export smoke test once viewer export exists.

## Implementation Order

1. Add CI first with current `npm run check`.
2. Add env/config unit tests for the runtime knobs.
3. Add official AMap loader packages and refactor `app/map/amap-loader.ts`.
4. Remove redundant local AMap type declarations only after TypeScript remains clean.
5. Add Playwright smoke tests behind an API-key guard.
6. Update README with the new official-loader dependency and testing commands.

## Risks

- AMap security-code setup may differ between loader docs and direct script usage.
- Browser tests can become flaky if they depend on live AMap tile loading.
- Official type definitions may not cover every runtime object shape currently used, so local augmentation may still be needed.

