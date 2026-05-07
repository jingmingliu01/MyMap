export type PlaceType = "restaurant" | "cafe" | "attraction" | "mall" | "place";

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
}

export interface PlaceGroup {
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
  group_type: PlaceType;
  selected_branch_ids: number[];
  rejected_branch_ids: number[];
  notes: string;
}

export interface MapPoint {
  id: string;
  group_name: string;
  group_type: PlaceType;
  group_color: string;
  branch_id: number;
  branch_name: string;
  label: string;
  address: string;
  district: string;
  longitude: number;
  latitude: number;
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
  name: string;
  color: string;
  point_ids: string[];
}

export interface MapRoutesFile {
  routes: MapRoute[];
}

export interface MapStateResponse {
  generated: MapPointsFile;
  current: MapPointsFile;
  preview: MapPointsFile | null;
  routes: MapRoutesFile;
  preview_routes: MapRoutesFile | null;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
