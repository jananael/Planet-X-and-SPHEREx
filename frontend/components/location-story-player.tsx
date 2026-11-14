"use client";
// "Simple explanation" for ANY location: the real night sky, where this patch is (constellation, Milky Way),
// when SPHEREx photographed it (real search results), in what light, and what to look for in the images.
// Same real sky as the Vesta story (components/sky-backdrop.ts). Nothing is invented: no change is claimed.
import { useEffect, useMemo, useRef, useState } from "react";
import { galaxyZone, locationCaption, locationScenes, sceneAt, starMotion, storyWavelength, visitSummaries, type LocationFacts } from "../lib/location-story";
import { skyRegion } from "../lib/sky-navigation";
import type { Coordinates, Observation, Target } from "../lib/types";
import { constellationId, drawSkyBackdrop, loadCatalog, skyPainter, SKY_H as H, SKY_K as K, SKY_W as W, type Catalog } from "./sky-backdrop";
import "./explain-player.css";

const ZOOM = 2.2;
const ease = (x: number) => x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
const TITLES = { sky: "The night sky", locate: "Your patch", visits: "SPHEREx visits", light: "Infrared light", motion: "A moving star", compare: "Your turn" } as const;

export function LocationStoryPlayer({ point, name, observations, band, wavelengthUm, target, onClose }: {
  point: Coordinates; name: string | null; observations: Observation[]; band: string; wavelengthUm: number | null; target: Target | null; onClose: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const motion = useMemo(() => starMotion(target), [target]);
  const scenes = useMemo(() => locationScenes(!!motion), [motion]);
  const total = scenes.reduce((s, x) => s + x.seconds, 0);
  const scene = sceneAt(scenes, t);
  const visits = useMemo(() => visitSummaries(observations), [observations]);
  const constellation = useMemo(() => catalog ? skyRegion(point, catalog.bounds, catalog.names) : null, [catalog, point]);
  const facts: LocationFacts = useMemo(() => ({
    point, name, constellation, zone: galaxyZone(point.ra, point.dec), visits, images: observations.length, band, wavelengthUm, target,
  }), [point, name, constellation, visits, observations.length, band, wavelengthUm, target]);

  useEffect(() => { loadCatalog().then(setCatalog, e => setError(String(e))); }, []);
  useEffect(() => {
    if (!playing || !catalog) return;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      setT(prev => { const next = prev + (now - last) / 1000; if (next >= total) { setPlaying(false); return total; } return next; });
      last = now; raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, catalog, total]);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx || !catalog) return;
    const raCenter = point.ra;
    const painter = skyPainter(ctx, raCenter), { P, text, pill } = painter;
    const [px, py] = P(point.ra, point.dec);
    // Camera: whole sky first, then a smooth zoom onto the patch, kept for the rest of the story.
    const f = scene.name === "sky" ? 0 : scene.name === "locate" ? ease(Math.min(1, scene.progress * 1.6)) : 1;
    const z = 1 + (ZOOM - 1) * f, cx = W / 2 + (px - W / 2) * f, cy = H / 2 + (py - H / 2) * f;
    ctx.setTransform(K * z, 0, 0, K * z, K * (W / 2 - z * cx), K * (H / 2 - z * cy));
    drawSkyBackdrop(painter, catalog, raCenter, constellationId(catalog, constellation), t);

    // The patch: a pulsing ring and crosshair, constant size on screen.
    if (scene.name !== "sky") {
      const r = (11 + 3 * Math.sin(t * 4)) / z, s = 1 / z;
      ctx.save(); ctx.strokeStyle = "#ffd166"; ctx.lineWidth = 2 * s; ctx.shadowColor = "#ffb84d"; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.stroke();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.beginPath(); ctx.moveTo(px + dx * 16 * s, py + dy * 16 * s); ctx.lineTo(px + dx * 24 * s, py + dy * 24 * s); ctx.stroke(); }
      ctx.restore();
      ctx.save(); ctx.translate(px, py); ctx.scale(s, s);
      text(name ?? "Your patch of sky", 30, 5, "#fff1c2", 14, "left", 600);
      // SPHEREx visits: one flash per visit, in order, during the visits scene.
      if (scene.name === "visits" && visits.length) {
        const k = Math.min(visits.length - 1, Math.floor(scene.progress * visits.length * 1.15));
        const local = (scene.progress * visits.length * 1.15) % 1;
        ctx.strokeStyle = `rgba(143,227,255,${1 - local})`; ctx.lineWidth = 2.5; ctx.shadowColor = "#5bc0de"; ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.arc(0, 0, 14 + 30 * local, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0;
        pill(`📷 ${visits[k].label}`, 0, -40, "#04202a", "#8fe3ff", 12);
      }
      // A moving star: direction of its catalogue proper motion (east to the left), arrow not to scale.
      if (scene.name === "motion" && motion && target?.catalog_motion) {
        const { pm_ra_cosdec_mas_yr: e, pm_dec_mas_yr: n } = target.catalog_motion, len = Math.hypot(e, n);
        const grow = ease(scene.progress), L = 60 * grow, ux = -e / len, uy = -n / len;
        ctx.strokeStyle = "#ffd166"; ctx.fillStyle = "#ffd166"; ctx.lineWidth = 3; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(ux * 20, uy * 20); ctx.lineTo(ux * (20 + L), uy * (20 + L)); ctx.stroke();
        const hx = ux * (24 + L), hy = uy * (24 + L), a = Math.atan2(uy, ux);
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx - 10 * Math.cos(a - 0.45), hy - 10 * Math.sin(a - 0.45)); ctx.lineTo(hx - 10 * Math.cos(a + 0.45), hy - 10 * Math.sin(a + 0.45)); ctx.closePath(); ctx.fill();
        pill(`${motion.perYear.toFixed(1)}″ a year · arrow not to scale`, ux * (50 + L), uy * (50 + L) - 16, "#1a1206", "#ffd166", 11);
      }
      ctx.restore();
    }
    ctx.restore(); // end of the oval clip

    // Screen-space layers.
    ctx.setTransform(K, 0, 0, K, 0, 0);
    ctx.fillStyle = "#050a1ccc"; ctx.beginPath(); ctx.roundRect(14, 14, 250, 62, 12); ctx.fill();
    text(TITLES[scene.name], 28, 54, "#ffffff", 26, "left", 700);
    if (constellation && scene.name !== "sky") { text("IN FRONT OF", W - 28, 36, "#9fb8e0", 9, "right", 600, 2); text(constellation, W - 28, 58, "#d4ecff", 18, "right", 600); }

    const panel = (h: number) => { ctx.fillStyle = "#050a1ce6"; ctx.beginPath(); ctx.roundRect(60, H - 30 - h, W - 120, h, 12); ctx.fill(); };
    if ((scene.name === "visits" || scene.name === "compare") && visits.length) {
      // Timeline of the real SPHEREx visits, appearing one by one.
      panel(64);
      const y0 = Number(visits[0].from.slice(0, 4)), y1 = Number(visits[visits.length - 1].to.slice(0, 4)) + 1;
      const x = (iso: string) => { const d = new Date(iso), yr = d.getUTCFullYear() + (d.getUTCMonth() + d.getUTCDate() / 31) / 12; return 90 + (yr - y0) / (y1 - y0) * (W - 180); };
      const ly = H - 70;
      ctx.strokeStyle = "#8aa6d6aa"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(90, ly); ctx.lineTo(W - 90, ly); ctx.stroke();
      for (let yr = y0; yr <= y1; yr++) { const tx = 90 + (yr - y0) / (y1 - y0) * (W - 180); ctx.fillStyle = "#8aa6d6"; ctx.fillRect(tx - 0.5, ly - 5, 1, 10); text(String(yr), tx, ly + 20, "#8aa6d6", 10, "center", 600); }
      const shown = scene.name === "compare" ? visits.length : Math.min(visits.length, Math.floor(scene.progress * visits.length * 1.15) + 1);
      visits.slice(0, shown).forEach((v, i) => {
        const vx = x(v.from);
        ctx.save(); ctx.fillStyle = "#8fe3ff"; ctx.shadowColor = "#5bc0de"; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(vx, ly, 6, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        text(`${v.label} · ${v.images} ${v.images === 1 ? "picture" : "pictures"}`, vx, ly - 14 - (i % 2) * 14, "#d4ecff", 10, "center", 600);
      });
      text("REAL SPHEREx VISITS (NASA/IPAC IRSA)", 90, H - 84, "#9fb8e0", 8.5, "left", 600, 2);
    }
    if (scene.name === "light") {
      // Where this light sits: the colours the eye sees (0.4-0.7 µm) versus SPHEREx's infrared (0.75-5 µm).
      panel(70);
      const um = storyWavelength(band, wavelengthUm)?.um ?? null;
      const x0 = 90, x1 = W - 90, X = (u: number) => x0 + (u - 0.3) / (5.1 - 0.3) * (x1 - x0), by = H - 76;
      const rainbow = ctx.createLinearGradient(X(0.4), 0, X(0.7), 0);
      ["#7b3cff", "#3c6cff", "#2fd07a", "#ffe23c", "#ff8a2a", "#ff2a2a"].forEach((c, i, a) => rainbow.addColorStop(i / (a.length - 1), c));
      ctx.fillStyle = rainbow; ctx.fillRect(X(0.4), by, X(0.7) - X(0.4), 14);
      const ir = ctx.createLinearGradient(X(0.75), 0, X(5), 0); ir.addColorStop(0, "#5a1a2a"); ir.addColorStop(1, "#1b1030");
      ctx.fillStyle = ir; ctx.fillRect(X(0.75), by, X(5) - X(0.75), 14);
      text("WHAT OUR EYES SEE", (X(0.4) + X(0.7)) / 2, by + 30, "#d4ecff", 9, "center", 600, 1);
      text("INFRARED: WHAT SPHEREx SEES (INVISIBLE TO US)", (X(0.75) + X(5)) / 2, by + 30, "#d4ecff", 9, "center", 600, 1);
      for (const u of [1, 2, 3, 4, 5]) text(`${u} µm`, X(u), by - 6, "#8aa6d6", 9, "center", 500);
      if (um !== null) {
        const mx = X(um), g = ease(Math.min(1, scene.progress * 2));
        ctx.save(); ctx.strokeStyle = "#ffd166"; ctx.lineWidth = 2.5; ctx.shadowColor = "#ffb84d"; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.moveTo(mx, by - 4 - 18 * g); ctx.lineTo(mx, by + 18); ctx.stroke(); ctx.restore();
        pill(`these pictures · ${um.toFixed(2)} µm`, mx, by - 30 * g - 6, "#1a1206", "#ffd166", 11);
      }
    }
    text("Real stars (Hipparcos) · constellations: IAU boundaries · dates and wavelengths: the SPHEREx images found here · east to the left",
      W / 2, H - 6, "#8aa6d699", 9.5, "center");
  }, [t, catalog, scene.name, scene.progress, point, constellation, name, visits, motion, target, band, wavelengthUm]);

  return (
    <section className="explain-player" aria-label={`Where ${name ?? "this patch of sky"} is, and when SPHEREx photographed it`}>
      <div className="explain-badge">Real stars and constellations · SPHEREx dates and wavelengths from the images found here</div>
      {error && <div className="notice error" role="alert">The star map could not load: {error}</div>}
      <div ref={frame} className="sky-story-frame">
        <canvas ref={canvas} width={W * K} height={H * K} className="explain-canvas sky-story-canvas" role="img"
          aria-label={`${TITLES[scene.name]}${constellation ? `, in front of ${constellation}` : ""}`} />
      </div>
      <p className="explain-caption" aria-live="polite">{locationCaption(scene.name, facts)}</p>
      <div className="explain-controls">
        <button type="button" onClick={() => { const el = frame.current; if (!el) return; if (document.fullscreenElement) void document.exitFullscreen(); else void el.requestFullscreen?.(); }}>⛶ Full screen</button>
        <button type="button" onClick={() => { if (t >= total) { setT(0); setPlaying(true); } else setPlaying(p => !p); }}>
          {t >= total ? "Replay" : playing ? "Pause" : "Play"}
        </button>
        <input type="range" min={0} max={total} step={0.1} value={t} aria-label="Seek in the story"
          onChange={event => { setPlaying(false); setT(Number(event.target.value)); }} style={{ width: 220 }} />
        <span className="explain-progress">{Math.floor(t)}s / {Math.round(total)}s</span>
        <button type="button" className="explain-close" onClick={onClose}>Back to scientific view</button>
      </div>
    </section>
  );
}
