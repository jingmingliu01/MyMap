import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getFetchPlacesConfig, type FetchPlacesConfig } from "./shared/env";
import type { PlaceBranch, PlaceSourceFile, SeedFile } from "./shared/schema";
import { slugify } from "./shared/slug";

interface AmapPoi {
  id?: string;
  name?: string;
  type?: string;
  typecode?: string;
  address?: string | string[];
  adname?: string;
  cityname?: string | string[];
  citycode?: string;
  pname?: string;
  adcode?: string;
  location?: string;
}

interface AmapPoiResponse {
  status: string;
  info: string;
  count?: string;
  pois?: AmapPoi[];
}

async function main() {
  const apiKey = process.env.AMAP_WEB_SERVICE_KEY;
  if (!apiKey) {
    throw new Error("Missing AMAP_WEB_SERVICE_KEY. Copy .env.example to .env and set your AMap Web Service key.");
  }

  const seedPath = process.argv[2] ?? "data/seeds.json";
  const outputDir = process.env.PLACES_OUTPUT_DIR ?? "data/places";
  const fetchConfig = getFetchPlacesConfig();
  const seed = JSON.parse(await readFile(seedPath, "utf8")) as SeedFile;

  validateSeed(seed, seedPath);
  await mkdir(outputDir, { recursive: true });

  for (const item of seed.items) {
    const pois = await searchAllPages(apiKey, seed.city, item, fetchConfig);
    const branches = normalizeBranches(pois, seed.city);
    const placeFile: PlaceSourceFile = {
      name: item,
      city: seed.city,
      type: "place",
      branches
    };

    const filePath = path.join(outputDir, `${slugify(item)}.json`);
    await writeFile(filePath, `${JSON.stringify(placeFile, null, 2)}\n`, "utf8");
    console.log(`${item}: wrote ${branches.length} branches to ${filePath}`);
  }
}

function validateSeed(seed: SeedFile, seedPath: string) {
  if (!seed || typeof seed.city !== "string" || !Array.isArray(seed.items)) {
    throw new Error(`${seedPath} must match { "city": "城市名", "items": ["..."] }`);
  }
  if (!seed.city.trim()) {
    throw new Error(`${seedPath} city must be a non-empty string.`);
  }
  if (seed.items.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`${seedPath} items must be non-empty strings.`);
  }
}

async function searchAllPages(apiKey: string, city: string, keyword: string, config: FetchPlacesConfig): Promise<AmapPoi[]> {
  const results: AmapPoi[] = [];

  for (let page = 1; page <= config.maxPages; page += 1) {
    const params = new URLSearchParams({
      key: apiKey,
      keywords: keyword,
      region: toCityRegion(city),
      city_limit: "true",
      page_size: String(config.pageSize),
      page_num: String(page),
      output: "json"
    });

    const url = `https://restapi.amap.com/v5/place/text?${params.toString()}`;
    const payload = await fetchAmapJson(url, keyword, page, config);
    if (payload.status !== "1") {
      throw new Error(`AMap POI request failed for ${keyword}, page ${page}: ${payload.info}`);
    }

    const pois = payload.pois ?? [];
    results.push(...pois);

    if (pois.length < config.pageSize) {
      break;
    }
  }

  return results;
}

async function fetchAmapJson(url: string, keyword: string, page: number, config: FetchPlacesConfig): Promise<AmapPoiResponse> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= config.maxRequestAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return (await response.json()) as AmapPoiResponse;
    } catch (error) {
      lastError = error;
      if (attempt < config.maxRequestAttempts) {
        await delay(config.retryBackoffMs * attempt);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`AMap POI request failed for ${keyword}, page ${page}: ${messageFromError(lastError)}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toCityRegion(city: string): string {
  const trimmed = city.trim();
  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }
  return trimmed.endsWith("市") ? trimmed : `${trimmed}市`;
}

function normalizeBranches(pois: AmapPoi[], city: string): PlaceBranch[] {
  const seen = new Set<string>();
  const branches: Omit<PlaceBranch, "id">[] = [];
  const cityPois = pois.filter((poi) => parseLocation(poi.location) && isInRequestedCity(poi, city));

  for (const poi of cityPois) {
    const location = parseLocation(poi.location);
    if (!location) {
      continue;
    }

    const address = normalizeText(poi.address);
    const district = poi.adname?.trim() ?? "";
    const dedupeKey = [
      normalizeText(poi.name).toLowerCase(),
      address.toLowerCase(),
      location.longitude.toFixed(6),
      location.latitude.toFixed(6)
    ].join("|");

    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    branches.push({
      branch_name: normalizeText(poi.name) || "未命名地点",
      address,
      district,
      longitude: location.longitude,
      latitude: location.latitude,
      coordinate_system: "GCJ-02",
      map_provider: "amap",
      provider_place_id: normalizeText(poi.id),
      provider_type: normalizeText(poi.type),
      provider_typecode: normalizeText(poi.typecode),
      provider_city: normalizeText(poi.cityname),
      provider_citycode: normalizeText(poi.citycode),
      provider_adcode: normalizeText(poi.adcode)
    });
  }

  return branches.map((branch, index) => ({ id: index + 1, ...branch }));
}

function parseLocation(location: string | undefined) {
  if (!location) {
    return null;
  }

  const [longitudeRaw, latitudeRaw] = location.split(",");
  const longitude = Number(longitudeRaw);
  const latitude = Number(latitudeRaw);

  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return null;
  }

  return { longitude, latitude };
}

function isInRequestedCity(poi: AmapPoi, city: string): boolean {
  const requested = city.trim();
  const cityName = normalizeCityName(normalizeText(poi.cityname));
  const requestedName = normalizeCityName(requested);

  if (/^\d+$/.test(requested)) {
    const citycode = normalizeText(poi.citycode);
    const adcode = normalizeText(poi.adcode);
    if (citycode && citycode === requested) {
      return true;
    }
    if (adcode && requested.length === 6) {
      return adcode.slice(0, 4) === requested.slice(0, 4);
    }
  }

  return Boolean(cityName && requestedName && (cityName === requestedName || cityName.includes(requestedName) || requestedName.includes(cityName)));
}

function normalizeCityName(value: string): string {
  return value.trim().replace(/市$/, "").toLowerCase();
}

function normalizeText(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value.join("");
  }
  return value?.trim() ?? "";
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
