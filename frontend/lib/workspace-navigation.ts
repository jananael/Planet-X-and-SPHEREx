import type { Coordinates, SearchOptions } from "./types.ts";
export function locationKey(position: Coordinates, options: SearchOptions): string {
  return JSON.stringify([position.ra, position.dec, options.start || null, options.end || null, options.band || null]);
}
export function workspaceHref(path: string, position: Coordinates | null, options: SearchOptions = {}, target?: string | null): string {
  if (!position) return path;
  const params = new URLSearchParams({ ra: String(position.ra), dec: String(position.dec) });
  for (const key of ["start", "end", "band"] as const) if (options[key]) params.set(key, options[key]);
  if (target) params.set("target", target);
  return path + "?" + params;
}
