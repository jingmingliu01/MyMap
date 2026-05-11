import { useMemo, type CSSProperties } from "react";
import type { MapPoint } from "../../src/shared/schema";
import { colorForPlace } from "../lib/colors";

type ChipStyle = CSSProperties & {
  "--chip-color"?: string;
};

interface FilterChip {
  id: string;
  name: string;
  color: string;
  count: number;
}

export function CategoryFilter({
  points,
  activeCategoryId,
  onSelect
}: {
  points: MapPoint[];
  activeCategoryId: string | null;
  onSelect: (categoryId: string | null) => void;
}) {
  const categories = useMemo(() => {
    const byCategory = new Map<string, FilterChip>();
    for (const point of points) {
      for (const [index, categoryId] of (point.category_ids ?? ["cat_place"]).entries()) {
        const current = byCategory.get(categoryId);
        if (current) {
          current.count += 1;
        } else {
          byCategory.set(categoryId, {
            id: categoryId,
            name: point.category_names?.[index] ?? categoryId,
            color: categoryColor(categoryId),
            count: 1
          });
        }
      }
    }
    return Array.from(byCategory.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [points]);

  return (
    <nav className="filter-row category-filter" aria-label="地图类别筛选">
      <button className={`filter-chip ${activeCategoryId ? "" : "active"}`} type="button" aria-pressed={!activeCategoryId} onClick={() => onSelect(null)}>
        <span className="filter-chip-dot all" />
        <span className="filter-chip-label">全部地点</span>
        <span className="filter-chip-count">{points.length}</span>
      </button>
      {categories.map((category) => {
        const isActive = activeCategoryId === category.id;
        return (
          <button
            className={`filter-chip ${isActive ? "active" : ""}`}
            type="button"
            aria-pressed={isActive}
            style={{ "--chip-color": category.color } as ChipStyle}
            key={category.id}
            onClick={() => onSelect(isActive ? null : category.id)}
          >
            <span className="filter-chip-dot" />
            <span className="filter-chip-label">{category.name}</span>
            <span className="filter-chip-count">{category.count}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function TagFilter({
  points,
  routes,
  activeTagId,
  onSelect
}: {
  points: MapPoint[];
  routes: Array<{ tag_ids?: string[]; tag_names?: string[] }>;
  activeTagId: string | null;
  onSelect: (tagId: string | null) => void;
}) {
  const tags = useMemo(() => {
    const byTag = new Map<string, FilterChip>();
    for (const point of points) {
      for (const [index, tagId] of (point.tag_ids ?? []).entries()) {
        addTag(byTag, tagId, point.tag_names?.[index] ?? tagId);
      }
    }
    for (const route of routes) {
      for (const [index, tagId] of (route.tag_ids ?? []).entries()) {
        addTag(byTag, tagId, route.tag_names?.[index] ?? tagId);
      }
    }
    return Array.from(byTag.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [points, routes]);

  if (tags.length === 0) {
    return null;
  }

  return (
    <nav className="filter-row tag-filter" aria-label="地图标签筛选">
      {tags.map((tag) => {
        const isActive = activeTagId === tag.id;
        return (
          <button
            className={`filter-chip ${isActive ? "active" : ""}`}
            type="button"
            aria-pressed={isActive}
            style={{ "--chip-color": tag.color } as ChipStyle}
            key={tag.id}
            onClick={() => onSelect(isActive ? null : tag.id)}
          >
            <span className="filter-chip-dot" />
            <span className="filter-chip-label">{tag.name}</span>
            <span className="filter-chip-count">{tag.count}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function PlaceFilter({
  points,
  activePlaceId,
  collapsed,
  onToggleCollapsed,
  onSelect
}: {
  points: MapPoint[];
  activePlaceId: string | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSelect: (placeId: string | null) => void;
}) {
  const places = useMemo(() => {
    const byPlace = new Map<string, FilterChip>();
    for (const point of points) {
      const id = point.place_id;
      const current = byPlace.get(id);
      if (current) {
        current.count += 1;
      } else {
        byPlace.set(id, {
          id,
          name: point.place_name,
          color: colorForPlace(point),
          count: 1
        });
      }
    }
    return Array.from(byPlace.values());
  }, [points]);

  if (places.length === 0) {
    return null;
  }

  return (
    <nav className={`filter-row place-filter ${collapsed ? "collapsed" : ""}`} aria-label="地图地点筛选">
      <button className="filter-chip utility" type="button" aria-pressed={!collapsed} onClick={onToggleCollapsed}>
        <span className="filter-chip-label">{collapsed ? "展开地点" : "折叠地点"}</span>
        <span className="filter-chip-count">{places.length}</span>
      </button>
      {!collapsed &&
        places.map((place) => {
          const isActive = activePlaceId === place.id;
          return (
            <button
              className={`filter-chip ${isActive ? "active" : ""}`}
              type="button"
              aria-pressed={isActive}
              style={{ "--chip-color": place.color } as ChipStyle}
              key={place.id}
              onClick={() => onSelect(isActive ? null : place.id)}
            >
              <span className="filter-chip-dot" />
              <span className="filter-chip-label">{place.name}</span>
              <span className="filter-chip-count">{place.count}</span>
            </button>
          );
        })}
    </nav>
  );
}

function addTag(byTag: Map<string, FilterChip>, tagId: string, tagName: string) {
  const current = byTag.get(tagId);
  if (current) {
    current.count += 1;
  } else {
    byTag.set(tagId, {
      id: tagId,
      name: tagName,
      color: categoryColor(tagId),
      count: 1
    });
  }
}

function categoryColor(id: string): string {
  const colors: Record<string, string> = {
    cat_food: "#d84f3a",
    cat_cafe: "#8a5a32",
    cat_attraction: "#4d64c8",
    cat_shopping: "#8f4fc7",
    cat_hotel: "#3d7f89",
    cat_place: "#247b5f"
  };
  return colors[id] ?? "#5f6775";
}
