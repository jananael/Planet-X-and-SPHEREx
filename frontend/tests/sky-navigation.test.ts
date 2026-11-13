import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { angularDistance, normalizeSkyPoint, readBookmarks, sameSkyPoint, skyRegion } from "../lib/sky-navigation.ts";

test("atlas coordinates normalize RA, preserve valid Dec, and reject invalid projections", () => {
  assert.deepEqual(normalizeSkyPoint({ ra: -1, dec: -90 }), { ra: 359, dec: -90 });
  assert.deepEqual(normalizeSkyPoint({ ra: 720, dec: 90 }), { ra: 0, dec: 90 });
  for (const point of [{ ra: NaN, dec: 0 }, { ra: 10, dec: 91 }, { ra: Infinity, dec: 0 }]) assert.throws(() => normalizeSkyPoint(point));
  assert.ok(sameSkyPoint({ ra: 359.99999, dec: 20 }, { ra: 0, dec: 20 }));
  assert.ok(Math.abs(angularDistance({ ra: 0, dec: 0 }, { ra: 90, dec: 0 }) - 90) < 1e-8);
});

test("bookmarks survive serialization, deduplicate positions, and reject corrupted data", () => {
  const item = { id: "a", kind: "bookmark", name: "My sky", ra: 360, dec: 0, createdAt: "2026-11-13T00:00:00Z" };
  const stored = JSON.stringify({ version: 1, locations: [item, { ...item, id: "b", ra: 0 }, { ...item, id: "c", dec: 120 }, { ...item, kind: "discovery" }] });
  const saved = readBookmarks(stored);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].ra, 0);
  assert.equal(saved[0].kind, "bookmark");
  assert.deepEqual(readBookmarks(JSON.stringify({ version: 1, locations: saved })), saved);
  assert.deepEqual(readBookmarks("broken"), []);
  assert.deepEqual(readBookmarks(null), []);
});

test("catalog region lookup handles known fields, RA wrap and both polar regions", () => {
  const folder = new URL("../public/skytrace/catalogs/", import.meta.url);
  const bounds = JSON.parse(readFileSync(new URL("constellations.bounds.json", folder), "utf8")).features;
  const catalog = JSON.parse(readFileSync(new URL("constellations.json", folder), "utf8")).features;
  const names = Object.fromEntries(catalog.map((f: { id: string; properties: { name: string } }) => [f.id, f.properties.name]));
  assert.equal(skyRegion({ ra: 10.6847, dec: 41.269 }, bounds, names), "Andromeda");
  assert.equal(skyRegion({ ra: 83.8221, dec: -5.3911 }, bounds, names), "Orion");
  assert.equal(skyRegion({ ra: 56.75, dec: 24.1167 }, bounds, names), "Taurus");
  assert.equal(skyRegion({ ra: 0, dec: 89.9 }, bounds, names), "Ursa Minor");
  assert.equal(skyRegion({ ra: 0, dec: -89.9 }, bounds, names), "Octans");
  assert.equal(skyRegion({ ra: 0, dec: 0 }, bounds, names), skyRegion({ ra: 360, dec: 0 }, bounds, names));
  assert.equal(skyRegion({ ra: 0, dec: 0 }, [], {}), null);
});
