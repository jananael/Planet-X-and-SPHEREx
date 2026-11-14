"use client";
// "Simple explanation": the object's path through the REAL night sky, year by year.
// Stars: 493 named Hipparcos stars; lines and IAU boundaries: d3-celestial (public/skytrace/catalogs).
// Path: JPL Horizons. SPHEREx flashes: real exposure dates. No decorative or invented stars.
import { useEffect, useMemo, useRef, useState } from "react";
import { positionAt, type JourneyData } from "../lib/journey";
import { duringVisit, isFuture, phaseAt, project, skyCaption, timeline, todayIso, yearsOf } from "../lib/sky-story";
import { skyRegion, type SkyFeature } from "../lib/sky-navigation";
import "./explain-player.css";

const W = 960, H = 480, K = 2; // whole sky (360° x 180°, 2:1), drawn at 2x for a sharp full-screen view
type Star = { name: string; ra: number; dec: number; mag: number };
type Catalog = { stars: Star[]; lines: SkyFeature[]; bounds: SkyFeature[]; names: Record<string, string>; labels: { id: string; ra: number; dec: number }[] };

let catalogPromise: Promise<Catalog> | null = null;
function loadCatalog(): Promise<Catalog> {
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
  const [decMin, decMax] = [-90, 90]; // the whole sky, pole to pole
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
    const P = (ra: number, dec: number) => project(ra, dec, W, H, decMin, decMax, raCenter);
    const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, "#020613"); sky.addColorStop(1, "#0a1230");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    const text = (s: string, x: number, y: number, color: string, size: number, align: CanvasTextAlign = "left", weight = 400) => {
      ctx.fillStyle = color; ctx.font = `${weight} ${size}px 'DM Sans', Arial, sans-serif`; ctx.textAlign = align; ctx.fillText(s, x, y);
    };
    const currentId = current ? Object.entries(catalog.names).find(([, n]) => n === current)?.[0] : null;

    // Reference lines: celestial equator and the ecliptic (where the Sun and planets travel).
    const curve = (decOf: (ra: number) => number, color: string, label: string, labelRa: number) => {
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash([6, 6]); ctx.beginPath();
      for (let ra = 0, first = true, prevX = 0; ra <= 360; ra += 2) {
        const [x, y] = P(ra % 360, decOf(ra));
        if (first || Math.abs(x - prevX) > W / 2) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        first = false; prevX = x;
      }
      ctx.stroke(); ctx.restore();
      const [lx, ly] = P(labelRa, decOf(labelRa)); text(label, lx, ly - 6, color, 11, "center");
    };
    curve(() => 0, "#ffffff33", "celestial equator", (raCenter + 150) % 360);
    const eps = 23.44 * Math.PI / 180;
    curve(ra => Math.atan(Math.sin(ra * Math.PI / 180) * Math.tan(eps)) * 180 / Math.PI, "#ffd16655", "ecliptic: path of the Sun and planets", (raCenter + 100) % 360);
    // Constellation figures (break lines that wrap around the edges).
    for (const f of catalog.lines) {
      const highlight = f.id === currentId;
      ctx.strokeStyle = highlight ? "#7fc8ffee" : "#6f93d677"; ctx.lineWidth = highlight ? 2 : 1;
      for (const line of f.geometry.coordinates) {
        ctx.beginPath();
        line.forEach(([lon, lat], i) => {
          const [x, y] = P((lon + 360) % 360, lat);
          const prev = i ? P((line[i - 1][0] + 360) % 360, line[i - 1][1]) : null;
          if (!prev || Math.abs(x - prev[0]) > W / 2) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }
    }
    // Real stars, size by brightness.
    for (const s of catalog.stars) {
      if (s.dec < decMin - 2 || s.dec > decMax + 2) continue;
      const [x, y] = P(s.ra, s.dec), r = Math.max(0.8, 3.2 - s.mag * 0.6);
      ctx.fillStyle = "#ffffffd9"; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    // Constellation names.
    for (const l of catalog.labels) {
      if (l.dec < decMin || l.dec > decMax) continue;
      const [x, y] = P(l.ra, l.dec), on = l.id === currentId;
      text(catalog.names[l.id] ?? l.id, x, y, on ? "#bfe6ff" : "#9fb8e099", on ? 17 : 11, "center", on ? 600 : 400);
    }

    // The object's path: finished years dimmer, the current year drawn up to now.
    const upto = phase.kind === "intro" ? -1 : phase.kind === "outro" ? years.length : phase.index;
    years.forEach((seg, i) => {
      if (i > upto) return;
      const pts = i === upto && phase.kind === "year" ? seg.points.slice(0, Math.max(2, Math.ceil(seg.points.length * phase.progress))) : seg.points;
      const alpha = i === upto ? 1 : Math.max(0.25, 0.7 - (upto - i) * 0.08);
      // Past (up to today): solid. Future: dotted and fainter, it is a prediction.
      for (const future of [false, true]) {
        ctx.save();
        ctx.strokeStyle = future ? `rgba(200,220,255,${alpha * 0.75})` : `rgba(255,209,102,${alpha})`;
        ctx.lineWidth = i === upto ? 3.5 : 2.5;
        if (future) ctx.setLineDash([2, 6]);
        ctx.beginPath();
        let open = false;
        pts.forEach((p, k) => {
          // The dotted (future) line also takes the last past point, so the two lines join at "today".
          const include = future ? isFuture(p[0], today) || (k + 1 < pts.length && isFuture(pts[k + 1][0], today)) : !isFuture(p[0], today);
          if (!include) { open = false; return; }
          const [x, y] = P(p[1], p[2]); const prev = k ? P(pts[k - 1][1], pts[k - 1][2]) : null;
          if (!open || !prev || Math.abs(x - prev[0]) > W / 2) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          open = true;
        });
        ctx.stroke(); ctx.restore();
      }
      const [lx, ly] = P(seg.points[0][1], seg.points[0][2]);
      const predicted = isFuture(seg.points[0][0], today);
      text(predicted ? `${seg.year} · predicted` : String(seg.year), lx, ly - 10,
        predicted ? (i === upto ? "#dce8ff" : "#c8dcff88") : (i === upto ? "#ffe2a0" : "#ffd16699"), i === upto ? 15 : 12, "center", 600);
      // SPHEREx moments in this year (only the ones already reached).
      const reached = pts[pts.length - 1][0];
      for (const e of data.spherex_exposures) {
        if (!e.utc.startsWith(String(seg.year)) || e.utc.slice(0, 10) > reached) continue;
        const p = positionAt(seg.points, e.utc); if (!p) continue;
        const [x, y] = P(p[0], p[1]);
        ctx.fillStyle = "#5bc0de"; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
      }
    });
    // "Today": where the object is now, the border between what happened and what is predicted.
    const drawnUntil = phase.kind === "outro" ? years[years.length - 1]?.points.at(-1)?.[0] : nowPoint?.[0];
    if (drawnUntil && !isFuture(today, drawnUntil)) {
      const p = positionAt(track, today);
      if (p) {
        const [x, y] = P(p[0], p[1]);
        ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.lineTo(x, y - 30); ctx.stroke();
        const label = `Today · ${new Date(today + "T00:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })}`;
        ctx.fillStyle = "#020613dd"; ctx.fillRect(x - 58, y - 52, 116, 20);
        text(label, x, y - 37, "#ffffff", 13, "center", 600);
      }
    }
    // The object itself.
    if (phase.kind !== "intro") {
      const seg = years[Math.min(upto, years.length - 1)];
      const pts = phase.kind === "year" ? seg.points.slice(0, Math.max(2, Math.ceil(seg.points.length * phase.progress))) : seg.points;
      const last = pts[pts.length - 1], [x, y] = P(last[1], last[2]);
      const glow = ctx.createRadialGradient(x, y, 0, x, y, 16); glow.addColorStop(0, "#fff3c4"); glow.addColorStop(1, "#ffd16600");
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
      text(data.target.name, x + 14, y + 4, "#ffe2a0", 13, "left", 600);
      if (duringVisit(data, last[0])) {
        ctx.strokeStyle = "#5bc0de"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 22 + 4 * Math.sin(t * 8), 0, Math.PI * 2); ctx.stroke();
        text("📷 SPHEREx", x, y - 28, "#9fe3f5", 13, "center", 600);
      }
    }
    // Headline.
    ctx.fillStyle = "#020613cc"; ctx.fillRect(12, 12, 300, 54);
    const headlineFuture = !!nowPoint && isFuture(nowPoint[0], today) && phase.kind === "year";
    text(year !== null && phase.kind !== "intro" ? (headlineFuture ? `${year} · prediction` : String(year)) : "The night sky", 24, 46,
      headlineFuture ? "#dce8ff" : "#f3f2fb", headlineFuture ? 22 : 26, "left", 600);
    if (current) text(`in ${current}`, 300, 46, "#bfe6ff", 15, "right");
    text("Real stars (Hipparcos) · path: JPL Horizons · solid = past, dotted = predicted · east to the left", W - 14, H - 12, "#8aa6d6aa", 11, "right");
  }, [t, catalog, years, phase.kind, phase.index, phase.progress, decMin, decMax, raCenter, current, data, year, today, track, nowPoint]);
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
