import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_CATEGORIES, DEFAULT_PROVIDER_MAPPINGS, categoryIdsForProviderFacts } from "../shared/categories";
import {
  PENDING_EDIT_PATH,
  PREVIEW_RENDER_POINTS_PATH,
  PREVIEW_RENDER_ROUTES_PATH,
  RENDER_POINTS_PATH,
  RENDER_ROUTES_PATH,
  WORKSPACE_BRANCHES_PATH,
  WORKSPACE_CATEGORIES_PATH,
  WORKSPACE_IMPORTS_PATH,
  WORKSPACE_PLACES_PATH,
  WORKSPACE_ROUTES_PATH,
  WORKSPACE_TAGS_PATH,
  WORKSPACE_TAG_ASSIGNMENTS_PATH
} from "../shared/paths";
import type {
  MapPoint,
  MapPointsFile,
  MapRoute,
  MapRoutesFile,
  PendingEditFile,
  WorkspaceBranch,
  WorkspaceBranchesFile,
  WorkspaceCategoriesFile,
  WorkspaceImportsFile,
  WorkspaceOperation,
  WorkspacePlace,
  WorkspacePlacesFile,
  WorkspaceRoute,
  WorkspaceRoutesFile,
  WorkspaceTagAssignmentsFile,
  WorkspaceTagsFile
} from "../shared/schema";
import { slugify } from "../shared/slug";
import { readJson, writeJson } from "./json";

const PLACE_COLORS = ["#d84f3a", "#247b5f", "#4d64c8", "#8a5a32", "#8f4fc7", "#cc7a1f", "#3d7f89", "#b9486a"];

export interface WorkspaceState {
  places: WorkspacePlacesFile;
  branches: WorkspaceBranchesFile;
  categories: WorkspaceCategoriesFile;
  tags: WorkspaceTagsFile;
  tagAssignments: WorkspaceTagAssignmentsFile;
  routes: WorkspaceRoutesFile;
  imports: WorkspaceImportsFile;
}

export async function ensureWorkspaceFiles() {
  await mkdir(path.dirname(WORKSPACE_PLACES_PATH), { recursive: true });
  if (!existsSync(WORKSPACE_CATEGORIES_PATH)) {
    await writeJson(WORKSPACE_CATEGORIES_PATH, {
      categories: DEFAULT_CATEGORIES,
      provider_mappings: DEFAULT_PROVIDER_MAPPINGS
    } satisfies WorkspaceCategoriesFile);
  }
  if (!existsSync(WORKSPACE_TAGS_PATH)) {
    await writeJson(WORKSPACE_TAGS_PATH, { tags: [] } satisfies WorkspaceTagsFile);
  }
  if (!existsSync(WORKSPACE_TAG_ASSIGNMENTS_PATH)) {
    await writeJson(WORKSPACE_TAG_ASSIGNMENTS_PATH, { assignments: [] } satisfies WorkspaceTagAssignmentsFile);
  }
  if (!existsSync(WORKSPACE_ROUTES_PATH)) {
    await writeJson(WORKSPACE_ROUTES_PATH, { routes: [] } satisfies WorkspaceRoutesFile);
  }
  if (!existsSync(WORKSPACE_IMPORTS_PATH)) {
    await writeJson(WORKSPACE_IMPORTS_PATH, { imports: [] } satisfies WorkspaceImportsFile);
  }

  if (!existsSync(WORKSPACE_PLACES_PATH) || !existsSync(WORKSPACE_BRANCHES_PATH)) {
    throw new Error(`Missing workspace files. Run npm run generate to create ${WORKSPACE_PLACES_PATH} and ${WORKSPACE_BRANCHES_PATH}.`);
  }

  await regenerateRenderArtifacts();
}

export async function readWorkspace(): Promise<WorkspaceState> {
  await ensureWorkspaceFiles();
  return readWorkspaceUnchecked();
}

export async function writeWorkspace(state: WorkspaceState) {
  await Promise.all([
    writeJson(WORKSPACE_PLACES_PATH, state.places),
    writeJson(WORKSPACE_BRANCHES_PATH, state.branches),
    writeJson(WORKSPACE_CATEGORIES_PATH, state.categories),
    writeJson(WORKSPACE_TAGS_PATH, state.tags),
    writeJson(WORKSPACE_TAG_ASSIGNMENTS_PATH, state.tagAssignments),
    writeJson(WORKSPACE_ROUTES_PATH, state.routes),
    writeJson(WORKSPACE_IMPORTS_PATH, state.imports)
  ]);
}

