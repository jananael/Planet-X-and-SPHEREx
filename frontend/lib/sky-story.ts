// "Simple explanation": the object's path through the real night sky, year by year.
// Path: JPL Horizons RA/Dec (sky_years in /api/journey). Stars and constellations: d3-celestial catalogs
// (Hipparcos positions, IAU boundaries). SPHEREx moments: the observation inventory. Nothing is drawn freehand.
import type { JourneyData, Sample } from "./journey";

export interface YearSegment { year: number; points: Sample[] }
export interface Timeline { intro: number; perYear: number; outro: number; total: number }

export function yearsOf(track: Sample[]): YearSegment[] {
  const byYear = new Map<number, Sample[]>();
  for (const s of track) {
    const y = Number(s[0].slice(0, 4));
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(s);
  }
  return [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, points]) => ({ year, points }));
}

export function timeline(years: number): Timeline {
  const intro = 4, perYear = years > 3 ? 2.6 : 6, outro = 5;
  return { intro, perYear, outro, total: intro + perYear * years + outro };
}

/** Phase at time t: intro, a given year (index + progress through it), or outro. */
export function phaseAt(t: number, tl: Timeline, years: number): { kind: "intro" | "year" | "outro"; index: number; progress: number } {
  if (t < tl.intro) return { kind: "intro", index: -1, progress: t / tl.intro };
  const y = (t - tl.intro) / tl.perYear;
  if (y < years) return { kind: "year", index: Math.floor(y), progress: y - Math.floor(y) };
  return { kind: "outro", index: years - 1, progress: Math.min(1, (t - tl.intro - tl.perYear * years) / tl.outro) };
}

/** SPHEREx exposures in a given year, optionally only those up to a date (the path drawn so far). */
export function spherexInYear(data: JourneyData, year: number, upTo?: string): number {
  return data.spherex_exposures.filter(e => e.utc.startsWith(String(year)) && (!upTo || e.utc.slice(0, 10) <= upTo)).length;
}

/** True while the drawn path is within a SPHEREx visit (from its first to its last exposure). */
export function duringVisit(data: JourneyData, iso: string): boolean {
  const d = iso.slice(0, 10);
  return data.spherex_visits.some(v => v.from <= d && d <= v.to);
}

/** Today's date (UTC, YYYY-MM-DD): positions after it are predictions, not observations. */
export function todayIso(): string { return new Date().toISOString().slice(0, 10); }
export const isFuture = (iso: string, today: string) => iso.slice(0, 10) > today;

/** Plain-language caption. `constellation`: IAU constellation behind the object right now; `now`: date reached. */
export function skyCaption(data: JourneyData, phase: { kind: "intro" | "year" | "outro" }, year: number | null, constellation: string | null, now?: string, today = todayIso()): string {
  const name = data.target.name;
  if (phase.kind === "intro") return `This is the real night sky: every dot is a real star, the lines join the stars of each constellation. Let's follow ${name}.`;
  if (phase.kind === "outro") return "Solid line: where it was (JPL Horizons). Dotted line: where it will be, a prediction. SPHEREx photographed it only in 2025 and 2026: those are real pictures. A known object, not a discovery.";
  const where = constellation ? ` in front of the stars of ${constellation}` : "";
  // The future is a prediction: say so in the words, not only in the drawing.
  if (now && isFuture(now, today)) return `${year} (prediction): ${name} will travel${where}. Nobody has photographed this yet: it is calculated from its orbit.`;
  // Only speak about SPHEREx once the path has reached the real exposure dates.
  if (now && year !== null && duringVisit(data, now)) {
    const n = spherexInYear(data, year, now);
    return `${year}: ${name} is${where}, and right now NASA's SPHEREx telescope is photographing it (${n} real pictures so far this year).`;
  }
  const seen = year !== null ? spherexInYear(data, year, now) : 0;
  if (seen > 0) return `${year}: ${name} travels${where}. SPHEREx took ${seen} real pictures of it earlier this year.`;
  const later = year !== null && spherexInYear(data, year) > 0;
  return `${year}: ${name} travels${where}.${later ? "" : year !== null && year < 2025 ? " (Calculated path: SPHEREx was not observing yet.)" : ""}`;
}

/** Map RA/Dec onto a wide strip, east to the left, RA 0..360 across the width. */
export function project(ra: number, dec: number, width: number, height: number, decMin: number, decMax: number, raCenter: number): [number, number] {
  const d = ((ra - raCenter + 540) % 360) - 180; // -180..180, east (larger RA) to the left
  return [width / 2 - (d / 360) * width, height - ((dec - decMin) / (decMax - decMin)) * height];
}

/** Dec range that keeps the whole path visible with room for the constellations around it. */
export function decRange(track: Sample[]): [number, number] {
  const decs = track.map(s => s[2]);
  const lo = Math.min(...decs), hi = Math.max(...decs), mid = (lo + hi) / 2, half = Math.max(30, (hi - lo) / 2 + 12);
  return [Math.max(-90, mid - half), Math.min(90, mid + half)];
}

const RAD = Math.PI / 180;

/** Signed RA offset from the map centre, -180..180 (positive = east = drawn to the left). */
export const raOffset = (ra: number, raCenter: number) => ((ra - raCenter + 540) % 360) - 180;

/**
 * Hammer-Aitoff all-sky projection (the classic oval sky map), east to the left.
 * Returns canvas x, y for a map of `width` x `height` with a small margin.
 */
export function hammer(ra: number, dec: number, width: number, height: number, raCenter: number): [number, number] {
  const lam = -raOffset(ra, raCenter) * RAD, phi = dec * RAD;
  const z = Math.sqrt(1 + Math.cos(phi) * Math.cos(lam / 2));
  const x = (2 * Math.SQRT2 * Math.cos(phi) * Math.sin(lam / 2)) / z, y = (Math.SQRT2 * Math.sin(phi)) / z;
  const s = Math.min((width - 40) / (4 * Math.SQRT2), (height - 40) / (2 * Math.SQRT2));
  return [width / 2 + x * s, height / 2 - y * s];
}

/** True when a line between two RA values would cross the map's back seam (so it must be broken). */
export const crossesSeam = (ra1: number, ra2: number, raCenter: number) => Math.abs(raOffset(ra1, raCenter) - raOffset(ra2, raCenter)) > 180;

/** Galactic (l, b) -> equatorial J2000 (RA, Dec), degrees. Used to draw the Milky Way where it really is. */
export function galacticToEquatorial(l: number, b: number): [number, number] {
  const raNgp = 192.85948 * RAD, decNgp = 27.12825 * RAD, lNcp = 122.93192 * RAD;
  const L = l * RAD, B = b * RAD;
  const sinDec = Math.sin(decNgp) * Math.sin(B) + Math.cos(decNgp) * Math.cos(B) * Math.cos(lNcp - L);
  const ra = raNgp + Math.atan2(Math.cos(B) * Math.sin(lNcp - L), Math.cos(decNgp) * Math.sin(B) - Math.sin(decNgp) * Math.cos(B) * Math.cos(lNcp - L));
  return [((ra / RAD) % 360 + 360) % 360, Math.asin(sinDec) / RAD];
}
