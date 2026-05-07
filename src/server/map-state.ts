import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import type { MapPointsFile, MapRoute, MapRoutesFile } from "../shared/schema";
import {
  CURRENT_POINTS_PATH,
  GENERATED_POINTS_PATH,
  LEGACY_POINTS_PATH,
  PREVIEW_POINTS_PATH,
  PREVIEW_ROUTES_PATH,
  ROUTES_PATH
} from "../shared/paths";
import { slugify } from "../shared/slug";
import { readJson, writeJson } from "./json";

export async function ensureStateFiles() {
  if (!existsSync(GENERATED_POINTS_PATH)) {
    if (!existsSync(LEGACY_POINTS_PATH)) {
      throw new Error(`Missing ${GENERATED_POINTS_PATH}. Run npm run merge:points first.`);
    }
    await writeJson(GENERATED_POINTS_PATH, await readJson(LEGACY_POINTS_PATH));
  }

  if (!existsSync(CURRENT_POINTS_PATH)) {
    await writeJson(CURRENT_POINTS_PATH, await readJson(GENERATED_POINTS_PATH));
  }

  if (!existsSync(ROUTES_PATH)) {
    await writeJson(ROUTES_PATH, { routes: [] });
  }
}

export async function readFullState() {
  await ensureStateFiles();
  return {
    generated: await readJson<MapPointsFile>(GENERATED_POINTS_PATH),
    current: await readJson<MapPointsFile>(CURRENT_POINTS_PATH),
    preview: existsSync(PREVIEW_POINTS_PATH) ? await readJson<MapPointsFile>(PREVIEW_POINTS_PATH) : null,
    routes: await readJson<MapRoutesFile>(ROUTES_PATH),
    preview_routes: existsSync(PREVIEW_ROUTES_PATH) ? await readJson<MapRoutesFile>(PREVIEW_ROUTES_PATH) : null
  };
}

export async function readEditableMapState(): Promise<MapPointsFile> {
  await ensureStateFiles();
  return existsSync(PREVIEW_POINTS_PATH) ? await readJson<MapPointsFile>(PREVIEW_POINTS_PATH) : await readJson<MapPointsFile>(CURRENT_POINTS_PATH);
}

export async function readEditableRoutes(): Promise<MapRoutesFile> {
  await ensureStateFiles();
  return existsSync(PREVIEW_ROUTES_PATH) ? await readJson<MapRoutesFile>(PREVIEW_ROUTES_PATH) : await readJson<MapRoutesFile>(ROUTES_PATH);
}

export async function writePreviewMapState(mapState: MapPointsFile) {
  await writeJson(PREVIEW_POINTS_PATH, mapState);
}

export async function writePreviewRoutes(routes: MapRoutesFile) {
  await writeJson(PREVIEW_ROUTES_PATH, routes);
}

export async function applyPreview() {
  if (!existsSync(PREVIEW_POINTS_PATH)) {
    throw new Error("No preview exists. Ask the AI for an edit before applying.");
  }

  const previewPoints = await readJson<MapPointsFile>(PREVIEW_POINTS_PATH);
  const previewRoutes = existsSync(PREVIEW_ROUTES_PATH) ? await readJson<MapRoutesFile>(PREVIEW_ROUTES_PATH) : { routes: [] };
  const normalized = normalizeAppliedMapState(previewPoints, previewRoutes);

  await writeJson(CURRENT_POINTS_PATH, normalized.mapState);
  await writeJson(LEGACY_POINTS_PATH, normalized.mapState);
  await writeJson(ROUTES_PATH, normalized.routes);
  await clearPreview();
}

export async function revertToGenerated() {
  const generated = await readJson<MapPointsFile>(GENERATED_POINTS_PATH);
  await writeJson(CURRENT_POINTS_PATH, generated);
  await writeJson(LEGACY_POINTS_PATH, generated);
  await writeJson(ROUTES_PATH, { routes: [] });
  await clearPreview();
}

async function clearPreview() {
  await Promise.all([rm(PREVIEW_POINTS_PATH, { force: true }), rm(PREVIEW_ROUTES_PATH, { force: true })]);
}

function normalizeAppliedMapState(mapState: MapPointsFile, routes: MapRoutesFile): { mapState: MapPointsFile; routes: MapRoutesFile } {
  const idMap = new Map<string, string>();
  const nextBranchIdByGroup = new Map<string, number>();
  const normalizedPoints = mapState.points.map((point) => {
    if (point.visible === false) {
      return point;
    }

    const nextBranchId = nextBranchIdByGroup.get(point.group_name) ?? 1;
    nextBranchIdByGroup.set(point.group_name, nextBranchId + 1);
    const nextId = `${slugify(point.group_name)}-${nextBranchId}`;
    idMap.set(point.id, nextId);

    return {
      ...point,
      id: nextId,
      branch_id: nextBranchId,
      label: String(nextBranchId),
      visible: true
    };
  });

  const normalizedRoutes = {
    routes: routes.routes
      .map((route) => ({
        ...route,
        point_ids: route.point_ids.map((pointId) => idMap.get(pointId) ?? pointId)
      }))
      .filter((route) => route.point_ids.length >= 2)
  };

  return {
    mapState: {
      ...mapState,
      points: normalizedPoints
    },
    routes: normalizedRoutes
  };
}

export function sanitizeRoutes(rawRoutes: { routes: MapRoute[] } | MapRoute[], mapState: MapPointsFile): MapRoutesFile {
  const routeCandidates = Array.isArray(rawRoutes) ? rawRoutes : rawRoutes.routes;
  const visibleIds = new Set(mapState.points.filter((point) => point.visible !== false).map((point) => point.id));
  const seenRouteIds = new Set<string>();
  const routes: MapRoute[] = [];

  for (const [index, route] of routeCandidates.entries()) {
    const point_ids = unique(route.point_ids).filter((pointId) => visibleIds.has(pointId));
    if (point_ids.length < 2) {
      continue;
    }

    const baseId = route.id ? slugify(route.id) : `route-${index + 1}`;
    routes.push({
      id: uniqueRouteId(baseId || `route-${index + 1}`, seenRouteIds),
      name: route.name || `路线 ${routes.length + 1}`,
      color: route.color || "#1f6f8b",
      point_ids
    });
  }

  return { routes };
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function uniqueRouteId(baseId: string, seenRouteIds: Set<string>): string {
  let id = baseId;
  let suffix = 2;
  while (seenRouteIds.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }
  seenRouteIds.add(id);
  return id;
}
