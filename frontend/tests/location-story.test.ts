import { test } from "node:test";
import assert from "node:assert/strict";
import { equatorialToGalactic, galaxyZone, lightPhrase, listPhrase, locationCaption, locationScenes, sceneAt, starMotion, storyWavelength, visitSummaries, type LocationFacts } from "../lib/location-story.ts";
import { galacticToEquatorial } from "../lib/sky-story.ts";
import type { Observation, Target } from "../lib/types.ts";

const obs = (id: string, iso: string, band = "D2"): Observation => ({ id, mjd: Date.parse(iso) / 86400000 + 40587, band, target_id: null, obs_time: iso, wavelength_um: null, release: "DR1", source_file: `${id}.fits`, image_url: "" });

test("galactic coordinates: known points and round trip with galacticToEquatorial", () => {
  const [l, b] = equatorialToGalactic(266.40499, -28.93617); // Galactic Centre (Sgr A*)
  assert.ok(Math.abs(b) < 0.1 && (l < 0.2 || l > 359.8), `${l} ${b}`);
  assert.ok(equatorialToGalactic(192.85948, 27.12825)[1] > 89.9); // north galactic pole
  for (const [L, B] of [[30, 10], [200, -45], [310, 60]]) {
    const [ra, dec] = galacticToEquatorial(L, B), [l2, b2] = equatorialToGalactic(ra, dec);
    assert.ok(Math.abs(l2 - L) < 1e-6 && Math.abs(b2 - B) < 1e-6);
  }
});

test("Milky Way zone: Galactic Centre inside, Vesta's 2026 field and the pole outside", () => {
  assert.equal(galaxyZone(266.40499, -28.93617), "inside");
  assert.equal(galaxyZone(192.85948, 27.12825), "outside");
  assert.equal(galaxyZone(22.555155, 1.367605), "outside"); // b ~ -60
});

test("visits come from the real search results, grouped like the observation list", () => {
  const v = visitSummaries([obs("b", "2025-11-19T08:30:00Z"), obs("a", "2025-05-21T08:00:00Z"), obs("c", "2025-05-23T01:00:00Z")]);
  assert.deepEqual(v.map(x => [x.label, x.images]), [["May 2025", 2], ["Nov 2025", 1]]);
  assert.equal(listPhrase(["May 2025", "Nov 2025", "May 2026"]), "May 2025, Nov 2025 and May 2026");
});

test("wavelength: measured value first, band middle otherwise, said as such", () => {
  assert.deepEqual(storyWavelength("D2", 1.31), { um: 1.31, measured: true });
  assert.deepEqual(storyWavelength("D6", null), { um: 4.71, measured: false });
  assert.match(lightPhrase("D6", null), /of about 4\.71 micrometres \(detector D6\): about 7 times/);
  assert.match(lightPhrase("D1", 0.99), /of 0\.99 micrometres .*longer than the wavelength/);
  assert.equal(storyWavelength("X9", null), null);
});

test("star motion only for targets with a catalogue proper motion", () => {
  const barnard = { catalog_motion: { pm_ra_cosdec_mas_yr: -801.551, pm_dec_mas_yr: 10362.394, reference_epoch: 2016, source_catalog: "Gaia DR3" } } as Target;
  const m = starMotion(barnard)!;
  assert.ok(Math.abs(m.perYear - 10.393) < 0.01 && Math.abs(m.pixelsTenYears - 16.9) < 0.1);
  assert.equal(starMotion({ catalog_motion: null } as Target), null);
  assert.equal(starMotion(null), null);
  assert.deepEqual(locationScenes(false).map(s => s.name), ["sky", "locate", "visits", "light", "compare"]);
  assert.ok(locationScenes(true).some(s => s.name === "motion"));
});

test("scene timing and captions never claim a change", () => {
  const scenes = locationScenes(false);
  assert.equal(sceneAt(scenes, 0).name, "sky");
  assert.equal(sceneAt(scenes, 6).name, "locate");
  assert.equal(sceneAt(scenes, 999).name, "compare");
  const f: LocationFacts = { point: { ra: 22.5, dec: 1.4 }, name: null, constellation: "Pisces", zone: "outside", visits: visitSummaries([obs("a", "2025-05-21T08:00:00Z"), obs("b", "2025-11-19T08:30:00Z")]), images: 2, band: "D2", wavelengthUm: null, target: null };
  assert.match(locationCaption("locate", f), /^Your patch of sky is in front of the stars of Pisces, far from the Milky Way/);
  assert.match(locationCaption("visits", f), /came back to your patch of sky 2 times: May 2025 and Nov 2025\. 2 real pictures/);
  assert.match(locationCaption("compare", f), /that is a result too/);
  const barnard = { catalog_motion: { pm_ra_cosdec_mas_yr: -801.551, pm_dec_mas_yr: 10362.394, reference_epoch: 2016, source_catalog: "Gaia DR3" } } as Target;
  assert.match(locationCaption("motion", { ...f, name: "Barnard's Star", target: barnard }), /10\.4 arcseconds a year.*about 5″, less than one SPHEREx pixel.*104″/);
  assert.match(locationCaption("visits", { ...f, visits: [] }), /has not photographed/);
  for (const s of scenes) assert.doesNotMatch(locationCaption(s.name, f), /discover/i);
});
