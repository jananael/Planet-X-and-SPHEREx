"use client";
// The object's journey, drawn from real data: its orbit around the Sun (JPL Horizons), its path across
// the sky, the moments SPHEREx photographed it (inventory), then the real SPHEREx images.
// Nothing is invented: no decorative stars, positions and dates all come from /api/journey and /api/explain.
import { useEffect, useMemo, useRef, useState } from "react";
import { caption, dateAt, formatMonth, positionAt, sceneAt, TOTAL_SECONDS, unwrapRa, visitAt, type JourneyData } from "../lib/journey";
import type { ExplainFacts } from "../lib/explain";
import type { BlinkFrame } from "../lib/types";
import "./explain-player.css";

const S = 640;
const AU_RADIUS = 5.6;
const COLORS = { object: "#ffd166", spherex: "#5bc0de", planet: "#7d8aa8", text: "#f3f2fb", muted: "#9aa3b5" };
const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

export function JourneyPlayer({ data, frames, facts, onClose }: { data: JourneyData; frames: BlinkFrame[]; facts: ExplainFacts | null; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const images = useRef(new Map<string, HTMLImageElement>());
  const [, setLoaded] = useState(0);
  const sky = useMemo(() => unwrapRa(data.sky_track), [data]);
  const object = data.bodies.find(b => b.kind === "object")!;
  const scene = sceneAt(t);
  const iso = scene.name === "orbit" ? dateAt(data, ease(scene.progress)) : data.window.end;

  useEffect(() => {
    for (const f of frames) {
      if (images.current.has(f.obs.id)) continue;
      const img = new Image(); img.onload = () => setLoaded(n => n + 1); img.src = f.url; images.current.set(f.obs.id, img);
    }
  }, [frames]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      setT(prev => { const next = prev + (now - last) / 1000; if (next >= TOTAL_SECONDS) { setPlaying(false); return TOTAL_SECONDS; } return next; });
      last = now; raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#03040a"; ctx.fillRect(0, 0, S, S);
    const label = (text: string, x: number, y: number, color = COLORS.text, size = 14, align: CanvasTextAlign = "left") => {
      ctx.fillStyle = color; ctx.font = `${size}px 'DM Sans', Arial, sans-serif`; ctx.textAlign = align; ctx.fillText(text, x, y);
    };

    if (scene.name === "orbit") {
      const k = (S / 2 - 24) / AU_RADIUS, cx = S / 2, cy = S / 2;
      const P = (x: number, y: number): [number, number] => [cx + x * k, cy - y * k];
      const line = (pts: [number, number][], color: string, width = 1, dash: number[] = []) => {
        if (pts.length < 2) return;
        ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.restore();
      };
      const sun = ctx.createRadialGradient(cx, cy, 0, cx, cy, 18); sun.addColorStop(0, "#fff6c8"); sun.addColorStop(1, "#ffb30000");
      ctx.fillStyle = sun; ctx.beginPath(); ctx.arc(cx, cy, 18, 0, Math.PI * 2); ctx.fill(); label("Sun", cx + 12, cy - 12, COLORS.muted, 12);
      for (const b of data.bodies) line(b.orbit.map(s => P(s[1], s[2])), b.kind === "object" ? "#ffd16655" : "#7d8aa855", 1, b.kind === "object" ? [5, 5] : []);
      const passed = object.track.filter(s => s[0] <= iso);
      line(passed.map(s => P(s[1], s[2])), COLORS.object, 2.5);
      for (const e of data.spherex_exposures) {
        if (e.utc.slice(0, 10) > iso) break;
        const p = positionAt(object.track, e.utc); if (!p) continue;
        const [x, y] = P(p[0], p[1]); ctx.fillStyle = COLORS.spherex; ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      }
      const visit = visitAt(data, iso);
      const earth = data.bodies.find(b => b.name === "Earth");
      const ep = earth && positionAt(earth.track, iso), op = positionAt(object.track, iso);
      if (visit && ep && op) {
        const [ex, ey] = P(ep[0], ep[1]), [ox, oy] = P(op[0], op[1]);
        ctx.save(); ctx.strokeStyle = COLORS.spherex; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ox, oy); ctx.stroke(); ctx.restore();
        ctx.strokeStyle = COLORS.spherex; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ox, oy, 10 + 4 * Math.sin(t * 6), 0, Math.PI * 2); ctx.stroke();
        label("SPHEREx is looking", (ex + ox) / 2 + 6, (ey + oy) / 2, COLORS.spherex, 12);
      }
      for (const b of data.bodies) {
        const p = positionAt(b.track, iso); if (!p) continue;
        const [x, y] = P(p[0], p[1]);
        ctx.fillStyle = b.kind === "object" ? COLORS.object : b.name === "Earth" ? "#4ea7ff" : b.name === "Mars" ? "#ff7b54" : "#d9b38c";
        ctx.beginPath(); ctx.arc(x, y, b.kind === "object" ? 5 : 4, 0, Math.PI * 2); ctx.fill();
        label(b.kind === "object" ? data.target.name : b.name, x + 8, y - 6, b.kind === "object" ? COLORS.object : COLORS.muted, b.kind === "object" ? 14 : 12);
      }
      label(formatMonth(iso), 18, 30, COLORS.text, 20);
      label("Solar System seen from above · positions: JPL Horizons", 18, 50, COLORS.muted, 11);
    }

    if (scene.name === "sky") {
      const ra = sky.map(s => s[1]), dec = sky.map(s => s[2]);
      const [r0, r1, d0, d1] = [Math.min(...ra), Math.max(...ra), Math.min(...dec), Math.max(...dec)];
      const span = Math.max(r1 - r0, (d1 - d0) * 1.0, 1) * 1.15, mr = (r0 + r1) / 2, md = (d0 + d1) / 2, k = (S - 80) / span;
      const P = (r: number, d: number): [number, number] => [S / 2 - (r - mr) * k, S / 2 - (d - md) * k]; // east (higher RA) to the left
      ctx.strokeStyle = "#ffffff12"; ctx.lineWidth = 1;
      for (let g = Math.ceil((mr - span) / 10) * 10; g <= mr + span; g += 10) { const [x] = P(g, md); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S); ctx.stroke(); }
      for (let g = Math.ceil((md - span) / 10) * 10; g <= md + span; g += 10) { const [, y] = P(mr, g); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke(); }
      const upto = Math.max(2, Math.round(sky.length * ease(scene.progress)));
      ctx.strokeStyle = COLORS.object; ctx.lineWidth = 2.5; ctx.beginPath();
      sky.slice(0, upto).forEach((s, i) => { const [x, y] = P(s[1], s[2]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke();
      const lastDate = sky[upto - 1][0];
      for (const e of data.spherex_exposures) {
        if (e.utc.slice(0, 10) > lastDate) break;
        const p = positionAt(sky, e.utc); if (!p) continue;
        const [x, y] = P(p[0], p[1]); ctx.fillStyle = COLORS.spherex; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
      }
      const [sx, sy] = P(sky[0][1], sky[0][2]); label(formatMonth(sky[0][0]), sx + 6, sy - 8, COLORS.muted, 12);
      if (scene.progress > 0.95) { const e = sky[sky.length - 1]; const [x, y] = P(e[1], e[2]); label(formatMonth(e[0]), x + 6, y - 8, COLORS.muted, 12); }
      label("Path across the sky, seen from Earth", 18, 30, COLORS.text, 18);
      label("RA / Dec grid every 10° · east to the left · blue dots: SPHEREx exposures", 18, 50, COLORS.muted, 11);
    }

    if (scene.name === "images") {
      const shown = facts?.frames ?? [];
      const n = shown.length;
      const i = n ? Math.min(n - 1, Math.floor(scene.progress * n * 2) % n) : 0;
      const f = shown[i], img = f && images.current.get(f.observation_id);
      if (img?.complete && img.naturalWidth) { ctx.imageSmoothingEnabled = false; ctx.drawImage(img, 0, 0, S, S); }
      else label("Loading the real image…", S / 2, S / 2, COLORS.muted, 14, "center");
      const ring = (x: number, y: number, alpha: number, dash: boolean) => {
        ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = COLORS.object; ctx.lineWidth = 3; if (dash) ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.arc(x * S, y * S, S * 0.06, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      };
      shown.slice(0, i).forEach(p => { if (p.inside && p.x !== null && p.y !== null) ring(p.x, p.y, 0.5, true); });
      if (f?.inside && f.x !== null && f.y !== null) ring(f.x, f.y, 1, false);
      if (f) {
        ctx.fillStyle = "#03040acc"; ctx.fillRect(10, 10, 360, 50);
        label("REAL SPHEREx IMAGE", 20, 30, COLORS.spherex, 12);
        label(`${f.obs_time.replace("T", " ").slice(0, 16)} UTC · ${f.band} · ${f.release}`, 20, 50, COLORS.text, 14);
      }
    }

    if (scene.name === "end") {
      label(data.target.name, S / 2, S / 2 - 50, COLORS.object, 30, "center");
      label("Real data. Real motion.", S / 2, S / 2 - 10, COLORS.text, 20, "center");
      label("A known object, not a discovery.", S / 2, S / 2 + 20, COLORS.muted, 16, "center");
      data.sources.forEach((s, i) => label(s, S / 2, S / 2 + 70 + i * 18, COLORS.muted, 11, "center"));
    }
  }, [t, scene.name, scene.progress, iso, data, sky, object, facts]);

  const motion = facts ? { hours: facts.elapsed_hours, arcsec: facts.displacement_arcsec, pixels: facts.displacement_pixels, direction: facts.direction } : undefined;
  return (
    <section className="explain-player" aria-label={`The journey of ${data.target.name}`}>
      <div className="explain-badge">Real data · JPL Horizons orbit + NASA SPHEREx images · animated journey</div>
      <canvas ref={canvas} width={S} height={S} className="explain-canvas" role="img"
        aria-label={`${scene.name === "orbit" ? "Orbit around the Sun" : scene.name === "sky" ? "Path across the sky" : scene.name === "images" ? "Real SPHEREx images" : "Credits"}, ${formatMonth(iso)}`} />
      <p className="explain-caption" aria-live="polite">{caption(data, scene.name, iso, motion)}</p>
      <div className="explain-controls">
        <button type="button" onClick={() => { if (t >= TOTAL_SECONDS) { setT(0); setPlaying(true); } else setPlaying(p => !p); }}>
          {t >= TOTAL_SECONDS ? "Replay" : playing ? "Pause" : "Play"}
        </button>
        <input type="range" min={0} max={TOTAL_SECONDS} step={0.1} value={t} aria-label="Seek in the journey"
          onChange={event => { setPlaying(false); setT(Number(event.target.value)); }} style={{ width: 220 }} />
        <span className="explain-progress">{Math.floor(t)}s / {TOTAL_SECONDS}s</span>
        <button type="button" className="explain-close" onClick={onClose}>Back to scientific view</button>
      </div>
    </section>
  );
}
