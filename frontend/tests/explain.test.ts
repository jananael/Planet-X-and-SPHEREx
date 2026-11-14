import { test } from "node:test";
import assert from "node:assert/strict";
import { buildScenes, explainUrl, formatDuration, type ExplainFacts } from "../lib/explain.ts";

const frame = (id: string, x: number | null, y: number | null, t = "2026-07-13T15:57:52Z") =>
  ({ observation_id: id, obs_time: t, band: "D2", release: "QR3", x, y, inside: x !== null });

const vesta: ExplainFacts = {
  kind: "moves",
  object: { id: "vesta", name: "(4) Vesta", type: "asteroid", description: "", validation_status: "verified", position_source: "JPL Horizons (geocentric)" },
  frames: [frame("a", 0.63, 0.52), frame("b", 0.36, 0.47, "2026-07-13T19:07:09Z")],
  image_size_arcsec: 448.95, pixel_scale_arcsec: 6.15, elapsed_hours: 3.155,
  displacement_arcsec: 123.55, displacement_pixels: 20.09, direction: "east", notes: ["n"], is_mock: false,
};

test("durations read naturally", () => {
  assert.equal(formatDuration(0.5), "30 minutes");
  assert.equal(formatDuration(3.155), "3.2 hours");
  assert.equal(formatDuration(24 * 20), "20 days");
  assert.equal(formatDuration(24 * 182), "6 months");
});

test("a moving object: numbers come from the facts, circle and trail on the later frame", () => {
  const scenes = buildScenes(vesta);
  const text = scenes.map(s => s.caption).join(" ");
  assert.match(text, /3\.2 hours later, \(4\) Vesta has moved towards the east by about 20 pixels \(124 arcseconds\)/);
  assert.match(text, /not a discovery/);
  const motion = scenes.find(s => s.caption.includes("has moved"))!;
  assert.equal(motion.frame, 1); assert.ok(motion.circle && motion.trail);
  assert.ok(scenes.every(s => s.frame >= 0 && s.frame < vesta.frames.length));
});

test("no known object: no circle, no invented object or motion", () => {
  const facts: ExplainFacts = { ...vesta, kind: "no_known_object", object: null, displacement_arcsec: null,
    displacement_pixels: null, direction: null, frames: [frame("a", null, null), frame("b", null, null)] };
  const scenes = buildScenes(facts);
  assert.ok(scenes.every(s => !s.circle));
  assert.doesNotMatch(scenes.map(s => s.caption).join(" "), /Vesta|moved|pixels/);
});

test("a variable star is told as a brightness change, a slow star as a creep", () => {
  const mira: ExplainFacts = { ...vesta, kind: "brightness", displacement_arcsec: 0, displacement_pixels: 0, direction: null,
    object: { ...vesta.object!, name: "Mira", type: "variable" }, elapsed_hours: 24 * 182 };
  assert.match(buildScenes(mira).map(s => s.caption).join(" "), /6 months later, it is in the same place.*brightness has changed/);
  const barnard: ExplainFacts = { ...vesta, kind: "creeps", displacement_arcsec: 10.3, displacement_pixels: 1.67, direction: "north",
    object: { ...vesta.object!, name: "Barnard's Star", type: "star" }, elapsed_hours: 24 * 365 };
  assert.match(buildScenes(barnard).map(s => s.caption).join(" "), /crept north by only about 1\.7 pixels/);
});

test("explain URL carries the frames shown", () => {
  assert.equal(explainUrl(22.5, 1.36, 450, ["a", "b"]), "/api/explain?ra=22.5&dec=1.36&size=450&ids=a%2Cb");
});
