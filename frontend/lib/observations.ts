import type { Coordinates, Observation } from "./types.ts";

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

/**
 * Do these frames cover a common wavelength range? (science team: compare bands, not a fixed
 * tolerance). Each frame covers wavelength ± bandwidth/2; they are comparable if all ranges overlap.
 * Falls back to a 0.05 um spread when a bandwidth is missing.
 */
/**
 * Pipelines mixed in one comparison. Science team (Nov 2026): DR1 reprocessed Surveys 1-2 with the
 * same processing and calibration as QR3, so DR1 + QR3 together is fine; what matters is the
 * pipeline version (l2b-vNN in processing_version), not the release name. Returns the distinct
 * pipelines when they differ; when a version is unknown, falls back to comparing release names.
 */
export function mixedPipelines(frames: { obs: { release: string; processing_version?: string | null } }[]): string[] {
  const pipeline = (o: { release: string; processing_version?: string | null }) =>
    o.processing_version?.match(/l2b-v\d+/)?.[0] ?? null;
  const known = frames.map(f => pipeline(f.obs));
  const values = known.every(Boolean) ? known as string[] : frames.map(f => f.obs.release);
  const distinct = [...new Set(values)].sort();
  return distinct.length > 1 ? distinct : [];
}

export function spectralMismatch(frames: { wavelengthUm: number | null; bandwidthUm: number | null }[]): boolean {
  const known = frames.filter((f): f is { wavelengthUm: number; bandwidthUm: number | null } => f.wavelengthUm !== null);
  if (known.length < 2) return false;
  if (known.every(f => f.bandwidthUm !== null && f.bandwidthUm > 0)) {
    const low = Math.max(...known.map(f => f.wavelengthUm - (f.bandwidthUm as number) / 2));
    const high = Math.min(...known.map(f => f.wavelengthUm + (f.bandwidthUm as number) / 2));
    return low >= high;
  }
  const w = known.map(f => f.wavelengthUm);
  return Math.max(...w) - Math.min(...w) > 0.05;
}
