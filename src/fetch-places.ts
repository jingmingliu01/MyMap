import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PlaceBranch, PlaceGroup, SeedFile } from "./shared/schema.js";
import { slugify } from "./shared/slug.js";

interface AmapPoi {
  id?: string;
  name?: string;
  type?: string;
  address?: string | string[];
  adname?: string;
  cityname?: string | string[];
  pname?: string;
  location?: string;
}

interface AmapPoiResponse {
  status: string;
  info: string;
  count?: string;
  pois?: AmapPoi[];
}

const GUANGZHOU_DISTRICTS = new Set([
  "越秀区",
  "海珠区",
  "荔湾区",
  "天河区",
  "白云区",
  "黄埔区",
  "番禺区",
  "花都区",
  "南沙区",
  "从化区",
  "增城区"
]);

const DEFAULT_PAGE_SIZE = 25;
const DEFAULT_MAX_PAGES = 3;

async function main() {
  const apiKey = process.env.AMAP_WEB_SERVICE_KEY;
  if (!apiKey) {
    throw new Error("Missing AMAP_WEB_SERVICE_KEY. Copy .env.example to .env and set your AMap Web Service key.");
  }

  const seedPath = process.argv[2] ?? "data/seeds.json";
  const outputDir = process.env.PLACES_OUTPUT_DIR ?? "data/places";
  const seed = JSON.parse(await readFile(seedPath, "utf8")) as SeedFile;

  validateSeed(seed, seedPath);
  await mkdir(outputDir, { recursive: true });

  for (const item of seed.items) {
    const pois = await searchAllPages(apiKey, seed.city, item);
    const branches = normalizeBranches(pois);
    const group: PlaceGroup = {
      name: item,
      type: "place",
      branches
    };

    const filePath = path.join(outputDir, `${slugify(item)}.json`);
    await writeFile(filePath, `${JSON.stringify(group, null, 2)}\n`, "utf8");
    console.log(`${item}: wrote ${branches.length} branches to ${filePath}`);
  }
}

function validateSeed(seed: SeedFile, seedPath: string) {
  if (!seed || typeof seed.city !== "string" || !Array.isArray(seed.items)) {
    throw new Error(`${seedPath} must match { "city": "广州", "items": ["..."] }`);
  }
  if (seed.city !== "广州") {
    throw new Error(`This MVP is scoped to 广州, but ${seedPath} has city=${JSON.stringify(seed.city)}.`);
  }
  if (seed.items.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`${seedPath} items must be non-empty strings.`);
  }
}

async function searchAllPages(apiKey: string, city: string, keyword: string): Promise<AmapPoi[]> {
  const results: AmapPoi[] = [];

  for (let page = 1; page <= DEFAULT_MAX_PAGES; page += 1) {
    const params = new URLSearchParams({
      key: apiKey,
      keywords: keyword,
      region: toCityRegion(city),
      city_limit: "true",
      page_size: String(DEFAULT_PAGE_SIZE),
      page_num: String(page),
      output: "json"
    });

    const url = `https://restapi.amap.com/v5/place/text?${params.toString()}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`AMap POI request failed for ${keyword}, page ${page}: HTTP ${response.status}`);
    }

    const payload = (await response.json()) as AmapPoiResponse;
    if (payload.status !== "1") {
      throw new Error(`AMap POI request failed for ${keyword}, page ${page}: ${payload.info}`);
    }

    const pois = payload.pois ?? [];
    results.push(...pois);

    if (pois.length < DEFAULT_PAGE_SIZE) {
      break;
    }
  }

  return results;
}

function toCityRegion(city: string): string {
  return city.endsWith("市") ? city : `${city}市`;
}

function normalizeBranches(pois: AmapPoi[]): PlaceBranch[] {
  const seen = new Set<string>();
  const branches: Omit<PlaceBranch, "id">[] = [];
  const cityPois = pois.filter((poi) => parseLocation(poi.location) && isInGuangzhou(poi));

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
      map_provider: "amap"
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

function isInGuangzhou(poi: AmapPoi): boolean {
  const cityName = normalizeText(poi.cityname);
  const provinceName = poi.pname?.trim() ?? "";
  const district = poi.adname?.trim() ?? "";

  return cityName.includes("广州") || (provinceName === "广东省" && GUANGZHOU_DISTRICTS.has(district));
}

function normalizeText(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value.join("");
  }
  return value?.trim() ?? "";
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
