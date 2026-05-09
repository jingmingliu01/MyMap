# MyMap

AI-assisted map workflow for turning a compact place list into an interactive travel map.

```text
data/seeds.json
  -> POI search
  -> LLM selection
  -> structured map data
  -> interactive map
  -> PNG export
```

## Preview

All generated places:

![MyMap all places](assets/readme/map-all-points.png)

Selected group:

![MyMap selected group](assets/readme/map-selected-group.png)

## Input

Create or edit `data/seeds.json`:

```json
{
  "city": "广州",
  "items": [
    "海心桥",
    "永庆坊",
    "利苑酒家",
    "太古汇"
  ]
}
```

`city` is used as the POI search boundary. `items` can be restaurants, landmarks, malls, cafes, hotels, or other place names.

## API Keys

MyMap requires AMap for map data and one LLM provider for candidate selection.

### AMap

Create keys in the AMap developer console:

```text
AMAP_WEB_SERVICE_KEY=...
AMAP_JS_API_KEY=...
AMAP_JS_API_SECURITY_JS_CODE=...
```

Use `AMAP_WEB_SERVICE_KEY` for Web Service POI search. Use `AMAP_JS_API_KEY` and `AMAP_JS_API_SECURITY_JS_CODE` for the browser map.

### LLM

DeepSeek is the default provider:

```text
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=...
```

OpenAI is also supported:

```text
LLM_PROVIDER=openai
OPENAI_API_KEY=...
```

## Quick Start

```bash
npm start
```

The setup script writes `.env`, installs dependencies, prepares `data/seeds.json` if needed, runs POI search, runs LLM selection, generates map data, and starts the local app.

Open:

```text
http://127.0.0.1:5173/
```

## Update Places

Edit:

```text
data/seeds.json
```

Then regenerate and run:

```bash
npm run generate
npm run dev
```

## Screenshot

```bash
npm run screenshot
```

Default output:

```text
output/mymap.png
```

Custom output:

```bash
npm run screenshot -- --width 2560 --height 1440 --output output/my-trip-map.png
```

## Scripts

```bash
npm start              # interactive setup and run
npm run fetch:places   # fetch POI candidates
npm run merge:points   # run LLM selection and merge map data
npm run generate       # fetch:places + merge:points
npm run dev            # start the local map app
npm run screenshot     # export PNG
npm run check          # typecheck, test, and build
```

## Generated Data

Primary input:

```text
data/seeds.json
```

Generated files:

```text
data/places/*.json
data/selections/*.selection.json
data/map-state.json
data/routes.json
output/*.png
```

Generated files are ignored by Git and can be recreated from `data/seeds.json`.
