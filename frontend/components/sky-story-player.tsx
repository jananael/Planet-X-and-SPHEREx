"use client";
// "Simple explanation": the object's path through the REAL night sky, year by year.
// Stars: 493 named Hipparcos stars; lines and IAU boundaries: d3-celestial (public/skytrace/catalogs).
// Path: JPL Horizons. SPHEREx flashes: real exposure dates. No decorative or invented stars.
import { useEffect, useMemo, useRef, useState } from "react";
import { positionAt, type JourneyData } from "../lib/journey";
import { duringVisit, isFuture, phaseAt, skyCaption, timeline, todayIso, yearsOf } from "../lib/sky-story";
import { skyRegion } from "../lib/sky-navigation";
import { constellationId, drawSkyBackdrop, loadCatalog, skyPainter, SKY_H as H, SKY_K as K, SKY_W as W, type Catalog } from "./sky-backdrop";
import "./explain-player.css";

export function SkyStoryPlayer({ data, onClose }: { data: JourneyData; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const today = useMemo(() => todayIso(), []);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const track = data.sky_years?.length ? data.sky_years : data.sky_track;
  const years = useMemo(() => yearsOf(track), [track]);
  const tl = useMemo(() => timeline(years.length), [years.length]);
  const raCenter = useMemo(() => {
    const x = track.reduce((s, p) => s + Math.cos(p[1] * Math.PI / 180), 0), y = track.reduce((s, p) => s + Math.sin(p[1] * Math.PI / 180), 0);
    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
  }, [track]);
  const regionAt = useMemo(() => {
    if (!catalog) return (_ra: number, _dec: number) => null as string | null;
    const cache = new Map<string, string | null>();
    return (ra: number, dec: number) => {
      const key = `${ra.toFixed(1)},${dec.toFixed(1)}`;
      if (!cache.has(key)) cache.set(key, skyRegion({ ra, dec }, catalog.bounds, catalog.names));
      return cache.get(key)!;
    };
  }, [catalog]);
  const phase = phaseAt(t, tl, years.length);
  // Where the object is right now (the last point drawn), and the constellation behind it.
  const nowPoint = useMemo(() => {
    if (phase.kind === "intro" || !years.length) return null;
    const seg = years[Math.min(phase.index, years.length - 1)];
    const pts = phase.kind === "year" ? seg.points.slice(0, Math.max(2, Math.ceil(seg.points.length * phase.progress))) : seg.points;
    return pts[pts.length - 1];
  }, [phase.kind, phase.index, phase.progress, years]);
  const current = nowPoint ? regionAt(nowPoint[1], nowPoint[2]) : null;
  const year = phase.kind === "year" ? years[phase.index]?.year ?? null : phase.kind === "outro" ? years[years.length - 1]?.year ?? null : null;

  useEffect(() => { loadCatalog().then(setCatalog, e => setError(String(e))); }, []);
  useEffect(() => {
    if (!playing || !catalog) return;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      setT(prev => { const next = prev + (now - last) / 1000; if (next >= tl.total) { setPlaying(false); return tl.total; } return next; });
      last = now; raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, catalog, tl.total]);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx || !catalog) return;
    ctx.setTransform(K, 0, 0, K, 0, 0);
    const painter = skyPainter(ctx, raCenter), { P, seam, text, pill, polyline } = painter;
    drawSkyBackdrop(painter, catalog, raCenter, constellationId(catalog, current), t);

    // The object's path: past solid and glowing, future dotted (a prediction).
    const upto = phase.kind === "intro" ? -1 : phase.kind === "outro" ? years.length : phase.index;
    years.forEach((seg, i) => {
      if (i > upto) return;
      const pts = i === upto && phase.kind === "year" ? seg.points.slice(0, Math.max(2, Math.ceil(seg.points.length * phase.progress))) : seg.points;
      const alpha = i === upto ? 1 : Math.max(0.3, 0.75 - (upto - i) * 0.08);
      for (const future of [false, true]) {
        // The dotted part also takes the last past point, so both lines meet at "today".
        const part = pts.filter((p, k) => future ? isFuture(p[0], today) || (k + 1 < pts.length && isFuture(pts[k + 1][0], today)) : !isFuture(p[0], today));
        if (part.length < 2) continue;
        ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
        if (future) { ctx.setLineDash([1, 7]); ctx.strokeStyle = `rgba(214,228,255,${alpha * 0.85})`; ctx.lineWidth = i === upto ? 3 : 2.2; }
        else { ctx.strokeStyle = `rgba(255,209,102,${alpha})`; ctx.lineWidth = i === upto ? 3.2 : 2.2; ctx.shadowColor = "#ffb84d"; ctx.shadowBlur = i === upto ? 10 : 4; }
        polyline(part.map(p => [p[1], p[2]] as [number, number])); ctx.stroke(); ctx.restore();
      }
      const [lx, ly] = P(seg.points[0][1], seg.points[0][2]);
      const predicted = isFuture(seg.points[0][0], today);
      pill(predicted ? `${seg.year} · predicted` : String(seg.year), lx, ly - 14, predicted ? "#0b1020" : "#1a1206",
        predicted ? (i === upto ? "#dce8ff" : "#dce8ff99") : (i === upto ? "#ffd166" : "#ffd16699"), i === upto ? 12 : 10);
      // SPHEREx moments already reached in this year.
      const reached = pts[pts.length - 1][0];
      for (const e of data.spherex_exposures) {
        if (!e.utc.startsWith(String(seg.year)) || e.utc.slice(0, 10) > reached) continue;
        const pos = positionAt(seg.points, e.utc); if (!pos) continue;
        const [x, y] = P(pos[0], pos[1]);
        ctx.save(); ctx.shadowColor = "#5bc0de"; ctx.shadowBlur = 8; ctx.fillStyle = "#8fe3ff";
        ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
    });
    // "Today": the border between what happened and what is predicted.
    const drawnUntil = phase.kind === "outro" ? years[years.length - 1]?.points.at(-1)?.[0] : nowPoint?.[0];
    if (drawnUntil && !isFuture(today, drawnUntil)) {
      const pos = positionAt(track, today);
      if (pos) {
        const [x, y] = P(pos[0], pos[1]);
        ctx.save(); ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.8; ctx.shadowColor = "#ffffff"; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(x, y, 6.5, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x, y - 24); ctx.stroke(); ctx.restore();
        const when = new Date(today + "T00:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).toUpperCase();
        pill(`TODAY · ${when}`, x, y - 34, "#0b1020", "#ffffffee", 11);
      }
    }
    // The object: a glowing body with a short tail along its path.
    if (phase.kind !== "intro") {
      const seg = years[Math.min(upto, years.length - 1)];
      const pts = phase.kind === "year" ? seg.points.slice(0, Math.max(2, Math.ceil(seg.points.length * phase.progress))) : seg.points;
      const tail = pts.slice(-7);
      tail.forEach((p, k) => {
        if (!k || seam(tail[k - 1][1], p[1])) return;
        const [x1, y1] = P(tail[k - 1][1], tail[k - 1][2]), [x2, y2] = P(p[1], p[2]);
        ctx.strokeStyle = `rgba(255,236,190,${(k / tail.length) * 0.9})`; ctx.lineWidth = 1 + k * 0.9; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      });
      const last = pts[pts.length - 1], [x, y] = P(last[1], last[2]);
      const glow = ctx.createRadialGradient(x, y, 0, x, y, 22);
      glow.addColorStop(0, "#ffffff"); glow.addColorStop(0.25, "#fff1c2"); glow.addColorStop(1, "#ffd16600");
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.fill();
      text(data.target.name, x + 16, y + 4, "#fff1c2", 13, "left", 600);
      if (duringVisit(data, last[0])) {
        ctx.save(); ctx.strokeStyle = "#8fe3ff"; ctx.lineWidth = 2; ctx.shadowColor = "#5bc0de"; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(x, y, 26 + 5 * Math.sin(t * 7), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        pill("📷 SPHEREx is photographing it", x, y - 40, "#04202a", "#8fe3ff", 11);
      }
    }
    ctx.restore(); // end of the oval clip

    // Headline card.
    const headlineFuture = !!nowPoint && isFuture(nowPoint[0], today) && phase.kind === "year";
    ctx.fillStyle = "#050a1ccc"; ctx.beginPath(); ctx.roundRect(14, 14, 250, 62, 12); ctx.fill();
    text(year !== null && phase.kind !== "intro" ? String(year) : "The night sky", 28, 52, headlineFuture ? "#dce8ff" : "#ffffff", 30, "left", 700);
    if (headlineFuture) text("PREDICTION", 28, 68, "#dce8ffaa", 9, "left", 600, 2);
    if (current) { text("IN FRONT OF", 250, 36, "#9fb8e0", 9, "right", 600, 2); text(current, 250, 56, "#d4ecff", 16, "right", 600); }
    text("Real stars (Hipparcos) · Milky Way along the galactic plane · path: JPL Horizons · solid = past, dotted = predicted · east to the left",
      W / 2, H - 6, "#8aa6d699", 9.5, "center");
  }, [t, catalog, years, phase.kind, phase.index, phase.progress, raCenter, current, data, year, today, track, nowPoint]);

  return (
    <section className="explain-player" aria-label={`${data.target.name} travelling through the night sky`}>
      <div className="explain-badge">Real stars and constellations · path from JPL Horizons · SPHEREx moments from real observations</div>
      {error && <div className="notice error" role="alert">The star map could not load: {error}</div>}
      <div ref={frame} className="sky-story-frame">
      <canvas ref={canvas} width={W * K} height={H * K} className="explain-canvas sky-story-canvas" role="img"
        aria-label={`${year ?? "Night sky"}${current ? `, ${data.target.name} in ${current}` : ""}`} />
      </div>
      <p className="explain-caption" aria-live="polite">{skyCaption(data, phase, year, current, nowPoint?.[0], today)}</p>
      <div className="explain-controls">
        <button type="button" onClick={() => { const el = frame.current; if (!el) return; if (document.fullscreenElement) void document.exitFullscreen(); else void el.requestFullscreen?.(); }}>⛶ Full screen</button>
        <button type="button" onClick={() => { if (t >= tl.total) { setT(0); setPlaying(true); } else setPlaying(p => !p); }}>
          {t >= tl.total ? "Replay" : playing ? "Pause" : "Play"}
        </button>
        <input type="range" min={0} max={tl.total} step={0.1} value={t} aria-label="Seek in the sky journey"
          onChange={event => { setPlaying(false); setT(Number(event.target.value)); }} style={{ width: 220 }} />
        <span className="explain-progress">{Math.floor(t)}s / {Math.round(tl.total)}s</span>
        <button type="button" className="explain-close" onClick={onClose}>Back to scientific view</button>
      </div>
    </section>
  );
}
