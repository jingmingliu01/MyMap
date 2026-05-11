export type PlaceType = "restaurant" | "cafe" | "attraction" | "mall" | "place";
export type WorkspaceStatus = "active" | "archived";
export type WorkspaceProvider = "amap";

export interface SeedFile {
  city: string;
  items: string[];
}

export interface PlaceBranch {
  id: number;
  branch_name: string;
  address: string;
  district: string;
  longitude: number;
  latitude: number;
  coordinate_system: "GCJ-02";
  map_provider: "amap";
  provider_place_id?: string;
  provider_type?: string;
  provider_typecode?: string;
  provider_city?: string;
  provider_citycode?: string;
  provider_adcode?: string;
}

export interface PlaceSourceFile {
  name: string;
  city: string;
  type: PlaceType;
  branches: PlaceBranch[];
}

export interface PlaceSelectionFile {
  source_place_file: string;
  source_hash: string;
  prompt_hash: string;
  provider: string;
  model: string;
  name: string;
  city: string;
  place_type: PlaceType;
  selected_branch_ids: number[];
  rejected_branch_ids: number[];
  notes: string;
}

export interface MapPoint {
  id: string;
  branch_stable_id: string;
  place_id: string;
  place_name: string;
  place_type: PlaceType;
  place_color: string;
  branch_id: number;
  branch_name: string;
  label: string;
  address: string;
  district: string;
  longitude: number;
  latitude: number;
  category_ids?: string[];
  category_names?: string[];
  tag_ids?: string[];
  tag_names?: string[];
  provider?: WorkspaceProvider;
  provider_place_id?: string;
  provider_type?: string;
  provider_typecode?: string;
  visible?: boolean;
}

export interface MapPointsFile {
  city: string;
  coordinate_system: "GCJ-02";
  map_provider: "amap";
  points: MapPoint[];
}

export interface MapRoute {
  id: string;
  route_id?: string;
  name: string;
  color: string;
  point_ids: string[];
  branch_ids?: string[];
  tag_ids?: string[];
  tag_names?: string[];
}

export interface MapRoutesFile {
  routes: MapRoute[];
}

export interface MapStateResponse {
  rendered: MapPointsFile;
  preview: MapPointsFile | null;
  routes: MapRoutesFile;
  preview_routes: MapRoutesFile | null;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface WorkspacePlace {
  place_id: string;
  name: string;
  status: WorkspaceStatus;
  created_at: string;
  updated_at: string;
}

export interface WorkspacePlacesFile {
  places: WorkspacePlace[];
}

export interface WorkspaceBranch {
  branch_id: string;
  place_id: string;
  name: string;
  city?: string;
  address: string;
  district: string;
  longitude: number;
  latitude: number;
  coordinate_system: "GCJ-02";
  provider: WorkspaceProvider;
  provider_place_id?: string;
  provider_type?: string;
  provider_typecode?: string;
  category_ids: string[];
  status: WorkspaceStatus;
  created_at: string;
  updated_at: string;
  last_seen_at?: string;
}

export interface WorkspaceBranchesFile {
  branches: WorkspaceBranch[];
}

export interface WorkspaceCategory {
  category_id: string;
  name: string;
  icon: string;
  color: string;
  source: "provider_mapping" | "system";
  status: WorkspaceStatus;
}

export interface WorkspaceProviderCategoryMapping {
  provider: WorkspaceProvider;
  typecode_prefix: string;
  category_id: string;
}

export interface WorkspaceCategoriesFile {
  categories: WorkspaceCategory[];
  provider_mappings: WorkspaceProviderCategoryMapping[];
}

export interface WorkspaceTag {
  tag_id: string;
  name: string;
  color: string;
  icon: string;
  created_by: "user" | "ai" | "import";
  status: WorkspaceStatus;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceTagsFile {
  tags: WorkspaceTag[];
}

export interface WorkspaceTagAssignment {
  tag_id: string;
  target_type: "branch" | "route";
  target_id: string;
  status: WorkspaceStatus;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceTagAssignmentsFile {
  assignments: WorkspaceTagAssignment[];
}

export interface WorkspaceRoute {
  route_id: string;
  name: string;
  color: string;
  branch_ids: string[];
  status: WorkspaceStatus;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceRoutesFile {
  routes: WorkspaceRoute[];
}

export interface WorkspaceImportRecord {
  import_id: string;
  source_type: "seed";
  source_path: string;
  city: string;
  item_count: number;
  status: WorkspaceStatus;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceImportsFile {
  imports: WorkspaceImportRecord[];
}

export type WorkspaceOperation =
  | { type: "archive_place"; place_id: string }
  | { type: "restore_place"; place_id: string }
  | { type: "archive_branch"; branch_id: string }
  | { type: "restore_branch"; branch_id: string }
  | { type: "replace_routes"; routes: WorkspaceRoute[] };

export interface PendingEditFile {
  created_at: string;
  summary: string;
  operations: WorkspaceOperation[];
}
