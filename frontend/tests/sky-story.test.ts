import { test } from "node:test";
import assert from "node:assert/strict";
import { decRange, duringVisit, isFuture, phaseAt, project, skyCaption, spherexInYear, timeline, yearsOf } from "../lib/sky-story.ts";
import type { JourneyData } from "../lib/journey.ts";

const data = {
  target: { id: "vesta", name: "(4) Vesta", type: "asteroid", fact: "" },
  window: { start: "2025-05-01", end: "2026-10-01" }, bodies: [], sky_track: [], highlight: null, sources: [],
  spherex_exposures: [{ utc: "2026-07-05T01:00:00Z", visit: 2, release: "QR3", ra: 22, dec: 1 },
                      { utc: "2026-07-13T15:57:52Z", visit: 2, release: "QR3", ra: 22.5, dec: 1.3 }],
  spherex_visits: [{ visit: 2, from: "2026-07-05", to: "2026-07-20", exposures: 2, releases: ["QR3"] }],
} as unknown as JourneyData;

test("the path is split by calendar year", () => {
  const years = yearsOf([["2020-12-30", 1, 1], ["2021-01-06", 2, 1], ["2021-06-01", 3, 1]]);
  assert.deepEqual(years.map(y => [y.year, y.points.length]), [[2020, 1], [2021, 2]]);
});

test("timeline: intro, one slot per year, outro", () => {
  const tl = timeline(11);
  assert.equal(phaseAt(1, tl, 11).kind, "intro");
  const mid = phaseAt(tl.intro + tl.perYear * 6.5, tl, 11);
  assert.equal(mid.kind, "year"); assert.equal(mid.index, 6); assert.ok(Math.abs(mid.progress - 0.5) < 1e-9);
  assert.equal(phaseAt(tl.total, tl, 11).kind, "outro");
});

test("SPHEREx is only mentioned once the path reaches the real exposure dates", () => {
  const year = { kind: "year" } as const;
  assert.doesNotMatch(skyCaption(data, year, 2026, "Capricornus", "2026-02-01", "2026-11-14"), /SPHEREx/);   // before the visit
  assert.match(skyCaption(data, year, 2026, "Cetus", "2026-07-14", "2026-11-14"), /in front of the stars of Cetus, and right now NASA's SPHEREx telescope is photographing it \(2 real pictures so far/);
  assert.match(skyCaption(data, year, 2026, "Cetus", "2026-09-01", "2026-11-14"), /SPHEREx took 2 real pictures of it earlier this year/);
  assert.match(skyCaption(data, year, 2021, "Leo", "2021-05-01", "2026-11-14"), /Calculated path: SPHEREx was not observing yet/);
  assert.equal(spherexInYear(data, 2026, "2026-07-06"), 1);
  assert.equal(duringVisit(data, "2026-07-10"), true);
  assert.equal(duringVisit(data, "2026-08-10"), false);
});

test("projection puts east (larger RA) to the left and keeps the path in view", () => {
  const [xEast] = project(30, 0, 960, 440, -30, 30, 0), [xWest] = project(-30 + 360, 0, 960, 440, -30, 30, 0);
  assert.ok(xEast < xWest);
  const [lo, hi] = decRange([["2020-01-01", 0, -20], ["2021-01-01", 0, 25]]);
  assert.ok(lo <= -20 && hi >= 25 && hi - lo >= 60);
});

test("after today the caption says prediction, never an observation", () => {
  const year = { kind: "year" } as const;
  const future = skyCaption(data, year, 2028, "Virgo", "2028-03-01", "2026-11-14");
  assert.match(future, /^2028 \(prediction\): \(4\) Vesta will travel in front of the stars of Virgo\. Nobody has photographed this yet/);
  assert.doesNotMatch(future, /SPHEREx/);
  assert.doesNotMatch(skyCaption(data, year, 2026, "Cetus", "2026-07-14", "2026-11-14"), /prediction/);  // the past stays the past
  assert.equal(isFuture("2026-11-15", "2026-11-14"), true);
  assert.equal(isFuture("2026-11-14", "2026-11-14"), false);
});
