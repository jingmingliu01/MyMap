import { existsSync } from "node:fs";
import type { MapPointsFile, MapRoute, MapRoutesFile, PendingEditFile, WorkspaceOperation } from "../shared/schema";
import {
  PENDING_EDIT_PATH,
  PREVIEW_RENDER_POINTS_PATH,
  PREVIEW_RENDER_ROUTES_PATH,
  RENDER_POINTS_PATH,
  RENDER_ROUTES_PATH
} from "../shared/paths";
import { readJson } from "./json";
import { slugify } from "../shared/slug";
import {
  applyOperations,
  applyPendingEdit,
  clearPreview,
  ensureWorkspaceFiles,
  readWorkspace,
  regenerateRenderArtifacts,
  renderWorkspace,
  workspaceRoutesFromMapRoutes,
  writePendingPreview
} from "./workspace";

export async function ensureStateFiles() {
  await ensureWorkspaceFiles();
}

export async function readFullState() {
  await ensureStateFiles();
  return {
    rendered: await readJson<MapPointsFile>(RENDER_POINTS_PATH),
    preview: existsSync(PREVIEW_RENDER_POINTS_PATH) ? await readJson<MapPointsFile>(PREVIEW_RENDER_POINTS_PATH) : null,
    routes: await readJson<MapRoutesFile>(RENDER_ROUTES_PATH),
    preview_routes: existsSync(PREVIEW_RENDER_ROUTES_PATH) ? await readJson<MapRoutesFile>(PREVIEW_RENDER_ROUTES_PATH) : null
  };
}

export async function readEditableMapState(): Promise<MapPointsFile> {
  await ensureStateFiles();
  if (existsSync(PREVIEW_RENDER_POINTS_PATH)) {
    return readJson<MapPointsFile>(PREVIEW_RENDER_POINTS_PATH);
  }
  return readJson<MapPointsFile>(RENDER_POINTS_PATH);
}

export async function readEditableRoutes(): Promise<MapRoutesFile> {
  await ensureStateFiles();
  if (existsSync(PREVIEW_RENDER_ROUTES_PATH)) {
    return readJson<MapRoutesFile>(PREVIEW_RENDER_ROUTES_PATH);
  }
  return readJson<MapRoutesFile>(RENDER_ROUTES_PATH);
}

export async function writePreviewMapState(mapState: MapPointsFile) {
  const rendered = await readJson<MapPointsFile>(RENDER_POINTS_PATH);
  const operations = rendered.points.flatMap((point): WorkspaceOperation[] => {
    const nextPoint = mapState.points.find((candidate) => candidate.id === point.id);
    if (!nextPoint || nextPoint.visible === false) {
      return [{ type: "archive_branch", branch_id: point.branch_stable_id ?? point.id }];
    }
    return [];
  });
  await appendPendingOperations("预览地图地点归档变更。", operations, { mapPoints: mapState });
}

export async function writePreviewRoutes(routes: MapRoutesFile) {
  const operations: WorkspaceOperation[] = [{ type: "replace_routes", routes: workspaceRoutesFromMapRoutes(routes.routes) }];
  await appendPendingOperations("预览路线变更。", operations, { routes });
}

export async function applyPreview() {
  await applyPendingEdit();
}

export async function revertPreview() {
  await clearPreview();
  await regenerateRenderArtifacts();
}

async function appendPendingOperations(summary: string, operations: WorkspaceOperation[], preview: { mapPoints?: MapPointsFile; routes?: MapRoutesFile }) {
  if (operations.length === 0) {
    return;
  }

  const existing = existsSync(PENDING_EDIT_PATH) ? await readJson<PendingEditFile>(PENDING_EDIT_PATH) : null;
  const pending: PendingEditFile = {
    created_at: existing?.created_at ?? new Date().toISOString(),
    summary,
    operations: [...(existing?.operations ?? []), ...operations]
  };

  if (preview.mapPoints && !preview.routes && existing?.operations) {
    const workspace = applyOperations(await readWorkspace(), pending.operations);
    const rendered = renderWorkspace(workspace);
    await writePendingPreview(pending, { mapPoints: rendered.mapPoints, routes: rendered.routes });
    return;
  }

  await writePendingPreview(pending, preview);
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
