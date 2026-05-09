import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import { fireEvent, render, cleanup } from "@testing-library/react";
import { JSDOM } from "jsdom";
import type { MapPoint, MapRoute } from "../../src/shared/schema";
import { GroupFilter } from "./GroupFilter";
import { RouteFilter } from "./RouteFilter";

before(() => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  globalThis.window = dom.window as unknown as Window & typeof globalThis;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Node = dom.window.Node;
  Object.defineProperty(globalThis, "navigator", {
    value: dom.window.navigator,
    configurable: true
  });
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  cleanup();
});

test("GroupFilter renders visible group counts and toggles selection", () => {
  const selections: Array<string | null> = [];
  const view = render(<GroupFilter points={points} activeGroup={null} onSelect={(groupName) => selections.push(groupName)} />);

  assert.equal(view.getByRole("button", { name: /全部地点/ }).getAttribute("aria-pressed"), "true");
  assert.match(view.getByRole("button", { name: /禾味点/ }).textContent ?? "", /2/);
  assert.match(view.getByRole("button", { name: /太古汇/ }).textContent ?? "", /1/);

  fireEvent.click(view.getByRole("button", { name: /禾味点/ }));

  assert.deepEqual(selections, ["禾味点"]);
});

test("GroupFilter clears the active group when the active chip is clicked again", () => {
  const selections: Array<string | null> = [];
  const view = render(<GroupFilter points={points} activeGroup="禾味点" onSelect={(groupName) => selections.push(groupName)} />);

  assert.equal(view.getByRole("button", { name: /禾味点/ }).getAttribute("aria-pressed"), "true");

  fireEvent.click(view.getByRole("button", { name: /禾味点/ }));

  assert.deepEqual(selections, [null]);
});

test("RouteFilter renders route counts and emits selection changes", () => {
  const selections: Array<string | null> = [];
  const view = render(<RouteFilter routes={routes} activeRouteId={null} onSelect={(routeId) => selections.push(routeId)} />);

  assert.equal(view.getByRole("button", { name: /全部路线/ }).getAttribute("aria-pressed"), "true");
  assert.match(view.getByRole("button", { name: /海心桥/ }).textContent ?? "", /2/);

  fireEvent.click(view.getByRole("button", { name: /海心桥/ }));

  assert.deepEqual(selections, ["route-1"]);
});

const points: MapPoint[] = [
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
    address: "C",
    district: "天河区",
    longitude: 113.3,
    latitude: 23.3,
    visible: true
  }
];

const routes: MapRoute[] = [
  {
    id: "route-1",
    name: "海心桥 → 太古汇",
    color: "#1f6f8b",
    point_ids: ["heweidian-1", "taikoo-1"]
  }
];
