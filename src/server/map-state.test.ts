import assert from "node:assert/strict";
import test from "node:test";
import type { MapPointsFile, MapRoutesFile } from "../shared/schema";
import { sanitizeRoutes } from "./map-state";

function baseMapState(): MapPointsFile {
  return {
    city: "广州",
    coordinate_system: "GCJ-02",
    map_provider: "amap",
    points: [
      {
        id: "heweidian-1",
        branch_stable_id: "heweidian-1",
        place_id: "place-heweidian",
        place_name: "禾味点",
        place_type: "restaurant",
        place_color: "#247b5f",
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
        branch_stable_id: "heweidian-2",
        place_id: "place-heweidian",
        place_name: "禾味点",
        place_type: "restaurant",
        place_color: "#247b5f",
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
        branch_stable_id: "heweidian-3",
        place_id: "place-heweidian",
        place_name: "禾味点",
        place_type: "restaurant",
        place_color: "#247b5f",
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
        branch_stable_id: "taikoo-1",
        place_id: "place-taikoo",
        place_name: "太古汇",
        place_type: "mall",
        place_color: "#d84f3a",
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