export async function regenerateRenderArtifacts() {
  const workspace = await readWorkspaceUnchecked();
  const rendered = renderWorkspace(workspace);
  await Promise.all([writeJson(RENDER_POINTS_PATH, rendered.mapPoints), writeJson(RENDER_ROUTES_PATH, rendered.routes)]);

  return rendered;
}

export function renderWorkspace(workspace: WorkspaceState): { mapPoints: MapPointsFile; routes: MapRoutesFile } {
  const activePlaces = workspace.places.places.filter((place) => place.status === "active");
  const placeById = new Map(activePlaces.map((place) => [place.place_id, place]));
  const categoryById = new Map(workspace.categories.categories.filter((category) => category.status === "active").map((category) => [category.category_id, category]));
  const activeAssignments = workspace.tagAssignments.assignments.filter((assignment) => assignment.status === "active");
  const activeTags = workspace.tags.tags.filter((tag) => tag.status === "active");
  const tagById = new Map(activeTags.map((tag) => [tag.tag_id, tag]));
  const branchTagIds = new Map<string, string[]>();
  const routeTagIds = new Map<string, string[]>();

  for (const assignment of activeAssignments) {
    const target = assignment.target_type === "branch" ? branchTagIds : routeTagIds;
    target.set(assignment.target_id, [...(target.get(assignment.target_id) ?? []), assignment.tag_id]);
  }

  const branchCounters = new Map<string, number>();
  const city = inferCity(workspace.branches.branches);
  const points = workspace.branches.branches.flatMap((branch): MapPoint[] => {
    const place = placeById.get(branch.place_id);
    if (!place || branch.status !== "active") {
      return [];
    }

    const displayBranchId = (branchCounters.get(place.place_id) ?? 0) + 1;
    branchCounters.set(place.place_id, displayBranchId);
    const categoryIds = branch.category_ids.length > 0 ? branch.category_ids : ["cat_place"];
    const categories = categoryIds.map((categoryId) => categoryById.get(categoryId)).filter((category): category is NonNullable<typeof category> => Boolean(category));
    const tagIds = branchTagIds.get(branch.branch_id) ?? [];
    const tags = tagIds.map((tagId) => tagById.get(tagId)).filter((tag): tag is NonNullable<typeof tag> => Boolean(tag));

    return [
      {
        id: branch.branch_id,
        branch_stable_id: branch.branch_id,
        place_id: place.place_id,
        place_name: place.name,
        place_type: placeTypeFromCategoryIds(categoryIds),
        place_color: colorForPlace(place.place_id),
        branch_id: displayBranchId,
        branch_name: branch.name,
        label: String(displayBranchId),
        address: branch.address,
        district: branch.district,
        longitude: branch.longitude,
        latitude: branch.latitude,
        category_ids: categoryIds,
        category_names: categories.map((category) => category.name),
        tag_ids: tagIds,
        tag_names: tags.map((tag) => tag.name),
        provider: branch.provider,
        provider_place_id: branch.provider_place_id,
        provider_type: branch.provider_type,
        provider_typecode: branch.provider_typecode,
        visible: true
      }
    ];
  });

  const branchIds = new Set(points.map((point) => point.id));
  const routes: MapRoute[] = workspace.routes.routes
    .filter((route) => route.status === "active")
    .map((route) => {
      const branch_ids = route.branch_ids.filter((branchId) => branchIds.has(branchId));
      const tagIds = routeTagIds.get(route.route_id) ?? [];
      const tags = tagIds.map((tagId) => tagById.get(tagId)).filter((tag): tag is NonNullable<typeof tag> => Boolean(tag));
      return {
        id: route.route_id,
        route_id: route.route_id,
        name: route.name,
        color: route.color,
        point_ids: branch_ids,
        branch_ids,
        tag_ids: tagIds,
        tag_names: tags.map((tag) => tag.name)
      };
    })
    .filter((route) => route.point_ids.length >= 2);

  return {
    mapPoints: {
      city,
      coordinate_system: "GCJ-02",
      map_provider: "amap",
      points
    },
    routes: { routes }
  };
}

export async function writePendingPreview(pending: PendingEditFile, preview?: { mapPoints?: MapPointsFile; routes?: MapRoutesFile }) {
  await writeJson(PENDING_EDIT_PATH, pending);
  if (preview?.mapPoints) {
    await writeJson(PREVIEW_RENDER_POINTS_PATH, preview.mapPoints);
  }
  if (preview?.routes) {
    await writeJson(PREVIEW_RENDER_ROUTES_PATH, preview.routes);
  }
}

