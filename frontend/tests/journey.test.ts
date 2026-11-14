import { test } from "node:test";
import assert from "node:assert/strict";
import { caption, dateAt, positionAt, sceneAt, TOTAL_SECONDS, unwrapRa, visitAt, type JourneyData } from "../lib/journey.ts";

const data: JourneyData = {
  target: { id: "vesta", name: "(4) Vesta", type: "asteroid", fact: "Main-belt asteroid." },
  window: { start: "2025-05-01", end: "2026-10-01" },
  bodies: [{ name: "(4) Vesta", kind: "object", orbit: [], track: [["2025-05-01", 0, 0], ["2025-05-11", 10, -10]] }],
  sky_track: [["2025-05-01", 350, 1], ["2025-05-04", 5, 2]],
  spherex_exposures: [],
  spherex_visits: [{ visit: 1, from: "2025-06-21", to: "2025-08-17", exposures: 88, releases: ["DR1"] }],
  highlight: null, sources: [],
};

test("scenes follow each other and cover the whole video", () => {
  assert.equal(sceneAt(0).name, "orbit");
  assert.equal(sceneAt(14.1).name, "sky");
  assert.equal(sceneAt(22.5).name, "images");
  assert.equal(sceneAt(TOTAL_SECONDS).name, "end");
  assert.equal(sceneAt(TOTAL_SECONDS).progress, 1);
});

test("dates and positions are interpolated from the real samples, never extrapolated", () => {
  assert.equal(dateAt(data, 0), "2025-05-01");
  assert.equal(dateAt(data, 1), "2026-10-01");
  assert.deepEqual(positionAt(data.bodies[0].track, "2025-05-06"), [5, -5]);
  assert.deepEqual(positionAt(data.bodies[0].track, "2030-01-01"), [10, -10]);   // clamped to the last sample
  assert.equal(positionAt([], "2025-05-06"), null);
});

test("a path crossing RA 0/360 stays one continuous line", () => {
  assert.deepEqual(unwrapRa(data.sky_track).map(s => s[1]), [350, 365]);
});

test("captions only use numbers from the data", () => {
  assert.equal(visitAt(data, "2025-07-01")?.visit, 1);
  assert.equal(visitAt(data, "2025-09-01"), null);
  assert.match(caption(data, "orbit", "2025-07-01"), /visit 1, 88 exposures, DR1/);
  assert.match(caption(data, "images", "2026-10-01", { hours: 3.155, arcsec: 123.55, pixels: 20.09, direction: "east" }),
    /3\.2 hours apart: \(4\) Vesta moved 124 arcseconds to the east \(about 20 pixels\)/);
  assert.match(caption(data, "end", "2026-10-01"), /not a discovery/);
});
