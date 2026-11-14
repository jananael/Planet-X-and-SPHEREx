// "Simple explanation" for ANY location: where this patch is in the real night sky, when SPHEREx
// photographed it and in what light, then what to look for. Facts come only from the search results
// (dates, bands, wavelengths) and from fixed astronomy (galactic coordinates, constellation boundaries).
// Moving objects with an orbit (Vesta, 3I/ATLAS) keep their own journey (lib/sky-story.ts).
import { groupVisits } from "./observations.ts";
import type { Coordinates, Observation, Target } from "./types.ts";

const RAD = Math.PI / 180;
export const PIXEL_ARCSEC = 6.15; // SPHEREx pixel
const EYE_RED_UM = 0.7;           // longest wavelength the human eye sees (deep red)

/** Equatorial J2000 (RA, Dec) -> galactic (l, b), degrees. Inverse of galacticToEquatorial in sky-story.ts. */
export function equatorialToGalactic(ra: number, dec: number): [number, number] {
  const raNgp = 192.85948 * RAD, decNgp = 27.12825 * RAD, lNcp = 122.93192 * RAD;
  const a = ra * RAD, d = dec * RAD;
  const sinB = Math.sin(decNgp) * Math.sin(d) + Math.cos(decNgp) * Math.cos(d) * Math.cos(a - raNgp);
  const y = Math.cos(d) * Math.sin(a - raNgp);
  const x = Math.cos(decNgp) * Math.sin(d) - Math.sin(decNgp) * Math.cos(d) * Math.cos(a - raNgp);
  const l = (lNcp - Math.atan2(y, x)) / RAD;
  return [((l % 360) + 360) % 360, Math.asin(Math.max(-1, Math.min(1, sinB))) / RAD];
}

export type GalaxyZone = "inside" | "edge" | "outside";
export function galaxyZone(ra: number, dec: number): GalaxyZone {
  const b = Math.abs(equatorialToGalactic(ra, dec)[1]);
  return b < 10 ? "inside" : b < 30 ? "edge" : "outside";
}
export function galaxyPhrase(zone: GalaxyZone): string {
  return zone === "inside" ? "right inside the Milky Way, the crowded band of our own galaxy, so the images are full of stars"
    : zone === "edge" ? "near the edge of the Milky Way, our own galaxy"
    : "far from the Milky Way: here we look out of our galaxy, so the sky is darker and emptier";
}

export interface VisitSummary { from: string; to: string; images: number; label: string }
const monthLabel = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

/** SPHEREx visits to this patch (groups of images less than 30 days apart), from the real search results. */
export function visitSummaries(observations: Observation[]): VisitSummary[] {
  return groupVisits(observations).map(v => ({
    from: v[0].obs_time, to: v[v.length - 1].obs_time, images: v.length, label: monthLabel(v[0].obs_time),
  }));
}

