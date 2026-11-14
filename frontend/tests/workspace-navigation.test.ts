import { test } from "node:test";
import assert from "node:assert/strict";
import { locationKey, workspaceHref } from "../lib/workspace-navigation.ts";
import { parseCoordinates } from "../lib/observations.ts";

test("workspace links preserve zero coordinates, date filters, band and target across all routes", () => {
  for (const path of ["/explore", "/observations", "/machine-learning"]) {
    const url = new URL(workspaceHref(path, { ra: 180, dec: 0 }, { start: "2025-01-01", end: "2026-01-01", band: "D3" }, "target with spaces"), "http://localhost");
    assert.equal(url.pathname, path);
    assert.deepEqual(parseCoordinates(url.searchParams.get("ra")!, url.searchParams.get("dec")!), { ra: 180, dec: 0 });
    assert.equal(url.searchParams.get("start"), "2025-01-01");
    assert.equal(url.searchParams.get("end"), "2026-01-01");
    assert.equal(url.searchParams.get("band"), "D3");
    assert.equal(url.searchParams.get("target"), "target with spaces");
  }
});

test("direct navigation without a location never manufactures coordinates", () => {
  assert.equal(workspaceHref("/observations", null), "/observations");
  assert.equal(workspaceHref("/machine-learning", null), "/machine-learning");
});

test("search identity ignores route changes but invalidates coordinates or query filters", () => {
  const point = { ra: 180, dec: 0 };
  assert.equal(locationKey(point, {}), locationKey(point, { start: null, end: null, band: null }));
  assert.notEqual(locationKey(point, {}), locationKey({ ra: 181, dec: 0 }, {}));
  assert.notEqual(locationKey(point, {}), locationKey(point, { start: "2026-01-01" }));
  assert.notEqual(locationKey(point, {}), locationKey(point, { band: "D4" }));
});
