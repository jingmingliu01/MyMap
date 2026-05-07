import assert from "node:assert/strict";
import test from "node:test";
import type { MapPointsFile, MapRoutesFile } from "../shared/schema";
import { normalizeAppliedMapState, sanitizeRoutes } from "./map-state";

function baseMapState(): MapPointsFile {
  return {
    city: "广州",
    coordinate_system: "GCJ-02",
    map_provider: "amap",
    points: [
      {
        id: "heweidian-1",
        group_name: "禾味点",
        group_type: "restaurant",
        group_color: "#247b5f",
        branch_id: 1,
        branch_name: "禾味点 A",
        label: "1",
        address: "A",
        district: "天河区",
        longitude: 113.1,
        latitude: 23.1,
        visible: true
      },
      {
        id: "heweidian-2",
        group_name: "禾味点",
        group_type: "restaurant",
        group_color: "#247b5f",
        branch_id: 2,
        branch_name: "禾味点 B",
        label: "2",
        address: "B",
        district: "天河区",
        longitude: 113.2,
        latitude: 23.2,
        visible: false
      },
      {
        id: "heweidian-3",
        group_name: "禾味点",
        group_type: "restaurant",
        group_color: "#247b5f",
        branch_id: 3,
        branch_name: "禾味点 C",
        label: "3",
        address: "C",
        district: "天河区",
        longitude: 113.3,
        latitude: 23.3,
        visible: true
      },
      {
        id: "taikoo-1",
        group_name: "太古汇",
        group_type: "mall",
        group_color: "#d84f3a",
        branch_id: 1,
        branch_name: "太古汇",
        label: "1",
        address: "D",
        district: "天河区",
        longitude: 113.4,
        latitude: 23.4,
        visible: true
      }
    ]
  };
}

test("normalizeAppliedMapState drops hidden points and renumbers remaining points per group", () => {
  const routes: MapRoutesFile = {
    routes: [
      {
        id: "food-route",
        name: "Food route",
        color: "#1f6f8b",
        point_ids: ["heweidian-1", "heweidian-2", "heweidian-3", "taikoo-1"]
      }
    ]
  };

  const normalized = normalizeAppliedMapState(baseMapState(), routes);

  assert.deepEqual(
    normalized.mapState.points.map((point) => [point.id, point.branch_id, point.label]),
    [
      ["place-79be-5473-70b9-1", 1, "1"],
      ["place-79be-5473-70b9-2", 2, "2"],
      ["place-592a-53e4-6c47-1", 1, "1"]
    ]
  );
  assert.deepEqual(normalized.routes.routes[0]?.point_ids, ["place-79be-5473-70b9-1", "place-79be-5473-70b9-2", "place-592a-53e4-6c47-1"]);
});

test("normalizeAppliedMapState removes routes with fewer than two valid visible points", () => {
  const routes: MapRoutesFile = {
    routes: [
      {
        id: "stale-route",
        name: "Stale route",
        color: "#1f6f8b",
        point_ids: ["heweidian-2", "missing-point"]
      }
    ]
  };

  assert.deepEqual(normalizeAppliedMapState(baseMapState(), routes).routes.routes, []);
});

test("sanitizeRoutes keeps only visible point ids and removes duplicate stops", () => {
  const sanitized = sanitizeRoutes(
    [
      {
        id: "route",
        name: "Route",
        color: "#1f6f8b",
        point_ids: ["heweidian-1", "heweidian-1", "heweidian-2", "taikoo-1"]
      }
    ],
    baseMapState()
  );

  assert.deepEqual(sanitized.routes[0]?.point_ids, ["heweidian-1", "taikoo-1"]);
});
