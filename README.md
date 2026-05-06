# MyMap

MyMap is an **AI Agent in workflow** project for turning a tiny travel seed file into a clean, interactive Guangzhou map.

It combines AMap POI search, structured JSON generation, an AI-assisted editing workflow, a local React map UI, and Playwright screenshots. The core idea is simple: keep the map as inspectable JSON, then let an agent use narrow tools to preview route and point edits before the user applies them.

```text
seed.json -> AMap POI search -> places JSON -> OpenAI candidate filtering
          -> map-state JSON -> AMap JS rendering -> AI tool previews -> PNG screenshot
```

## Highlights

- Minimal JSON seed input for places such as restaurants, attractions, malls, cafes, and landmarks.
- AMap Web Service POI search for Guangzhou candidates.
- OpenAI-powered candidate filtering during merge.
- Chat Completions tool-calling agent for map editing workflows.
- Preview-first edits: AI changes are shown first, then applied only after user confirmation.
- Separate JSON state for generated points, current editable points, route previews, and applied routes.
- AMap JS API rendering with custom colored markers and route overlays.
- Playwright screenshot export for downstream Excalidraw layout work.

## Current Integrations

### AMap

MyMap currently supports AMap for POI search and map rendering.

- Web Service POI search endpoint used by this project: `https://restapi.amap.com/v5/place/text`
- JS API loader used by this project: `https://webapi.amap.com/maps?v=2.0&key=YOUR_KEY`
- AMap Web Service POI search docs: [AMap POI Search](https://lbs.amap.com/api/webservice/guide/api-advanced/search)
- AMap JavaScript API v2 docs: [AMap JS API v2](https://lbs.amap.com/api/javascript-api-v2/summary)
- AMap key console: [AMap Console](https://console.amap.com/dev/key/app)

### OpenAI

MyMap currently supports OpenAI API for LLM workflows.

- Chat Completions endpoint: `https://api.openai.com/v1/chat/completions`
- OpenAI API reference: [Chat Completions](https://platform.openai.com/docs/api-reference/chat/create)
- OpenAI API key page: [API Keys](https://platform.openai.com/api-keys)

The local agent uses Chat Completions `messages` plus `tools`, which keeps the design close to OpenAI-compatible providers. `OPENAI_BASE_URL` is available for future provider experiments.

## How It Works

### 1. Seed

Edit `data/seeds.json`:

```json
{
  "city": "广州",
  "items": [
    "陶陶居",
    "点都德",
    "广州塔",
    "陈家祠"
  ]
}
```

### 2. Fetch POI Candidates

```bash
npm run fetch:places
```

This calls AMap Web Service POI search and writes one candidate file per seed item:

```text
data/places/*.json
```

### 3. Merge Map Points

```bash
npm run merge:points
```

This uses OpenAI to filter noisy POI candidates and writes:

```text
data/map-points.generated.json
data/map-state.json
data/routes.json
```

### 4. Edit With AI Agent

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:5173/app/index.html
```

The map page includes an AI editor. The agent uses narrow tool calls:

- `read_routes_json`
- `edit_routes_json`
- `read_map_points_json`
- `edit_map_points_json`

Route-only requests touch only route preview JSON. Point filtering requests touch point-state preview JSON. Nothing is applied until the user clicks `应用`.

### 5. Screenshot

```bash
npm run screenshot
```

Default output:

```text
output/guangzhou-map.png
```

Default size is `1920x1080`:

```bash
npm run screenshot -- --width 2560 --height 1440 --output output/guangzhou-map-2k.png
```

## Quick Start

```bash
npm start
```

The interactive script will:

1. Ask for API keys.
2. Write `.env`.
3. Install dependencies.
4. Create `data/seeds.json` from `data/seeds.example.json` if needed.
5. Fetch AMap POI candidates.
6. Merge and filter map points with OpenAI.
7. Start the local map server.

## Environment Variables

Copy `.env.example`:

```bash
cp .env.example .env
```

Required:

```bash
AMAP_WEB_SERVICE_KEY=your_amap_web_service_key
AMAP_JS_API_KEY=your_amap_js_api_key
AMAP_JS_API_SECURITY_JS_CODE=your_amap_js_api_security_js_code
OPENAI_API_KEY=your_openai_api_key
openai_model=gpt-5.5
```

Optional:

```bash
OPENAI_BASE_URL=
```

## Scripts

```bash
npm run fetch:places   # Query AMap POI candidates
npm run merge:points   # Filter and merge candidates into map JSON
npm run dev            # Start local React + Node API server
npm run screenshot     # Export output/guangzhou-map.png
npm run check          # Type-check and build
```

## Data Model

```text
data/seeds.json                  # User input
data/places/*.json               # AMap candidate cache
data/map-points.generated.json    # Generated baseline
data/map-state.json               # Current editable map state
data/map-state.preview.json       # AI point edit preview
data/routes.json                  # Applied route overlays
data/routes.preview.json          # AI route preview
```

## Current Limits

- The MVP is scoped to Guangzhou.
- Place results need human review; AMap can return duplicates, closed places, nearby facilities, or ambiguous branch names.
- Coordinates come from AMap and use `GCJ-02`.
- Route overlays are straight polylines by point id; real walking/driving route geometry is not implemented yet.
- Excalidraw is a downstream layout tool; this repo exports PNG screenshots but does not generate Excalidraw files.
- Images, ratings, multi-day itinerary planning, and recommendation cards are intentionally out of scope for the first version.

## License

MIT. See [LICENSE](LICENSE).
