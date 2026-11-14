// The real night sky as an oval all-sky map (Hammer-Aitoff), shared by the "Simple explanation" players.
// Stars: 493 named Hipparcos stars; lines and IAU boundaries: d3-celestial (public/skytrace/catalogs).
// Milky Way drawn along the real galactic plane. No decorative or invented stars.
import { crossesSeam, galacticToEquatorial, hammer } from "../lib/sky-story";
import type { SkyFeature } from "../lib/sky-navigation";

export const SKY_W = 960, SKY_H = 480, SKY_K = 2; // whole sky (360° x 180°, 2:1), drawn at 2x for full screen
export type Star = { name: string; ra: number; dec: number; mag: number };
export type Catalog = { stars: Star[]; lines: SkyFeature[]; bounds: SkyFeature[]; names: Record<string, string>; labels: { id: string; ra: number; dec: number }[] };

let catalogPromise: Promise<Catalog> | null = null;
export function loadCatalog(): Promise<Catalog> {
  catalogPromise ??= Promise.all(["named-stars.json", "constellations.lines.json", "constellations.bounds.json", "constellations.json"]
    .map(f => fetch(`/skytrace/catalogs/${f}`).then(r => { if (!r.ok) throw new Error(`catalog ${f}`); return r.json(); })))
    .then(([stars, lines, bounds, names]) => ({
      stars, lines: lines.features, bounds: bounds.features,
      names: Object.fromEntries(names.features.map((f: { id: string; properties: { name: string } }) => [f.id, f.properties.name])),
      labels: names.features.map((f: { id: string; geometry: { coordinates: number[] } }) => ({ id: f.id, ra: (f.geometry.coordinates[0] + 360) % 360, dec: f.geometry.coordinates[1] })),
    }));
  catalogPromise.catch(() => { catalogPromise = null; });
  return catalogPromise;
}

export interface SkyPainter {
  ctx: CanvasRenderingContext2D;
  P: (ra: number, dec: number) => [number, number];
  seam: (a: number, b: number) => boolean;
  text: (s: string, x: number, y: number, color: string, size: number, align?: CanvasTextAlign, weight?: number, spacing?: number) => void;
  pill: (s: string, x: number, y: number, fg: string, bg: string, size?: number) => void;
  polyline: (pts: [number, number][]) => void;
}

