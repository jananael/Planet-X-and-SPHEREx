// "Data dashboard": summaries of the REAL search results for one sky location (and, on request, of the
// candidate engine's output). Pure functions, so every number on the dashboard is testable and traceable.
import { groupVisits } from "./observations.ts";
import type { Observation } from "./types.ts";

export const BANDS = ["D1", "D2", "D3", "D4", "D5", "D6"] as const;
/** Detector colours ordered by wavelength (short infrared = blue, long = red). */
export const BAND_COLORS: Record<string, string> = {
  D1: "#5b8def", D2: "#45b7d1", D3: "#5fcf8a", D4: "#f2c14e", D5: "#f08a4b", D6: "#e5484d",
};
// SPHEREx detector ranges (µm), used when an observation does not report its own range.
const BAND_RANGE_UM: Record<string, [number, number]> = {
  D1: [0.75, 1.09], D2: [1.10, 1.62], D3: [1.63, 2.41], D4: [2.42, 3.82], D5: [3.83, 4.41], D6: [4.42, 5.00],
};

export interface Overview {
  images: number; visits: number; dates: number; bands: number; releases: string[]; pipelines: string[];
  first: string | null; last: string | null; spanDays: number;
}
export function overview(observations: Observation[]): Overview {
  const sorted = [...observations].sort((a, b) => a.obs_time.localeCompare(b.obs_time));
  const first = sorted[0]?.obs_time ?? null, last = sorted.at(-1)?.obs_time ?? null;
  return {
    images: observations.length,
    visits: groupVisits(observations).length,
    dates: new Set(observations.map(o => o.obs_time.slice(0, 10))).size,
    bands: new Set(observations.map(o => o.band)).size,
    releases: [...new Set(observations.map(o => o.release))].sort(),
    pipelines: [...new Set(observations.map(o => o.processing_version?.match(/l2b(?:_retry)?-(v\d+)/)?.[1]).filter((v): v is string => !!v))].sort(),
    first, last,
    spanDays: first && last ? Math.round((Date.parse(last) - Date.parse(first)) / 864e5) : 0,
  };
}

export interface Slice { band: string; count: number; share: number; color: string }
/** Images per detector, D1..D6 in wavelength order, with shares that add up to 1. */
export function bandShares(observations: Observation[]): Slice[] {
  const total = observations.length || 1;
  return BANDS.map(band => {
    const count = observations.filter(o => o.band === band).length;
    return { band, count, share: count / total, color: BAND_COLORS[band] };
  }).filter(s => s.count > 0);
}

export interface Coverage { band: string; fromUm: number; toUm: number; images: number; color: string }
/** Wavelength range covered by each detector here (reported ranges when present). */
export function wavelengthCoverage(observations: Observation[]): Coverage[] {
  return BANDS.flatMap(band => {
    const mine = observations.filter(o => o.band === band);
    if (!mine.length) return [];
    const ranges = mine.map(o => o.wavelength_range_um ?? BAND_RANGE_UM[band]).filter(Boolean) as [number, number][];
    return [{ band, fromUm: Math.min(...ranges.map(r => r[0])), toUm: Math.max(...ranges.map(r => r[1])), images: mine.length, color: BAND_COLORS[band] }];
  });
}

export interface MonthBin { month: string; label: string; counts: Record<string, number>; total: number }
/** Images per calendar month (UTC), split by detector, including empty months between the first and last. */
export function monthlyHistogram(observations: Observation[]): MonthBin[] {
  if (!observations.length) return [];
  const key = (iso: string) => iso.slice(0, 7);
  const months = observations.map(o => key(o.obs_time)).sort();
  const out: MonthBin[] = [];
  let [y, m] = months[0].split("-").map(Number);
  const [ly, lm] = months.at(-1)!.split("-").map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    const month = `${y}-${String(m).padStart(2, "0")}`;
    const here = observations.filter(o => key(o.obs_time) === month);
    const counts: Record<string, number> = {};
    for (const o of here) counts[o.band] = (counts[o.band] ?? 0) + 1;
    out.push({ month, label: new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }), counts, total: here.length });
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

/** Most recent observations first, for the table. */
export function latest(observations: Observation[], n = 6): Observation[] {
  return [...observations].sort((a, b) => b.obs_time.localeCompare(a.obs_time)).slice(0, n);
}

// ---------- Candidate engine summary ----------
export interface CandidateLike {
  classification: { candidate_type: string };
  status: string;
  known_match?: string | null;
  quality_flags?: string[];
  detections: { snr?: number | null }[];
  motion?: { angular_displacement_arcsec?: number | null } | null;
}
export const TYPE_LABELS: Record<string, string> = {
  possible_moving_object: "Possible moving object", sub_pixel_motion: "Shift under 1 pixel",
  possible_variable: "Possible brightness change", unclassified: "Unclassified",
};
export function candidateSummary(candidates: CandidateLike[]) {
  const byType = Object.keys(TYPE_LABELS).map(type => ({ type, label: TYPE_LABELS[type], count: candidates.filter(c => c.classification.candidate_type === type).length }));
  const snrs = candidates.flatMap(c => c.detections.map(d => d.snr).filter((s): s is number => typeof s === "number" && Number.isFinite(s)));
  const edges = [5, 10, 20, 50, 100, 200, Infinity];
  const snrBins = edges.slice(0, -1).map((lo, i) => ({ label: edges[i + 1] === Infinity ? `${lo}+` : `${lo}–${edges[i + 1]}`, count: snrs.filter(s => s >= lo && s < edges[i + 1]).length }));
  return {
    total: candidates.length, byType, snrBins,
    known: candidates.filter(c => c.known_match).length,
    flagged: candidates.filter(c => (c.quality_flags ?? []).length > 0).length,
    pending: candidates.filter(c => c.status === "pending_validation").length,
  };
}