export async function applyPendingEdit() {
  if (!existsSync(PENDING_EDIT_PATH)) {
    throw new Error("No preview exists. Ask the AI for an edit before applying.");
  }

  const pending = await readJson<PendingEditFile>(PENDING_EDIT_PATH);
  const workspace = await readWorkspace();
  const updated = applyOperations(workspace, pending.operations);
  await writeWorkspace(updated);
  await clearPreview();
  await regenerateRenderArtifacts();
}

export async function clearPreview() {
  await Promise.all([
    rm(PENDING_EDIT_PATH, { force: true }),
    rm(PREVIEW_RENDER_POINTS_PATH, { force: true }),
    rm(PREVIEW_RENDER_ROUTES_PATH, { force: true })
  ]);
}

export function applyOperations(workspace: WorkspaceState, operations: WorkspaceOperation[]): WorkspaceState {
  const now = new Date().toISOString();
  const next: WorkspaceState = structuredClone(workspace);

  for (const operation of operations) {
    if (operation.type === "archive_place" || operation.type === "restore_place") {
      const place = next.places.places.find((candidate) => candidate.place_id === operation.place_id);
      if (place) {
        place.status = operation.type === "archive_place" ? "archived" : "active";
        place.updated_at = now;
      }
    } else if (operation.type === "archive_branch" || operation.type === "restore_branch") {
      const branch = next.branches.branches.find((candidate) => candidate.branch_id === operation.branch_id);
      if (branch) {
        branch.status = operation.type === "archive_branch" ? "archived" : "active";
        branch.updated_at = now;
      }
    } else if (operation.type === "replace_routes") {
      const existingById = new Map(next.routes.routes.map((route) => [route.route_id, route]));
      const incomingIds = new Set(operation.routes.map((route) => route.route_id));
      next.routes.routes = [
        ...operation.routes.map((route) => ({
          ...route,
          status: "active" as const,
          created_at: existingById.get(route.route_id)?.created_at ?? now,
          updated_at: now
        })),
        ...next.routes.routes
          .filter((route) => !incomingIds.has(route.route_id))
          .map((route) => ({
            ...route,
            status: "archived" as const,
            updated_at: now
          }))
      ];
    }
  }

  return next;
}

export async function writeWorkspaceFromSelectedBranches(input: {
  city: string;
  sourcePath: string;
  places: Array<{
    placeName: string;
    placeType: import("../shared/schema").PlaceType;
    branches: Array<{
      branchName: string;
      address: string;
      district: string;
      longitude: number;
      latitude: number;
      providerPlaceId?: string;
      providerType?: string;
      providerTypecode?: string;
    }>;
  }>;
}) {
  const now = new Date().toISOString();
  const current = await readExistingWorkspaceOrDefault();
  const placesById = new Map(current.places.places.map((place) => [place.place_id, place]));
  const branchesById = new Map(current.branches.branches.map((branch) => [branch.branch_id, branch]));
  const branchByProviderId = new Map(
    current.branches.branches
      .filter((branch) => branch.provider_place_id)
      .map((branch) => [`${branch.provider}:${branch.provider_place_id}`, branch])
  );

  for (const place of input.places) {
    const placeId = stableId("place", place.placeName);
    const existingPlace = placesById.get(placeId);
    placesById.set(placeId, {
      place_id: placeId,
      name: place.placeName,
      status: "active",
      created_at: existingPlace?.created_at ?? now,
      updated_at: now
    });

    for (const branch of place.branches) {
      const branchKey = branch.providerPlaceId ?? `${place.placeName}|${branch.branchName}|${branch.address}|${branch.longitude.toFixed(6)},${branch.latitude.toFixed(6)}`;
      const providerLookupKey = branch.providerPlaceId ? `amap:${branch.providerPlaceId}` : "";
      const existingBranch = providerLookupKey ? branchByProviderId.get(providerLookupKey) : branchesById.get(stableId("branch", branchKey));
      const branchId = existingBranch?.branch_id ?? stableId("branch", branchKey);
      const nextBranch: WorkspaceBranch = {
        branch_id: stableId("branch", branchKey),
        place_id: placeId,
        name: branch.branchName,
        city: input.city,
        address: branch.address,
        district: branch.district,
        longitude: branch.longitude,
        latitude: branch.latitude,
        coordinate_system: "GCJ-02",
        provider: "amap",
        provider_place_id: branch.providerPlaceId,
        provider_type: branch.providerType,
        provider_typecode: branch.providerTypecode,
        category_ids: categoryIdsForProviderFacts({
          provider_type: branch.providerType,
          provider_typecode: branch.providerTypecode,
          fallback_place_type: place.placeType
        }),
        status: "active",
        created_at: existingBranch?.created_at ?? now,
        updated_at: now,
        last_seen_at: now
      };
      nextBranch.branch_id = branchId;
      branchesById.set(branchId, nextBranch);
    }
  }

  await writeWorkspace({
    places: { places: Array.from(placesById.values()) },
    branches: { branches: Array.from(branchesById.values()) },
    categories: current.categories,
    tags: current.tags,
    tagAssignments: current.tagAssignments,
    routes: current.routes,
    imports: {
      imports: [
        ...current.imports.imports,
        {
          import_id: stableId("import", `${input.sourcePath}|${now}`),
          source_type: "seed",
          source_path: input.sourcePath,
          city: input.city,
          item_count: input.places.length,
          status: "active",
          created_at: now,
          updated_at: now
        }
      ]
    }
  });

  return regenerateRenderArtifacts();
}

