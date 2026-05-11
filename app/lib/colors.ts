import type { MapPoint } from "../../src/shared/schema";

export function colorForPlace(point: MapPoint): string {
  if (point.place_color) {
    return point.place_color;
  }

  const colors = ["#d84f3a", "#247b5f", "#4d64c8", "#8a5a32", "#8f4fc7", "#cc7a1f", "#3d7f89", "#b9486a"];
  let hash = 0;
  for (const char of point.place_name) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return colors[hash % colors.length];
}
