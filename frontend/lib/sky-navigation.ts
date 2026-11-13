import type { Coordinates } from "./types.ts";

export type SkyLocation = Coordinates & { name?: string; origin: "coordinate" | "catalog" | "bookmark" };
export type SkyBookmark = Coordinates & { id: string; name: string; createdAt: string; kind: "bookmark" };
export const BOOKMARK_KEY = "skytrace.discovery-passport.locations.v1";
export type SkyFeature = { id: string; properties: { name?: string }; geometry: { type: string; coordinates: number[][][] } };
export type CoverageMetadata = {
  source: "NASA/IPAC IRSA";
  release: string;
  provenanceUrl: string;
  regions: { vertices: Coordinates[] }[];
};

export function normalizeSkyPoint(point: Coordinates): Coordinates {
  if (!Number.isFinite(point.ra) || !Number.isFinite(point.dec) || point.dec < -90 || point.dec > 90) throw new Error("Invalid sky coordinates.");
  return { ra: ((point.ra % 360) + 360) % 360, dec: point.dec };
}
export function angularDistance(a: Coordinates, b: Coordinates): number {
  const rad = Math.PI / 180;
  const h = Math.sin((a.dec - b.dec) * rad / 2) ** 2 + Math.cos(a.dec * rad) * Math.cos(b.dec * rad) * Math.sin((a.ra - b.ra) * rad / 2) ** 2;
  return Math.asin(Math.sqrt(Math.min(1, Math.max(0, h)))) * 2 / rad;
}
export function sameSkyPoint(a: Coordinates, b: Coordinates) { return angularDistance(a, b) < 1 / 3600; }

export function readBookmarks(serialized: string | null): SkyBookmark[] {
  try {
    const data = JSON.parse(serialized ?? "null");
    if (data?.version !== 1 || !Array.isArray(data.locations)) return [];
    const valid: SkyBookmark[] = [];
    for (const item of data.locations.slice(0, 500)) {
      if (item?.kind !== "bookmark" || typeof item.id !== "string" || typeof item.name !== "string" || typeof item.createdAt !== "string") continue;
      try {
        const point = normalizeSkyPoint(item);
        if (!valid.some(saved => sameSkyPoint(saved, point))) valid.push({ ...point, id: item.id.slice(0, 100), name: item.name.slice(0, 100), createdAt: item.createdAt, kind: "bookmark" });
      } catch { /* Ignore damaged entries, preserving valid bookmarks. */ }
    }
    return valid;
  } catch { return []; }
}

const vector = ([ra, dec]: number[]) => {
  const r = ra * Math.PI / 180, d = dec * Math.PI / 180;
  return [Math.cos(d) * Math.cos(r), Math.cos(d) * Math.sin(r), Math.sin(d)];
};
const dot = (a: number[], b: number[]) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Spherical winding, including RA wrap and polar regions (J2000 catalog boundaries). */
export function skyRegion(point: Coordinates, boundaries: SkyFeature[], names: Record<string, string>): string | null {
  const p = vector([point.ra, point.dec]);
  for (const feature of boundaries) {
    const ring = feature.geometry.coordinates[0];
    const vertices = ring.map(vector);
    const centroid = vertices.reduce((sum, v) => sum.map((n, i) => n + v[i]), [0, 0, 0]);
    if (dot(p, centroid) <= 0) continue; // Reject the antipodal winding of a small sky region.
    let angle = 0;
    for (let i = 0; i < vertices.length - 1; i++) {
      const a = vertices[i], b = vertices[i + 1];
      angle += Math.atan2(dot(p, cross(a, b)), dot(a, b) - dot(p, a) * dot(p, b));
    }
    if (Math.abs(angle) > Math.PI) return names[feature.id] ?? feature.id;
  }
  return null;
}