export function listPhrase(items: string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// Approximate band ranges, used only when no measured wavelength is available.
const BAND_UM: Record<string, [number, number]> = {
  D1: [0.75, 1.09], D2: [1.10, 1.62], D3: [1.63, 2.41], D4: [2.42, 3.82], D5: [3.83, 4.41], D6: [4.42, 5.00],
};
/** Wavelength in µm to talk about: measured (images loaded) or the middle of the band's range. */
export function storyWavelength(band: string, measured: number | null | undefined): { um: number; measured: boolean } | null {
  if (measured != null && Number.isFinite(measured)) return { um: measured, measured: true };
  const r = BAND_UM[band];
  return r ? { um: (r[0] + r[1]) / 2, measured: false } : null;
}
export function lightPhrase(band: string, measured: number | null | undefined): string {
  const w = storyWavelength(band, measured);
  if (!w) return "SPHEREx sees infrared light, a kind of light our eyes cannot see.";
  const times = w.um / EYE_RED_UM;
  return `These pictures are in infrared light ${w.measured ? "of" : "of about"} ${w.um.toFixed(2)} micrometres (detector ${band}): `
    + `${times >= 1.95 ? `about ${Math.round(times)} times` : "longer than"} the wavelength of the deepest red our eyes can see. `
    + "It is invisible to us, but it shows dust and cool objects that ordinary light hides.";
}

/** Proper motion of a catalogued star, if known: arcsec per year and over ten years. */
export function starMotion(target: Target | null | undefined): { perYear: number; tenYears: number; pixelsTenYears: number } | null {
  const m = target?.catalog_motion;
  if (!m) return null;
  const perYear = Math.hypot(m.pm_ra_cosdec_mas_yr, m.pm_dec_mas_yr) / 1000;
  if (!(perYear > 0)) return null;
  return { perYear, tenYears: perYear * 10, pixelsTenYears: (perYear * 10) / PIXEL_ARCSEC };
}

export type LocationScene = "sky" | "locate" | "visits" | "light" | "motion" | "compare";
export function locationScenes(hasMotion: boolean): { name: LocationScene; seconds: number }[] {
  return [
    { name: "sky", seconds: 5 }, { name: "locate", seconds: 7 }, { name: "visits", seconds: 9 }, { name: "light", seconds: 7 },
    ...(hasMotion ? [{ name: "motion" as const, seconds: 7 }] : []), { name: "compare", seconds: 7 },
  ];
}
export function sceneAt(scenes: { name: LocationScene; seconds: number }[], t: number): { name: LocationScene; index: number; progress: number } {
  let start = 0;
  for (let i = 0; i < scenes.length; i++) {
    const end = start + scenes[i].seconds;
    if (t < end || i === scenes.length - 1) return { name: scenes[i].name, index: i, progress: Math.min(1, Math.max(0, (t - start) / scenes[i].seconds)) };
    start = end;
  }
  return { name: "sky", index: 0, progress: 0 };
}

export interface LocationFacts {
  point: Coordinates; name: string | null; constellation: string | null; zone: GalaxyZone;
  visits: VisitSummary[]; images: number; band: string; wavelengthUm: number | null; target: Target | null;
}

/** Plain-language caption for a scene. Never claims a change or a discovery: it says what to look for. */
export function locationCaption(scene: LocationScene, f: LocationFacts): string {
  const here = f.name ?? "your patch of sky";
  switch (scene) {
    case "sky": return "This is the real night sky, the whole of it: every dot is a real star and the lines join the stars of each constellation.";
    case "locate": return `${f.name ? `${f.name} is` : "Your patch of sky is"} ${f.constellation ? `in front of the stars of ${f.constellation}` : "here"}, ${galaxyPhrase(f.zone)}.`;
    case "visits": {
      if (!f.visits.length) return "SPHEREx has not photographed this patch yet in the data we searched.";
      const when = listPhrase(f.visits.map(v => v.label));
      return f.visits.length === 1
        ? `NASA's SPHEREx telescope photographed ${here} in ${when}: ${f.images} real pictures, taken during one visit.`
        : `NASA's SPHEREx telescope came back to ${here} ${f.visits.length} times: ${when}. ${f.images} real pictures in all.`;
    }
    case "light": return lightPhrase(f.band, f.wavelengthUm);
    case "motion": {
      const m = starMotion(f.target);
      if (!m) return "";
      const halfYear = m.perYear / 2;
      return `${f.name ?? "This star"} drifts ${m.perYear.toFixed(1)} arcseconds a year across the sky. Between two SPHEREx visits six months apart `
        + `that is about ${halfYear.toFixed(0)}″, ${halfYear < PIXEL_ARCSEC ? "less than one SPHEREx pixel" : `about ${(halfYear / PIXEL_ARCSEC).toFixed(0)} SPHEREx pixels`}, `
        + `so look closely (Difference mode helps). Over ten years it adds up to ${m.tenYears.toFixed(0)}″.`;
    }
    case "compare": return f.visits.length > 1
      ? "Now go back to the pictures and play them in order. If something jumps to a new place or gets brighter or fainter, that is a change. Most of the time nothing moves, and that is a result too."
      : "Now go back to the pictures and step through them. Pictures hours apart can show fast movers like asteroids; for slow changes, SPHEREx needs to come back months later.";
  }
}
