import type { Coordinates, Observation } from "./types.ts";
import { formatUtc, NOT_AVAILABLE } from "./scientific-format.ts";

export function parseCoordinates(ra: string, dec: string): Coordinates {
  const r = Number(ra), d = Number(dec);
  if (!ra.trim() || !Number.isFinite(r) || r < 0 || r >= 360) throw new Error("Enter RA from 0 up to, but not including, 360 degrees.");
  if (!dec.trim() || !Number.isFinite(d) || d < -90 || d > 90) throw new Error("Enter Dec between −90 and 90 degrees.");
  return { ra: r, dec: d };
}

export function groupVisits(observations: Observation[]): Observation[][] {
  const sorted = [...observations].sort((a, b) => a.mjd - b.mjd);
  const visits: Observation[][] = [];
  for (const obs of sorted) {
    const last = visits.at(-1);
    if (!last || obs.mjd - last[last.length - 1].mjd > 30) visits.push([obs]);
    else last.push(obs);
  }
  return visits;
}

export function bestBand(observations: Observation[]): string {
  const visits = groupVisits(observations);
  const bands = [...new Set(observations.map(o => o.band))].sort();
  return bands.sort((a, b) => visits.filter(v => v.some(o => o.band === b)).length - visits.filter(v => v.some(o => o.band === a)).length)[0] ?? "D3";
}

export function defaultSelection(observations: Observation[], band: string): string[] {
  const perVisit = groupVisits(observations).flatMap(v => { const obs = v.find(o => o.band === band); return obs ? [obs.id] : []; });
  if (perVisit.length >= 2) return perVisit;
  // Only one visit in this band (e.g. an asteroid imaged hours apart): blink its exposures instead,
  // otherwise there is a single frame and nothing to compare.
  return [...observations].filter(o => o.band === band).sort((a, b) => a.mjd - b.mjd).map(o => o.id);
}

/** Only offer dates actually returned by the archive, grouped by UTC day. */
export function observationDates(observations: Observation[], band: string) {
  const dates = new Map<string, Observation[]>();
  for (const observation of observations) {
    if (observation.band !== band) continue;
    const timestamp = formatUtc(observation.obs_time);
    if (timestamp === NOT_AVAILABLE) continue;
    const date = timestamp.slice(0, 10);
    dates.set(date, [...(dates.get(date) ?? []), observation]);
  }
  return [...dates].sort(([a], [b]) => a.localeCompare(b)).map(([date, images]) => ({ date, images }));
}

export function selectDate(selected: string[], images: Observation[], include: boolean): string[] {
  const ids = new Set(images.map(image => image.id));
  return include ? [...new Set([...selected, ...ids])] : selected.filter(id => !ids.has(id));
}

/**
 * Pipelines mixed in one comparison. Science team (Nov 2026): DR1 reprocessed Surveys 1-2 with the
 * same processing and calibration as QR3, so DR1 + QR3 together is fine; what matters is the
 * pipeline version (l2b-vNN in processing_version), not the release name. Missing versions
 * cannot establish processing compatibility; release names are never substituted for them.
 */
export function mixedPipelines(frames: { obs: { release: string; processing_version?: string | null } }[]): string[] {
  const pipeline = (o: { release: string; processing_version?: string | null }) =>
    // 'l2b_retry-v27-…' (DR1 files that IRSA re-ran) is the same pipeline as 'l2b-v27-…'.
    (v => v ? `l2b-${v[1]}` : null)(o.processing_version?.match(/l2b(?:_retry)?-(v\d+)/));
  const known = frames.map(f => pipeline(f.obs));
  const values = known.filter((value): value is string => value !== null);
  const distinct = [...new Set(values)].sort();
  return distinct.length > 1 ? distinct : [];
}

/**
 * Do these frames cover a common wavelength range? (science team: compare bands, not a fixed
 * tolerance). Each frame covers wavelength ± bandwidth/2; they are comparable if all ranges overlap.
 * Falls back to a 0.05 um spread when a bandwidth is missing.
 */
export function spectralAssessment(frames: { wavelengthUm: number | null; bandwidthUm: number | null }[]): { state: "not_applicable" | "undetermined" | "estimated" | "overlap" | "incompatible"; mismatch: boolean; explanation: string } {
  if (frames.length < 2) return { state: "not_applicable", mismatch: false, explanation: "Select at least two images to assess spectral compatibility." };
  if (frames.some(f => f.wavelengthUm === null || !Number.isFinite(f.wavelengthUm) || f.wavelengthUm <= 0)) return { state: "undetermined", mismatch: false, explanation: "Compatibility undetermined: wavelength metadata is missing or invalid for one or more images." };
  const wavelengths = frames.map(f => f.wavelengthUm as number);
  if (frames.some(f => f.bandwidthUm === null || !Number.isFinite(f.bandwidthUm) || f.bandwidthUm <= 0)) {
    const mismatch = Math.max(...wavelengths) - Math.min(...wavelengths) > .05;
    return { state: "estimated", mismatch, explanation: `Spectral compatibility estimated because complete bandwidth metadata is unavailable. The legacy 0.05 µm wavelength-spread heuristic ${mismatch ? "suggests a mismatch" : "does not indicate a mismatch"}; this does not verify overlapping bands.` };
  }
  const low = Math.max(...frames.map(f => f.wavelengthUm! - f.bandwidthUm! / 2));
  const high = Math.min(...frames.map(f => f.wavelengthUm! + f.bandwidthUm! / 2));
  return low >= high
    ? { state: "incompatible", mismatch: true, explanation: "The reported spectral bands do not share a common wavelength range. Brightness differences may reflect wavelength rather than changes in the sky." }
    : { state: "overlap", mismatch: false, explanation: "Reported spectral ranges overlap. This check alone does not verify photometric or scientific comparability." };
}

export function spectralMismatch(frames: { wavelengthUm: number | null; bandwidthUm: number | null }[]): boolean {
  return spectralAssessment(frames).mismatch;
}
