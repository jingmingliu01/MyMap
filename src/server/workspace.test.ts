import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceState } from "./workspace";
import { applyOperations, renderWorkspace } from "./workspace";

test("AI point-preview operation archives only the requested branch and render output renumbers the place", () => {
  const next = applyOperations(baseWorkspace(), [{ type: "archive_branch", branch_id: "branch-heweidian-a" }]);
  const rendered = renderWorkspace(next);

  assert.equal(next.branches.branches.find((branch) => branch.branch_id === "branch-heweidian-a")?.status, "archived");
  assert.equal(next.branches.branches.find((branch) => branch.branch_id === "branch-taikoo")?.status, "active");
  assert.deepEqual(
    rendered.mapPoints.points.map((point) => [point.id, point.place_name, point.branch_id, point.label]),
    [
      ["branch-heweidian-b", "禾味点", 1, "1"],
      ["branch-taikoo", "太古汇", 1, "1"]
    ]
  );
});

test("AI route-preview operation replaces active routes without touching places or branches", () => {
  const next = applyOperations(baseWorkspace(), [
    {
      type: "replace_routes",
      routes: [
        {
          route_id: "route-food",
          name: "晚餐路线",
          color: "#1f6f8b",
          branch_ids: ["branch-heweidian-a", "branch-taikoo"],
          status: "active",
          created_at: "2026-05-11T00:00:00.000Z",
          updated_at: "2026-05-11T00:00:00.000Z"
        }
      ]
    }
  ]);
  const rendered = renderWorkspace(next);

  assert.equal(next.places.places.every((place) => place.status === "active"), true);
  assert.equal(next.branches.branches.every((branch) => branch.status === "active"), true);
  assert.deepEqual(rendered.routes.routes[0]?.point_ids, ["branch-heweidian-a", "branch-taikoo"]);
});

function baseWorkspace(): WorkspaceState {
  const now = "2026-05-11T00:00:00.000Z";
  return {
    places: {
      places: [
        { place_id: "place-heweidian", name: "禾味点", status: "active", created_at: now, updated_at: now },
        { place_id: "place-taikoo", name: "太古汇", status: "active", created_at: now, updated_at: now }
      ]
    },
    branches: {
      branches: [
        {
          branch_id: "branch-heweidian-a",
          place_id: "place-heweidian",
          name: "禾味点 A",
          city: "广州",
          address: "A",
          district: "天河区",
          longitude: 113.1,
          latitude: 23.1,
          coordinate_system: "GCJ-02",
          provider: "amap",
          category_ids: ["cat_food"],
          status: "active",
          created_at: now,
          updated_at: now
        },
        {
          branch_id: "branch-heweidian-b",
          place_id: "place-heweidian",
          name: "禾味点 B",
          city: "广州",
          address: "B",
          district: "天河区",
          longitude: 113.2,
          latitude: 23.2,
          coordinate_system: "GCJ-02",
          provider: "amap",
          category_ids: ["cat_food"],
          status: "active",
          created_at: now,
          updated_at: now
        },
        {
          branch_id: "branch-taikoo",
          place_id: "place-taikoo",
          name: "太古汇",
          city: "广州",
          address: "C",
          district: "天河区",
          longitude: 113.3,
          latitude: 23.3,
          coordinate_system: "GCJ-02",
          provider: "amap",
          category_ids: ["cat_shopping"],
          status: "active",
          created_at: now,
          updated_at: now
        }
      ]
    },
    categories: {
      categories: [
        { category_id: "cat_food", name: "餐饮", icon: "utensils", color: "#d84f3a", source: "provider_mapping", status: "active" },
        { category_id: "cat_shopping", name: "购物", icon: "shopping-bag", color: "#8f4fc7", source: "provider_mapping", status: "active" }
      ],
      provider_mappings: []
    },
    tags: { tags: [] },
    tagAssignments: { assignments: [] },
    routes: { routes: [] },
    imports: { imports: [] }
  };
}
