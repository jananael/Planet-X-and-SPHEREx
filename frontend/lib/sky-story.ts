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

/** Plain-language caption. `constellation`: IAU constellation behind the object right now; `now`: date reached. */
export function skyCaption(data: JourneyData, phase: { kind: "intro" | "year" | "outro" }, year: number | null, constellation: string | null, now?: string): string {
  const name = data.target.name;
  if (phase.kind === "intro") return `This is the real night sky: every dot is a real star, the lines join the stars of each constellation. Let's follow ${name}.`;
  if (phase.kind === "outro") return "The path comes from JPL Horizons calculations. SPHEREx photographed it only in 2025 and 2026: those are real pictures. A known object, not a discovery.";
  const where = constellation ? ` in front of the stars of ${constellation}` : "";
  // Only speak about SPHEREx once the path has reached the real exposure dates.
  if (now && year !== null && duringVisit(data, now)) {
    const n = spherexInYear(data, year, now);
    return `${year}: ${name} is${where}, and right now NASA's SPHEREx telescope is photographing it (${n} real pictures so far this year).`;
  }
  const seen = year !== null ? spherexInYear(data, year, now) : 0;
  if (seen > 0) return `${year}: ${name} travels${where}. SPHEREx took ${seen} real pictures of it earlier this year.`;
  const later = year !== null && spherexInYear(data, year) > 0;
  return `${year}: ${name} travels${where}.${later ? "" : year !== null && year < 2025 ? " (Calculated path: SPHEREx was not observing yet.)" : year !== null && year > 2026 ? " (Calculated path: no SPHEREx images in this archive yet.)" : ""}`;
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
