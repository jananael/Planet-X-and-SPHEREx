import { test } from "node:test";
import assert from "node:assert/strict";
import { bestBand, defaultSelection, groupVisits, observationDates, parseCoordinates, selectDate } from "../lib/observations.ts";
import type { Observation } from "../lib/types.ts";

const obs = (id: string, mjd: number, band = "D3"): Observation => ({ id, mjd, band, target_id: null, obs_time: new Date(mjd * 86400000).toISOString(), wavelength_um: null, release: "QR2", source_file: `${id}.fits`, image_url: `/api/observations/${id}/image` });

test("date choices use actual UTC dates and only the selected detector", () => {
  const a = { ...obs("a", 1), obs_time: "2026-11-13T01:00:00+02:00" };
  const b = { ...obs("b", 2), obs_time: "2026-11-12T22:00:00Z" };
  const c = { ...obs("c", 3), obs_time: "2026-11-15T00:00:00Z" };
  const otherBand = { ...a, id: "other", band: "D1" };
  assert.deepEqual(observationDates([c, a, otherBand, b], "D3").map(({ date, images }) => [date, images.map(o => o.id)]), [
    ["2026-11-12", ["a", "b"]], ["2026-11-15", ["c"]],
  ]);
  assert.deepEqual(observationDates([], "D3"), []);
});

test("selecting a date handles partial selection without duplicates or losing other dates", () => {
  const images = [obs("a", 1), obs("b", 1.1)];
  assert.deepEqual(selectDate(["other-date", "a"], images, true), ["other-date", "a", "b"]);
  assert.deepEqual(selectDate(["other-date", "a", "b"], images, false), ["other-date"]);
});

test("coordinate validation rejects blanks, nonfinite values and out-of-range boundaries", () => {
  assert.deepEqual(parseCoordinates("0", "-90"), { ra: 0, dec: -90 });
  assert.deepEqual(parseCoordinates("359.9", "90"), { ra: 359.9, dec: 90 });
  for (const [ra, dec] of [["", "0"], ["360", "0"], ["-1", "0"], ["NaN", "0"], ["1", ""], ["1", "91"], ["1", "Infinity"]]) assert.throws(() => parseCoordinates(ra, dec));
});

test("visits are chronological, separated only by gaps greater than 30 days", () => {
  const input = [obs("last", 100), obs("second", 40), obs("first", 10), obs("new", 71)];
  assert.deepEqual(groupVisits(input).map(v => v.map(o => o.id)), [["first", "second"], ["new", "last"]]);
  assert.equal(input[0].id, "last", "the input array is not mutated");
});

test("default detector is based on visit coverage rather than exposure count", () => {
  const list = [obs("a", 10, "D1"), obs("b", 11, "D1"), obs("c", 12, "D1"), obs("d", 10), obs("e", 80)];
  assert.equal(bestBand(list), "D3");
  assert.deepEqual(defaultSelection(list, "D3"), ["d", "e"]);
  assert.deepEqual(defaultSelection([], "D3"), []);
});

test("a band seen in only one visit selects all of its exposures so there is something to blink", () => {
  const list = [obs("c", 10.2, "D1"), obs("a", 10.0, "D1"), obs("b", 10.1, "D1"), obs("d", 80)];
  assert.deepEqual(defaultSelection(list, "D1"), ["a", "b", "c"]);
});

test("frames are comparable when their spectral bands overlap, not by a fixed tolerance", async () => {
  const { spectralMismatch, mixedPipelines } = await import("../lib/observations.ts");
  const o = (release: string, processing_version?: string) => ({ obs: { release, processing_version } });
  assert.deepEqual(mixedPipelines([o("DR1", "l2b-v27-2026-228"), o("QR3", "l2b-v27-2026-276")]), []);  // same pipeline: fine
  assert.deepEqual(mixedPipelines([o("DR1", "l2b-v27-2026-228"), o("QR4", "l2b-v28-2027-010")]), ["l2b-v27", "l2b-v28"]);
  assert.deepEqual(mixedPipelines([o("DR1", "l2b_retry-v27-2026-214"), o("QR3", "l2b-v27-2026-276")]), []);  // re-run file, same pipeline
  assert.deepEqual(mixedPipelines([o("QR3"), o("DR1")]), ["DR1", "QR3"]);  // versions unknown: compare releases
  const f = (w: number, b: number | null) => ({ wavelengthUm: w, bandwidthUm: b });
  assert.equal(spectralMismatch([f(1.60, 0.04), f(1.62, 0.04)]), false);   // ranges overlap
  assert.equal(spectralMismatch([f(1.60, 0.02), f(1.66, 0.02)]), true);    // 0.06 apart, narrow bands: no overlap
  assert.equal(spectralMismatch([f(2.00, 0.10), f(2.07, 0.10)]), false);   // 0.07 apart but wide bands overlap
  assert.equal(spectralMismatch([f(1.60, null), f(1.70, null)]), true);    // no bandwidth: 0.05 fallback
  assert.equal(spectralMismatch([f(1.60, 0.04)]), false);                  // a single frame is never a mismatch
});