async function readExistingWorkspaceOrDefault(): Promise<WorkspaceState> {
  if (
    existsSync(WORKSPACE_PLACES_PATH) &&
    existsSync(WORKSPACE_BRANCHES_PATH) &&
    existsSync(WORKSPACE_CATEGORIES_PATH) &&
    existsSync(WORKSPACE_TAGS_PATH) &&
    existsSync(WORKSPACE_TAG_ASSIGNMENTS_PATH) &&
    existsSync(WORKSPACE_ROUTES_PATH) &&
    existsSync(WORKSPACE_IMPORTS_PATH)
  ) {
    return readWorkspaceUnchecked();
  }

  return {
    places: { places: [] },
    branches: { branches: [] },
    categories: { categories: DEFAULT_CATEGORIES, provider_mappings: DEFAULT_PROVIDER_MAPPINGS },
    tags: { tags: [] },
    tagAssignments: { assignments: [] },
    routes: { routes: [] },
    imports: { imports: [] }
  };
}

export function workspaceRoutesFromMapRoutes(routes: MapRoute[]): WorkspaceRoute[] {
  const now = new Date().toISOString();
  return routes.map((route, index) => ({
    route_id: route.route_id ?? route.id ?? `route_${index + 1}`,
    name: route.name || `路线 ${index + 1}`,
    color: route.color || "#1f6f8b",
    branch_ids: route.branch_ids ?? route.point_ids,
    status: "active",
    created_at: now,
    updated_at: now
  }));
}

async function readWorkspaceUnchecked(): Promise<WorkspaceState> {
  return {
    places: await readJson<WorkspacePlacesFile>(WORKSPACE_PLACES_PATH),
    branches: await readJson<WorkspaceBranchesFile>(WORKSPACE_BRANCHES_PATH),
    categories: await readJson<WorkspaceCategoriesFile>(WORKSPACE_CATEGORIES_PATH),
    tags: await readJson<WorkspaceTagsFile>(WORKSPACE_TAGS_PATH),
    tagAssignments: await readJson<WorkspaceTagAssignmentsFile>(WORKSPACE_TAG_ASSIGNMENTS_PATH),
    routes: await readJson<WorkspaceRoutesFile>(WORKSPACE_ROUTES_PATH),
    imports: await readJson<WorkspaceImportsFile>(WORKSPACE_IMPORTS_PATH)
  };
}

function inferCity(branches: WorkspaceBranch[]): string {
  const firstBranch = branches.find((branch) => branch.status === "active") ?? branches[0];
  return firstBranch?.city ?? "广州";
}

function stableId(prefix: string, value: string): string {
  const hash = createHash("sha1").update(value).digest("hex").slice(0, 12);
  return `${prefix}_${slugify(value).slice(0, 32) || hash}_${hash}`;
}

function colorForPlace(placeId: string): string {
  let hash = 0;
  for (const char of placeId) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return PLACE_COLORS[hash % PLACE_COLORS.length];
}

function placeTypeFromCategoryIds(categoryIds: string[]): import("../shared/schema").PlaceType {
  if (categoryIds.includes("cat_food")) {
    return "restaurant";
  }
  if (categoryIds.includes("cat_cafe")) {
    return "cafe";
  }
  if (categoryIds.includes("cat_attraction")) {
    return "attraction";
  }
  if (categoryIds.includes("cat_shopping")) {
    return "mall";
  }
  return "place";
}
