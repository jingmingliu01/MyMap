import type { MapPoint } from "../../src/shared/schema";
import { colorForPlace } from "../lib/colors";

export function markerHtml(point: MapPoint, activePlaceId: string | null): string {
  const title = markerTitle(point);
  const placeId = point.place_id;
  const isActive = !activePlaceId || activePlaceId === placeId;
  const classes = ["map-marker", activePlaceId && isActive ? "active" : "", !isActive ? "inactive" : ""].filter(Boolean).join(" ");
  return `<div class="${classes}" data-place="${escapeHtml(placeId)}" style="--marker-color: ${escapeHtml(colorForPlace(point))}" aria-label="${escapeHtml(title)}"><span class="map-marker-label">${escapeHtml(point.label)}</span><span class="map-marker-tooltip">${escapeHtml(title)}</span></div>`;
}

export function markerTitle(point: MapPoint): string {
  const branchName = point.branch_name.trim();
  if (!branchName) {
    return point.place_name;
  }

  const normalizedPlace = normalizeName(point.place_name);
  const normalizedBranch = normalizeName(branchName);
  if (normalizedBranch === normalizedPlace || normalizedBranch.includes(normalizedPlace)) {
    return branchName;
  }

  return `${point.place_name} ${branchName}`;
}

function normalizeName(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
