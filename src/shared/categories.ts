import type { PlaceType, WorkspaceCategory, WorkspaceProviderCategoryMapping } from "./schema";

export const DEFAULT_CATEGORIES: WorkspaceCategory[] = [
  {
    category_id: "cat_food",
    name: "餐饮",
    icon: "utensils",
    color: "#d84f3a",
    source: "provider_mapping",
    status: "active"
  },
  {
    category_id: "cat_cafe",
    name: "咖啡",
    icon: "coffee",
    color: "#8a5a32",
    source: "provider_mapping",
    status: "active"
  },
  {
    category_id: "cat_attraction",
    name: "景点",
    icon: "landmark",
    color: "#4d64c8",
    source: "provider_mapping",
    status: "active"
  },
  {
    category_id: "cat_shopping",
    name: "购物",
    icon: "shopping-bag",
    color: "#8f4fc7",
    source: "provider_mapping",
    status: "active"
  },
  {
    category_id: "cat_hotel",
    name: "住宿",
    icon: "bed",
    color: "#3d7f89",
    source: "provider_mapping",
    status: "active"
  },
  {
    category_id: "cat_place",
    name: "地点",
    icon: "map-pin",
    color: "#247b5f",
    source: "system",
    status: "active"
  }
];

export const DEFAULT_PROVIDER_MAPPINGS: WorkspaceProviderCategoryMapping[] = [
  { provider: "amap", typecode_prefix: "05", category_id: "cat_food" },
  { provider: "amap", typecode_prefix: "06", category_id: "cat_shopping" },
  { provider: "amap", typecode_prefix: "10", category_id: "cat_hotel" },
  { provider: "amap", typecode_prefix: "11", category_id: "cat_attraction" }
];

const PLACE_TYPE_TO_CATEGORY: Record<PlaceType, string> = {
  restaurant: "cat_food",
  cafe: "cat_cafe",
  attraction: "cat_attraction",
  mall: "cat_shopping",
  place: "cat_place"
};

export function categoryIdsForProviderFacts(input: { provider_type?: string; provider_typecode?: string; fallback_place_type?: PlaceType }): string[] {
  const providerType = input.provider_type ?? "";
  if (providerType.includes("咖啡")) {
    return ["cat_cafe"];
  }

  const typecode = input.provider_typecode?.trim();
  if (typecode) {
    const mapping = DEFAULT_PROVIDER_MAPPINGS.find((candidate) => typecode.startsWith(candidate.typecode_prefix));
    if (mapping) {
      return [mapping.category_id];
    }
  }

  if (input.fallback_place_type) {
    return [PLACE_TYPE_TO_CATEGORY[input.fallback_place_type]];
  }

  return ["cat_place"];
}
