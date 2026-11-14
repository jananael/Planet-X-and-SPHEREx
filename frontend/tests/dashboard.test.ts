import { test } from "node:test";
import assert from "node:assert/strict";
import { bandShares, candidateSummary, latest, monthlyHistogram, overview, wavelengthCoverage } from "../lib/dashboard.ts";
import type { Observation } from "../lib/types.ts";

const obs = (id: string, iso: string, band: string, extra: Partial<Observation> = {}): Observation => ({
  id, mjd: Date.parse(iso) / 864e5 + 40587, band, target_id: null, obs_time: iso, wavelength_um: null,
  release: "DR1", source_file: `${id}.fits`, image_url: "", processing_version: "l2b-v27-2026-217", ...extra,
});
const list = [
  obs("a", "2025-07-15T10:00:00Z", "D1", { wavelength_range_um: [0.75, 1.09] }),
  obs("b", "2025-07-16T10:00:00Z", "D4"),
  obs("c", "2025-09-02T10:00:00Z", "D4", { release: "QR3", processing_version: "l2b_retry-v27-2026-276" }),
  obs("d", "2026-01-03T10:00:00Z", "D6"),
];

test("overview counts real search results", () => {
  const o = overview(list);
  assert.deepEqual([o.images, o.visits, o.dates, o.bands], [4, 3, 4, 3]);
  assert.deepEqual(o.releases, ["DR1", "QR3"]);
  assert.deepEqual(o.pipelines, ["v27"]);
  assert.equal(o.spanDays, 172);
  assert.equal(overview([]).first, null);
});

test("band shares follow wavelength order and add up to one", () => {
  const s = bandShares(list);
  assert.deepEqual(s.map(x => [x.band, x.count]), [["D1", 1], ["D4", 2], ["D6", 1]]);
  assert.ok(Math.abs(s.reduce((t, x) => t + x.share, 0) - 1) < 1e-9);
});

test("wavelength coverage uses reported ranges, else the detector range", () => {
  const c = wavelengthCoverage(list);
  assert.deepEqual(c.map(x => [x.band, x.fromUm, x.toUm, x.images]), [["D1", 0.75, 1.09, 1], ["D4", 2.42, 3.82, 2], ["D6", 4.42, 5.0, 1]]);
});

test("monthly histogram includes empty months between visits", () => {
  const h = monthlyHistogram(list);
  assert.deepEqual(h.map(b => b.month), ["2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01"]);
  assert.deepEqual(h[0].counts, { D1: 1, D4: 1 });
  assert.equal(h[1].total, 0);
  assert.deepEqual(latest(list, 2).map(o => o.id), ["d", "c"]);
});

test("candidate summary: types, SNR bins, known matches and flags", () => {
  const c = (type: string, snrs: number[], extra = {}) => ({ classification: { candidate_type: type }, status: "pending_validation", detections: snrs.map(snr => ({ snr })), ...extra });
  const s = candidateSummary([c("sub_pixel_motion", [6, 12]), c("possible_moving_object", [93], { known_match: "(4) Vesta", quality_flags: ["near_transient_pixels"] }), c("unclassified", [250])]);
  assert.equal(s.total, 3); assert.equal(s.known, 1); assert.equal(s.flagged, 1); assert.equal(s.pending, 3);
  assert.equal(s.byType.find(t => t.type === "possible_moving_object")!.count, 1);
  assert.deepEqual(s.snrBins.map(b => b.count), [1, 1, 0, 1, 0, 1]);
});
