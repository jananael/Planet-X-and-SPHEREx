import { test } from "node:test";
import assert from "node:assert/strict";
import { bestBand, defaultSelection, groupVisits, parseCoordinates } from "../lib/observations.ts";
import type { Observation } from "../lib/types.ts";

const obs = (id: string, mjd: number, band = "D3"): Observation => ({ id, mjd, band, target_id: null, obs_time: new Date(mjd * 86400000).toISOString(), wavelength_um: null, release: "QR2", source_file: `${id}.fits`, image_url: `/api/observations/${id}/image` });

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
  assert.deepEqual(defaultSelection(list, "D1"), ["a"]);
  assert.deepEqual(defaultSelection([], "D3"), []);
});