export function skyPainter(ctx: CanvasRenderingContext2D, raCenter: number): SkyPainter {
  const P = (ra: number, dec: number) => hammer(ra, dec, SKY_W, SKY_H, raCenter);
  const seam = (a: number, b: number) => crossesSeam(a, b, raCenter);
  const spaced = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  const text: SkyPainter["text"] = (s, x, y, color, size, align = "left", weight = 400, spacing = 0) => {
    ctx.fillStyle = color; ctx.font = `${weight} ${size}px 'DM Sans', Arial, sans-serif`; ctx.textAlign = align;
    spaced.letterSpacing = `${spacing}px`; ctx.fillText(s, x, y); spaced.letterSpacing = "0px";
  };
  const pill: SkyPainter["pill"] = (s, x, y, fg, bg, size = 12) => {
    ctx.font = `600 ${size}px 'DM Sans', Arial, sans-serif`;
    const w = ctx.measureText(s).width + 14, h = size + 8;
    ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2); ctx.fill();
    text(s, x, y + size * 0.36, fg, size, "center", 600);
  };
  // [ra, dec] pairs as one line, broken where it would cross the back seam of the oval.
  const polyline = (pts: [number, number][]) => {
    ctx.beginPath();
    pts.forEach(([ra, dec], k) => { const [x, y] = P(ra, dec); if (!k || seam(pts[k - 1][0], ra)) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
  };
  return { ctx, P, seam, text, pill, polyline };
}

/**
 * Deep space, the oval sky, Milky Way, equator + ecliptic, constellation figures (the current one glowing),
 * real stars and constellation names. Leaves the oval CLIP ACTIVE (one ctx.save): the caller draws its
 * own layers inside the sky, then calls ctx.restore().
 */
export function drawSkyBackdrop(p: SkyPainter, catalog: Catalog, raCenter: number, currentId: string | null | undefined, t: number): void {
  const { ctx, P, seam, text, polyline } = p, W = SKY_W, H = SKY_H;
  const sRad = Math.min((W - 40) / (4 * Math.SQRT2), (H - 40) / (2 * Math.SQRT2));
  const ex = 2 * Math.SQRT2 * sRad, ey = Math.SQRT2 * sRad;
  ctx.fillStyle = "#01030a"; ctx.fillRect(-W, -H, W * 3, H * 3);
  ctx.save();
  ctx.beginPath(); ctx.ellipse(W / 2, H / 2, ex, ey, 0, 0, Math.PI * 2);
  const bg = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, ex);
  bg.addColorStop(0, "#15224d"); bg.addColorStop(0.6, "#0b1534"); bg.addColorStop(1, "#060b1f");
  ctx.fillStyle = bg; ctx.fill();
  ctx.shadowColor = "#4f7cff66"; ctx.shadowBlur = 26; ctx.strokeStyle = "#6f93e066"; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.beginPath(); ctx.ellipse(W / 2, H / 2, ex, ey, 0, 0, Math.PI * 2); ctx.clip();

  // The Milky Way along the real galactic plane, brighter towards the galactic centre.
  for (const [width, alpha] of [[46, 0.035], [26, 0.05], [12, 0.07]] as const) {
    for (let l = 0; l < 360; l += 3) {
      const a = galacticToEquatorial(l, 0), b = galacticToEquatorial(l + 3, 0);
      if (seam(a[0], b[0])) continue;
      const [x1, y1] = P(a[0], a[1]), [x2, y2] = P(b[0], b[1]);
      const bright = 0.45 + 0.55 * (1 + Math.cos(l * Math.PI / 180)) / 2;
      ctx.strokeStyle = `rgba(190,205,255,${alpha * bright})`; ctx.lineWidth = width; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
  }
  { const g = galacticToEquatorial(0, 0), [gx, gy] = P(g[0], g[1]); text("MILKY WAY", gx, gy + 34, "#c9d6ff77", 10, "center", 600, 2.5); }

  // Reference lines: celestial equator and the ecliptic (where the Sun and planets travel).
  const eps = 23.44 * Math.PI / 180;
  const ecl = (ra: number) => Math.atan(Math.sin(ra * Math.PI / 180) * Math.tan(eps)) * 180 / Math.PI;
  const ring = (decOf: (ra: number) => number) => Array.from({ length: 181 }, (_, k) => [k * 2, decOf(k * 2)] as [number, number]);
  ctx.save(); ctx.setLineDash([3, 7]); ctx.lineWidth = 1;
  ctx.strokeStyle = "#ffffff26"; polyline(ring(() => 0)); ctx.stroke();
  ctx.strokeStyle = "#ffd16659"; polyline(ring(ecl)); ctx.stroke();
  ctx.restore();
  { const r = (raCenter + 120) % 360, [x, y] = P(r, ecl(r)); text("ECLIPTIC · PATH OF THE SUN AND PLANETS", x, y - 8, "#ffd16699", 9, "center", 600, 1.5); }

  // Constellation figures, the current one glowing.
  for (const f of catalog.lines) {
    const on = f.id === currentId;
    ctx.save();
    ctx.strokeStyle = on ? "#a9dcff" : "#7d9be055"; ctx.lineWidth = on ? 1.8 : 0.9;
    if (on) { ctx.shadowColor = "#7fc8ff"; ctx.shadowBlur = 8; }
    for (const line of f.geometry.coordinates) { polyline(line.map(([lon, lat]) => [(lon + 360) % 360, lat] as [number, number])); ctx.stroke(); }
    ctx.restore();
  }
  // Real stars: size by brightness, a soft halo on the brightest, a gentle twinkle.
  catalog.stars.forEach((st, k) => {
    const [x, y] = P(st.ra, st.dec);
    const base = Math.max(0.7, 3 - st.mag * 0.6), r = base * (1 + 0.12 * Math.sin(t * 2.1 + k * 1.7));
    if (st.mag < 1.6) {
      const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 5); halo.addColorStop(0, "#ffffff55"); halo.addColorStop(1, "#ffffff00");
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, r * 5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = Math.min(1, 0.55 + (4 - st.mag) * 0.12); ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  });
  // Constellation names in small capitals, the current one bright.
  for (const l of catalog.labels) {
    const [x, y] = P(l.ra, l.dec), on = l.id === currentId, name = (catalog.names[l.id] ?? l.id).toUpperCase();
    if (on) text(name, x, y, "#d4ecff", 15, "center", 600, 2.5);
    else text(name, x, y, "#a8bde670", 8.5, "center", 500, 1.2);
  }
}

/** Constellation id for a display name (the IAU boundaries give names; the figures use ids). */
export const constellationId = (catalog: Catalog, name: string | null) =>
  name ? Object.entries(catalog.names).find(([, n]) => n === name)?.[0] ?? null : null;
