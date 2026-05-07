import type { CSSProperties } from "react";
import type { MapRoute } from "../../src/shared/schema";

type ChipStyle = CSSProperties & {
  "--chip-color"?: string;
};

export function RouteFilter({
  routes,
  activeRouteId,
  onSelect
}: {
  routes: MapRoute[];
  activeRouteId: string | null;
  onSelect: (routeId: string | null) => void;
}) {
  if (routes.length === 0) {
    return null;
  }

  return (
    <div className="route-filter" aria-label="路线筛选">
      <button className={`route-chip ${activeRouteId ? "" : "active"}`} type="button" aria-pressed={!activeRouteId} onClick={() => onSelect(null)}>
        <span className="route-chip-line all" />
        <span className="route-chip-label">全部路线</span>
        <span className="route-chip-count">{routes.length}</span>
      </button>
      {routes.map((route) => {
        const isActive = activeRouteId === route.id;
        return (
          <button
            className={`route-chip ${isActive ? "active" : ""}`}
            type="button"
            aria-pressed={isActive}
            style={{ "--chip-color": route.color } as ChipStyle}
            key={route.id}
            onClick={() => onSelect(isActive ? null : route.id)}
          >
            <span className="route-chip-line" />
            <span className="route-chip-label">{route.name}</span>
            <span className="route-chip-count">{route.point_ids.length}</span>
          </button>
        );
      })}
    </div>
  );
}
