import type { MapPoint } from "../../src/shared/schema";

export function colorForGroup(point: MapPoint): string {
  if (point.group_color) {
    return point.group_color;
  }

  const colors = ["#d84f3a", "#247b5f", "#4d64c8", "#8a5a32", "#8f4fc7", "#cc7a1f", "#3d7f89", "#b9486a"];
  let hash = 0;
  for (const char of point.group_name) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return colors[hash % colors.length];
}
