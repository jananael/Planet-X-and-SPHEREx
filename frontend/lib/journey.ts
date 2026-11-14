// The object's journey: data from /api/journey (JPL Horizons + SPHEREx inventory) turned into a timed
// animation. Pure functions here (testable); drawing lives in components/journey-player.tsx.

export type Sample = [string, number, number]; // [ISO date, x | RA, y | Dec]
export interface JourneyBody { name: string; kind: "object" | "planet"; orbit: Sample[]; track: Sample[] }
export interface JourneyVisit { visit: number; from: string; to: string; exposures: number; releases: string[] }
export interface JourneyData {
  target: { id: string; name: string; type: string; fact: string };
  window: { start: string; end: string };
  bodies: JourneyBody[];
  sky_track: Sample[];
  spherex_exposures: { utc: string; visit: number; release: string; ra: number; dec: number }[];
  spherex_visits: JourneyVisit[];
  highlight: { ra: number; dec: number; start: string; end: string; band: string } | null;
  sources: string[];
}

export type SceneName = "orbit" | "sky" | "images" | "end";
export const SCENES: { name: SceneName; seconds: number }[] = [
  { name: "orbit", seconds: 14 }, { name: "sky", seconds: 8 }, { name: "images", seconds: 9 }, { name: "end", seconds: 5 },
];
export const TOTAL_SECONDS = SCENES.reduce((s, x) => s + x.seconds, 0);

/** Which scene is playing at time t (seconds), and how far into it (0..1). */
export function sceneAt(t: number): { name: SceneName; progress: number; index: number } {
  let start = 0;
  for (let i = 0; i < SCENES.length; i++) {
    const end = start + SCENES[i].seconds;
    if (t < end || i === SCENES.length - 1) return { name: SCENES[i].name, progress: Math.min(1, Math.max(0, (t - start) / SCENES[i].seconds)), index: i };
    start = end;
  }
  return { name: "end", progress: 1, index: SCENES.length - 1 };
}

const day = (iso: string) => Date.parse(iso.slice(0, 10) + "T00:00:00Z") / 86_400_000;

/** Date reached after `fraction` (0..1) of the observing window. */
export function dateAt(data: JourneyData, fraction: number): string {
  const a = day(data.window.start), b = day(data.window.end);
  return new Date((a + (b - a) * Math.min(1, Math.max(0, fraction))) * 86_400_000).toISOString().slice(0, 10);
}

/** Linear interpolation of a [date, x, y] series at an ISO date (clamped to the ends). */
export function positionAt(series: Sample[], iso: string): [number, number] | null {
  if (!series.length) return null;
  const t = day(iso);
  if (t <= day(series[0][0])) return [series[0][1], series[0][2]];
  for (let i = 1; i < series.length; i++) {
    const t1 = day(series[i][0]);
    if (t <= t1) {
      const t0 = day(series[i - 1][0]), f = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
      return [series[i - 1][1] + (series[i][1] - series[i - 1][1]) * f, series[i - 1][2] + (series[i][2] - series[i - 1][2]) * f];
    }
  }
  const last = series[series.length - 1];
  return [last[1], last[2]];
}

/** The SPHEREx visit in progress at a date, if any. */
export function visitAt(data: JourneyData, iso: string): JourneyVisit | null {
  const d = iso.slice(0, 10);
  return data.spherex_visits.find(v => v.from <= d && d <= v.to) ?? null;
}

/** RA unwrapped along the track so a path crossing RA 0/360 is drawn as one line. */
export function unwrapRa(track: Sample[]): Sample[] {
  const out: Sample[] = [];
  let offset = 0;
  for (let i = 0; i < track.length; i++) {
    if (i > 0) {
      const jump = track[i][1] + offset - out[i - 1][1];
      if (jump > 180) offset -= 360; else if (jump < -180) offset += 360;
    }
    out.push([track[i][0], track[i][1] + offset, track[i][2]]);
  }
  return out;
}

export function formatMonth(iso: string): string {
  return new Date(iso.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** Caption for a scene; numbers come from the data only. */
export function caption(data: JourneyData, scene: SceneName, iso: string, motion?: { hours: number | null; arcsec: number | null; pixels: number | null; direction: string | null }): string {
  const name = data.target.name;
  if (scene === "orbit") {
    const v = visitAt(data, iso);
    if (v) return `${formatMonth(v.from)}: SPHEREx, orbiting Earth, points at ${name} (visit ${v.visit}, ${v.exposures} exposures, ${v.releases.join(" + ")}).`;
    return `This is ${name}'s real path around the Sun, ${formatMonth(data.window.start)} to ${formatMonth(data.window.end)}. ${data.target.fact}`;
  }
  if (scene === "sky") return `Seen from Earth, ${name} slowly draws this line across the sky. Each dot is a moment SPHEREx photographed it.`;
  if (scene === "images") {
    if (motion && motion.hours !== null && motion.arcsec !== null)
      return `Two real SPHEREx pictures, ${Math.round(motion.hours * 10) / 10} hours apart: ${name} moved ${Math.round(motion.arcsec)} arcseconds` +
        `${motion.direction ? ` to the ${motion.direction}` : ""} (about ${Math.round(motion.pixels ?? 0)} pixels) while the stars stayed still.`;
    return `Two real SPHEREx pictures of ${name}.`;
  }
  return "Real data: JPL Horizons orbit and NASA SPHEREx images. A known object, not a discovery.";
}
