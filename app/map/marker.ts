import type { MapPoint } from "../../src/shared/schema";
import { colorForGroup } from "../lib/colors";

export function markerHtml(point: MapPoint, activeGroup: string | null): string {
  const title = markerTitle(point);
  const isActive = !activeGroup || activeGroup === point.group_name;
  const classes = ["map-marker", activeGroup && isActive ? "active" : "", !isActive ? "inactive" : ""].filter(Boolean).join(" ");
  return `<div class="${classes}" data-group="${escapeHtml(point.group_name)}" style="--marker-color: ${escapeHtml(colorForGroup(point))}" aria-label="${escapeHtml(title)}"><span class="map-marker-label">${escapeHtml(point.label)}</span><span class="map-marker-tooltip">${escapeHtml(title)}</span></div>`;
}

export function markerTitle(point: MapPoint): string {
  const branchName = point.branch_name.trim();
  if (!branchName) {
    return point.group_name;
  }

  const normalizedGroup = normalizeName(point.group_name);
  const normalizedBranch = normalizeName(branchName);
  if (normalizedBranch === normalizedGroup || normalizedBranch.includes(normalizedGroup)) {
    return branchName;
  }

  return `${point.group_name} ${branchName}`;
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
