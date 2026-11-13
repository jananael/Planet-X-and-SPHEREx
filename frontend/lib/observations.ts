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

/** Only offer dates actually returned by the archive, grouped by UTC day. */
export function observationDates(observations: Observation[], band: string) {
  const dates = new Map<string, Observation[]>();
  for (const observation of observations) {
    if (observation.band !== band) continue;
    const date = new Date(observation.obs_time).toISOString().slice(0, 10);
    dates.set(date, [...(dates.get(date) ?? []), observation]);
  }
  return [...dates].sort(([a], [b]) => a.localeCompare(b)).map(([date, images]) => ({ date, images }));
}

export function selectDate(selected: string[], images: Observation[], include: boolean): string[] {
  const ids = new Set(images.map(image => image.id));
  return include ? [...new Set([...selected, ...ids])] : selected.filter(id => !ids.has(id));
}
