"use client";
// Learning lab on REAL data for one sky location: the last place explored in the Explorer, typed RA/Dec,
// or a demo target. Views: 3D stars (Gaia DR3 parallaxes via NASA IRSA), wavelength coverage, the real
// SPHEREx image, the same spot in all six detectors, and the real visit timeline. Nothing is simulated.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE, errorMessage, getJson } from "../lib/api";
import { groupVisits } from "../lib/observations";
import type { Observation, Target } from "../lib/types";
import "./visualization-workspace.css";

type Mode = "space" | "spectrum" | "image" | "bands" | "time";
const MODES: { id: Mode; label: string; icon: string }[] = [
  { id: "space", label: "3D stars", icon: "◉" }, { id: "spectrum", label: "Spectrum", icon: "⌁" },
  { id: "image", label: "Image", icon: "▧" }, { id: "bands", label: "Bands", icon: "◫" }, { id: "time", label: "Timeline", icon: "◷" },
];
const BANDS = ["D1", "D2", "D3", "D4", "D5", "D6"];
const BAND_COLORS: Record<string, string> = { D1: "#5b8def", D2: "#45b7d1", D3: "#5fcf8a", D4: "#f2c14e", D5: "#f08a4b", D6: "#e5484d" };
const BAND_RANGE: Record<string, [number, number]> = { D1: [0.75, 1.09], D2: [1.10, 1.62], D3: [1.63, 2.41], D4: [2.42, 3.82], D5: [3.83, 4.41], D6: [4.42, 5.00] };
const LAST_KEY = "skytrace.last-location";
const EXPLAIN: Record<Mode, { title: string; what: string; unit: string; use: string; not: string; source: string }> = {
  space: { title: "Real stars around this spot, at their real distances", what: "Each sphere is a Gaia DR3 star within 0.25° of the location, placed by its sky position and its distance from parallax (only stars with a well-measured parallax).", unit: "Sideways: degrees on the sky. Depth: distance in light-years (log scale).", use: "It shows that stars that look side by side on a picture can be very far apart in depth.", not: "SPHEREx does not measure distances; these come from ESA’s Gaia mission. Faint stars without a good parallax are left out.", source: "Gaia DR3 (ESA) via NASA/IPAC IRSA TAP" },
  spectrum: { title: "A real spectrum of this spot", what: "Each point is one real SPHEREx image: how bright the centre of your location is, at the exact infrared wavelength that image saw there.", unit: "Wavelength in micrometres (µm); brightness as surface brightness in MJy/sr. Our eyes see 0.4–0.7 µm.", use: "How brightness changes with wavelength hints at temperature, dust and what kind of object sits there. SPHEREx can build this for the whole sky.", not: "It is a coarse spot measurement, not calibrated point-source photometry, and points come from different days.", source: "NASA SPHEREx Level 2 images via NASA/IPAC IRSA · wavelengths from the SPHEREx spectral calibration (CWAVE)" },
  image: { title: "A real SPHEREx picture of this spot", what: "A 300″ cut-out of a real SPHEREx image, rotated north-up. Change the display stretch to bring out faint or bright details.", unit: "Display brightness from calibrated surface brightness (MJy/sr), with zodiacal light removed.", use: "Stretching changes what you can see without changing the data.", not: "A display stretch is not a measurement; do not read brightness off the colours.", source: "NASA SPHEREx Level 2 images (DR1 + QR3) via NASA/IPAC IRSA" },
  bands: { title: "The same spot in six infrared colours", what: "One real image per detector, D1 (shortest wavelength) to D6 (longest), all centred on your location.", unit: "Each detector covers a different range of infrared wavelengths.", use: "Some objects shine more at short wavelengths, others at long ones: comparing bands hints at temperature and dust.", not: "Images can be from different days; a difference between bands is not proof of a change in time.", source: "NASA SPHEREx Level 2 images via NASA/IPAC IRSA" },
  time: { title: "When SPHEREx came back to this spot", what: "Each card is one real visit: its dates, how many images it took, and one picture from it.", unit: "UTC dates; a visit groups images less than 30 days apart.", use: "Comparing visits months apart is how slow movers and changing stars are found.", not: "Visits alone do not show a change; compare them in the Explorer’s blink and difference views.", source: "NASA SPHEREx archive search via NASA/IPAC IRSA" },
};

type Place = { ra: number; dec: number; name: string; targetId: string | null; start: string | null; end: string | null };
type Star = { source_id: string; ra: number; dec: number; distance_ly: number; parallax_mas: number; g_mag: number | null; bp_rp: number | null };
const imgSrc = (o: Observation, p: Place, stretch = "asinh", size = 300) => `${API_BASE}${o.image_url}?${new URLSearchParams({ ra: String(p.ra), dec: String(p.dec), size: String(size), stretch })}`;
const day = (iso: string) => iso.slice(0, 10);
// Gaia BP-RP colour → the star's real tint: hot stars blue-white, Sun-like yellow-white, cool stars orange-red.
const starColor = (bpRp: number | null) => { const c = bpRp ?? 0.8; return c < 0.3 ? "#9db4ff" : c < 0.6 ? "#cad8ff" : c < 0.9 ? "#f8f4e8" : c < 1.3 ? "#ffe2a8" : c < 2 ? "#ffbf7a" : "#ff9a60"; };

// ---------- 3D: real Gaia stars ----------
type Camera = { yaw: number; pitch: number; zoom: number; panX: number; panY: number };
const INITIAL_CAMERA: Camera = { yaw: -0.5, pitch: 0.25, zoom: 1, panX: 0, panY: 0 };
function SpaceScene({ place, stars, selected, onSelect }: { place: Place; stars: Star[]; selected: Star | null; onSelect: (s: Star) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null); const drag = useRef<{ x: number; y: number; camera: Camera } | null>(null);
  const projected = useRef<{ star: Star; x: number; y: number; r: number }[]>([]);
  const [camera, setCamera] = useState(INITIAL_CAMERA); const [labels, setLabels] = useState(true);
  const dMin = Math.log10(Math.max(1, Math.min(...stars.map(s => s.distance_ly)))), dMax = Math.log10(Math.max(10, ...stars.map(s => s.distance_ly)));
  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d"); if (!ctx) return; ctx.scale(dpr, dpr);
    const w = rect.width, h = rect.height, cosd = Math.cos(place.dec * Math.PI / 180);
    ctx.fillStyle = "#070d1f"; ctx.fillRect(0, 0, w, h);
    const S = Math.min(w, h) * 0.38 * camera.zoom;
    const proj = (x: number, y: number, z: number) => {
      const cy = Math.cos(camera.yaw), sy = Math.sin(camera.yaw); [x, z] = [x * cy - z * sy, x * sy + z * cy];
      const cp = Math.cos(camera.pitch), sp = Math.sin(camera.pitch); [y, z] = [y * cp - z * sp, y * sp + z * cp];
      const k = 3.2 / (3.2 + z); return { x: w / 2 + camera.panX + x * S * k, y: h / 2 + camera.panY - y * S * k, k, z };
    };
    // Depth axis: from us (front) to the farthest star, with distance ticks.
    const zOf = (ly: number) => dMax > dMin ? ((Math.log10(ly) - dMin) / (dMax - dMin)) * 2 - 1 : 0;
    ctx.strokeStyle = "#3a506b"; ctx.lineWidth = 1; ctx.setLineDash([3, 6]);
    const a = proj(0, 0, -1.2), b = proj(0, 0, 1.2); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "#9fb3c4"; ctx.font = "11px DM Sans, sans-serif";
    for (const ly of [10, 100, 1000, 10000, 100000]) { if (Math.log10(ly) < dMin - 0.2 || Math.log10(ly) > dMax + 0.2) continue; const p = proj(0, 0, zOf(ly)); ctx.fillText(`${ly.toLocaleString()} ly`, p.x + 6, p.y); }
    const eye = proj(0, 0, -1.25); ctx.fillStyle = "#f4d6b0"; ctx.fillText("YOU (Earth)", eye.x + 6, eye.y + 14);
    const pts = stars.map(s => {
      const x = ((s.ra - place.ra + 540) % 360 - 180) * cosd / 0.25, y = (s.dec - place.dec) / 0.25;
      const p = proj(-x, y, zOf(s.distance_ly)); return { star: s, x: p.x, y: p.y, z: p.z, r: Math.max(2, (14 - (s.g_mag ?? 14)) * 0.9 + 2) * p.k };
    }).sort((p, q) => q.z - p.z);
    projected.current = pts;
    for (const p of pts) {
      const on = selected?.source_id === p.star.source_id, col = starColor(p.star.bp_rp);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3.5); g.addColorStop(0, col); g.addColorStop(1, "#0000");
      ctx.globalAlpha = 0.5; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 3.5, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      if (on) { ctx.strokeStyle = "#ffd166"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 6, 0, Math.PI * 2); ctx.stroke(); }
      if (labels && (on || (p.star.g_mag ?? 99) < 10)) { ctx.fillStyle = on ? "#ffd166" : "#d1dbe3"; ctx.fillText(`${Math.round(p.star.distance_ly).toLocaleString()} ly`, p.x + p.r + 6, p.y + 4); }
    }
    ctx.fillStyle = "#9fb3c4"; ctx.fillText("GAIA DR3 STARS · SIDEWAYS = SKY POSITION · DEPTH = DISTANCE (LOG)", 16, h - 16);
  }, [camera, labels, stars, selected, place, dMin, dMax]);
  useEffect(() => { draw(); const o = new ResizeObserver(draw); if (canvasRef.current) o.observe(canvasRef.current); return () => o.disconnect(); }, [draw]);
  const zoom = (f: number) => setCamera(c => ({ ...c, zoom: Math.max(.6, Math.min(3, c.zoom * f)) }));
  const nearest = [...stars].sort((p, q) => p.distance_ly - q.distance_ly).slice(0, 8);
  return <section className="viz-scene-panel" aria-label="Real stars around the location in 3D">
    <div className="viz-scene-toolbar"><div><span className="viz-live-dot" /> {stars.length} real stars <span className="viz-scene-meta">· drag to rotate · shift-drag to pan · scroll to zoom · click a star</span></div><div className="viz-perspectives"><button onClick={() => setCamera(c => ({ ...c, yaw: 0, pitch: 0 }))}>Sky view</button><button onClick={() => setCamera(c => ({ ...c, yaw: 1.45, pitch: 0 }))}>Side (depth)</button><button onClick={() => setCamera(c => ({ ...c, yaw: 0, pitch: 1.2 }))}>Top</button><button onClick={() => setCamera(INITIAL_CAMERA)}>Reset</button></div></div>
    <div className="viz-scene-canvas-wrap"><canvas ref={canvasRef} aria-label="Real Gaia stars placed by sky position and distance" onWheel={e => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.08 : .92); }}
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, camera }; }}
      onPointerMove={e => { if (!drag.current) return; const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y, s = drag.current.camera; setCamera(e.shiftKey ? { ...s, panX: s.panX + dx, panY: s.panY + dy } : { ...s, yaw: s.yaw + dx * .008, pitch: Math.max(-1.4, Math.min(1.4, s.pitch + dy * .008)) }); }}
      onPointerUp={e => { if (drag.current && Math.hypot(e.clientX - drag.current.x, e.clientY - drag.current.y) < 5) { const r = e.currentTarget.getBoundingClientRect(); const hit = [...projected.current].reverse().find(p => Math.hypot(p.x - (e.clientX - r.left), p.y - (e.clientY - r.top)) < p.r + 10); if (hit) onSelect(hit.star); } drag.current = null; }} />
      <div className="viz-canvas-controls"><button aria-label="Zoom in" onClick={() => zoom(1.15)}>+</button><button aria-label="Zoom out" onClick={() => zoom(.87)}>−</button><button aria-label="Reset camera" onClick={() => setCamera(INITIAL_CAMERA)}>⌂</button></div>
      <div className="viz-layer-menu"><label><input type="checkbox" checked={labels} onChange={() => setLabels(v => !v)} />Distance labels</label></div>
    </div>
    <div className="viz-object-strip">{nearest.map(s => <button key={s.source_id} className={selected?.source_id === s.source_id ? "active" : ""} onClick={() => onSelect(s)}><i style={{ background: starColor(s.bp_rp) }} />{Math.round(s.distance_ly).toLocaleString()} ly<span>G {s.g_mag?.toFixed(1) ?? "—"}</span></button>)}</div>
  </section>;
}

// ---------- Spectrum: real brightness at this spot vs wavelength ----------
type SpecPoint = { observation_id: string; band: string; obs_time: string; release: string; wavelength_um: number; bandwidth_um: number | null; wavelength_source: string | null; surface_brightness: number; uncertainty: number | null; saturated?: boolean; valid_pixels?: number };
/** One image per detector, from the visit that has the most detectors (same picks as the Bands view, so cached). */
function bandPicks(observations: Observation[], perBand = 1): Observation[] {
  const visit = groupVisits(observations).sort((a, b) => new Set(b.map(o => o.band)).size - new Set(a.map(o => o.band)).size)[0] ?? [];
  return BANDS.flatMap(b => { const mine = visit.filter(o => o.band === b); return (mine.length ? mine : observations.filter(o => o.band === b)).slice(0, perBand); });
}
function Spectrum({ place, observations }: { place: Place; observations: Observation[] }) {
  const [more, setMore] = useState(false); const [log, setLog] = useState(false);
  const [points, setPoints] = useState<SpecPoint[] | null>(null); const [err, setErr] = useState("");
  const [hovered, setHovered] = useState<number | null>(null); const [index, setIndex] = useState(0); const [zoom, setZoom] = useState(1); const [panX, setPanX] = useState(0);
  const ids = useMemo(() => bandPicks(observations, more ? 3 : 1).map(o => o.id), [observations, more]);
  useEffect(() => {
    const c = new AbortController(); setPoints(null); setErr("");
    getJson<{ points: SpecPoint[] }>(`/api/spectrum?${new URLSearchParams({ ra: String(place.ra), dec: String(place.dec), ids: ids.join(",") })}`, c.signal)
      .then(d => { setPoints(d.points); setIndex(0); }).catch(e => { if (!c.signal.aborted) setErr(errorMessage(e)); });
    return () => c.abort();
  }, [place, ids]);
  const left = 82, right = 775, top = 42, bottom = 405;
  const vals = (points ?? []).map(p => p.surface_brightness);
  const pos = vals.filter(v => v > 0);
  const lo = log ? Math.log10(Math.max(1e-4, Math.min(...pos, 1))) : Math.min(0, ...vals), hi = log ? Math.log10(Math.max(...pos, 1e-3)) : Math.max(1e-6, ...vals) * 1.1;
  const yv = (v: number) => log ? Math.log10(Math.max(1e-4, v)) : v;
  const Y = (v: number) => bottom - (yv(v) - lo) / ((hi - lo) || 1) * (bottom - top);
  const X = (um: number) => left + panX + (um - 0.6) / 4.6 * (right - left) * zoom;
  const sel = points?.[hovered ?? index];
  const ticks = Array.from({ length: 5 }, (_, i) => lo + (hi - lo) * i / 4);
  return <section className="viz-chart-panel"><div className="viz-chart-top"><div><strong>Brightness of this spot across SPHEREx’s infrared colours</strong><small>{points ? `${points.length} real images · one point per image, at its own wavelength` : "Measuring the real images… (fast when they are cached)"}</small></div><div className="viz-chart-controls"><button onClick={() => setPanX(v => v - 40)}>← Pan</button><button onClick={() => setPanX(v => v + 40)}>Pan →</button><button onClick={() => setZoom(v => Math.min(3, v * 1.2))}>Zoom +</button><button onClick={() => setZoom(v => Math.max(.7, v / 1.2))}>Zoom −</button><button onClick={() => { setZoom(1); setPanX(0); }}>Reset</button><button aria-pressed={log} onClick={() => setLog(v => !v)}>{log ? "Linear scale" : "Log scale"}</button><button aria-pressed={more} onClick={() => setMore(v => !v)}>{more ? "Fewer points" : "More points (slower)"}</button></div></div>
    {err && <div className="notice error" role="alert">{err}</div>}
    <svg viewBox="0 0 900 480" className="viz-spectrum" role="img" aria-label="Real surface brightness at this location against wavelength, one point per SPHEREx image">
      <rect x={X(0.4)} y={top} width={Math.max(0, X(0.7) - X(0.4))} height={bottom - top} fill="#ffffff0d" />
      {ticks.map((t, i) => <g key={i}><line x1={left} y1={bottom - (t - lo) / ((hi - lo) || 1) * (bottom - top)} x2="830" y2={bottom - (t - lo) / ((hi - lo) || 1) * (bottom - top)} stroke="#ffffff12" /><text x={left - 12} y={bottom - (t - lo) / ((hi - lo) || 1) * (bottom - top) + 4} textAnchor="end">{log ? (10 ** t).toPrecision(2) : t.toPrecision(2)}</text></g>)}
      {points && points.length > 1 && <polyline points={points.map(p => `${X(p.wavelength_um)},${Y(p.surface_brightness)}`).join(" ")} fill="none" stroke="#5bc0de" strokeWidth="2.5" opacity=".8" />}
      {points?.map((p, i) => { const x = X(p.wavelength_um), y = Y(p.surface_brightness), e = p.uncertainty ?? 0; const y1 = Y(p.surface_brightness + e), y2 = Y(Math.max(log ? 1e-4 : -Infinity, p.surface_brightness - e)); const on = i === (hovered ?? index);
        return <g key={p.observation_id} className="viz-spectrum-point" onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} onClick={() => setIndex(i)} role="button" tabIndex={0} aria-label={`${p.band} at ${p.wavelength_um.toFixed(3)} micrometres: ${p.surface_brightness.toPrecision(3)} MJy/sr`} onKeyDown={ev => { if (ev.key === "Enter" || ev.key === " ") setIndex(i); }}>
          {e > 0 && <><line x1={x} x2={x} y1={y1} y2={y2} stroke={BAND_COLORS[p.band]} strokeWidth="2" /><line x1={x - 5} x2={x + 5} y1={y1} y2={y1} stroke={BAND_COLORS[p.band]} /><line x1={x - 5} x2={x + 5} y1={y2} y2={y2} stroke={BAND_COLORS[p.band]} /></>}
          <circle cx={x} cy={y} r={on ? 8 : 5.5} fill={p.saturated ? "#0b132b" : on ? "#fff" : BAND_COLORS[p.band]} stroke={p.saturated ? BAND_COLORS[p.band] : "#0b132b"} strokeWidth={p.saturated ? 2.5 : 2} /></g>; })}
      <text x="450" y="462" textAnchor="middle" className="viz-axis-label">Wavelength · µm</text><text transform="translate(22 225) rotate(-90)" textAnchor="middle" className="viz-axis-label">Surface brightness · MJy/sr</text>
      {[1, 2, 3, 4, 5].map(u => <text key={u} x={X(u)} y="430" textAnchor="middle">{u}</text>)}
    </svg>
    <div className="viz-selected-measure">{sel ? <><b style={{ color: BAND_COLORS[sel.band] }}>{sel.wavelength_um.toFixed(3)} µm · {sel.band}</b><span>{sel.surface_brightness.toPrecision(3)}{sel.uncertainty ? ` ± ${sel.uncertainty.toPrecision(2)}` : ""} MJy/sr · {sel.obs_time.slice(0, 10)} · {sel.release}</span>{sel.saturated && <span className="warm">Centre partly saturated or flagged ({sel.valid_pixels}/9 pixels): this value is unreliable.</span>}<small>{sel.wavelength_source?.startsWith("CWAVE") ? "Wavelength from the SPHEREx calibration (CWAVE)" : "Wavelength from the image’s WCS"} · centre 3×3 pixels, zodiacal light removed</small></> : <span>Hover or select a point.</span>}</div>
    <p className="viz-inline-note">Hollow points: the centre was partly saturated or flagged, so the value is unreliable. Each point is a real measurement of this spot in one image. Points from different days can differ if the source varies. This is surface brightness, not calibrated point-source photometry.</p></section>;
}

// ---------- One real image, with display stretch ----------
function ImageView({ place, observations }: { place: Place; observations: Observation[] }) {
  const bands = BANDS.filter(b => observations.some(o => o.band === b));
  const [band, setBand] = useState(bands[0] ?? "D1"); const [stretch, setStretch] = useState("asinh"); const [zoom, setZoom] = useState(1); const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  useEffect(() => { if (!bands.includes(band) && bands[0]) setBand(bands[0]); }, [bands, band]);
  const obs = [...observations].filter(o => o.band === band).sort((a, b) => b.obs_time.localeCompare(a.obs_time))[0];
  const src = obs ? imgSrc(obs, place, stretch) : "";
  useEffect(() => { setState("loading"); }, [src]);
  return <section className="viz-image-panel"><div className="viz-image-top"><div><strong>{obs ? `${obs.band} · ${obs.obs_time.replace("T", " ").slice(0, 16)} UTC · ${obs.release}` : "No image"}</strong><small>{obs?.source_file ?? ""}</small></div><div className="viz-image-tools"><label>Detector<select value={band} onChange={e => setBand(e.target.value)}>{bands.map(b => <option key={b}>{b}</option>)}</select></label><label>Display stretch<select value={stretch} onChange={e => setStretch(e.target.value)}><option value="asinh">Asinh</option><option value="zscale">Zscale</option><option value="linear">Linear</option></select></label><button onClick={() => setZoom(v => Math.min(3, v * 1.25))}>Zoom +</button><button onClick={() => setZoom(v => Math.max(1, v / 1.25))}>Zoom −</button></div></div>
    <div className="viz-image-wrap">{obs && <img key={src} src={src} alt={`Real SPHEREx image, ${obs.band}, ${day(obs.obs_time)}`} onLoad={() => setState("ok")} onError={() => setState("error")} style={{ width: "100%", height: "100%", objectFit: "contain", imageRendering: "pixelated", transform: `scale(${zoom})`, transition: "transform .15s" }} />}
      {state !== "ok" && <p className="viz-pixel-readout" style={{ position: "absolute" }}>{state === "loading" ? "Loading the real image from the NASA archive… (5–30 s the first time)" : "The image could not be loaded. Try another detector."}</p>}</div>
    <div className="viz-pixel-readout">North up · east left · 300″ across (about 49 SPHEREx pixels)</div></section>;
}

// ---------- The same spot in all detectors ----------
function BandCompare({ place, observations }: { place: Place; observations: Observation[] }) {
  // Prefer the visit that has the most detectors, so the six images are close in time.
  const visit = groupVisits(observations).sort((a, b) => new Set(b.map(o => o.band)).size - new Set(a.map(o => o.band)).size)[0] ?? [];
  const picks = bandPicks(observations);
  const per = BANDS.map(b => ({ band: b, obs: picks.find(o => o.band === b) }));
  return <section className="viz-band-panel"><div className="viz-band-intro"><div><strong>The same spot through six infrared detectors</strong><small>{visit[0] ? `Mostly from the visit of ${day(visit[0].obs_time)}` : ""} · each image centred on your location</small></div></div>
    <div className="viz-band-grid">{per.map(({ band, obs }) => <article key={band}>{obs ? <img src={imgSrc(obs, place)} alt={`Real SPHEREx image in ${band}`} style={{ width: "100%", aspectRatio: "1", objectFit: "contain", imageRendering: "pixelated", borderRadius: 6, background: "#050812" }} /> : <div className="viz-band-art" style={{ height: 160 }}><span>NO {band} IMAGE HERE</span></div>}
      <strong style={{ color: BAND_COLORS[band] }}>{band} · {BAND_RANGE[band][0]}–{BAND_RANGE[band][1]} µm</strong><small>{obs ? `${day(obs.obs_time)} · ${obs.release}` : "not observed here"}</small></article>)}</div>
    <p className="viz-inline-note">Each picture is scaled on its own, so compare shapes and which objects appear, not absolute brightness.</p></section>;
}

// ---------- Real visits ----------
function TimeCompare({ place, observations }: { place: Place; observations: Observation[] }) {
  const visits = groupVisits(observations); const [active, setActive] = useState(0);
  const v = visits[Math.min(active, visits.length - 1)] ?? [];
  const band = (o: Observation[]) => BANDS.find(b => o.some(x => x.band === b));
  const pick = (o: Observation[]) => o.find(x => x.band === band(o));
  const shown = pick(v);
  return <section className="viz-time-panel"><div className="viz-time-header"><div><strong>{visits.length} real visits to this spot</strong><small>{observations.length} images in all · a visit groups images under 30 days apart</small></div><span>{v[0] ? `${day(v[0].obs_time)} → ${day(v[v.length - 1].obs_time)}` : ""}</span></div>
    <div className="viz-timeline" style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.min(visits.length, 4))}, 1fr)` }}>{visits.map((g, i) => <button key={g[0].id} className={i === active ? "active" : ""} onClick={() => setActive(i)}><span className="viz-time-dot" style={{ background: "#5bc0de" }} /><b>Visit {i + 1}</b><small>{new Date(g[0].obs_time).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })}</small><em>{g.length} images · {new Set(g.map(o => o.band)).size} detectors</em></button>)}</div>
    {shown && <div className="viz-time-description"><img src={imgSrc(shown, place)} alt={`Real SPHEREx image from visit ${active + 1}`} style={{ width: 220, height: 220, objectFit: "contain", imageRendering: "pixelated", borderRadius: 8, background: "#050812" }} /><div><b>Visit {Math.min(active, visits.length - 1) + 1}</b><span> · {shown.band} · {shown.obs_time.replace("T", " ").slice(0, 16)} UTC · {shown.release}</span><p>To see what changed between visits, open these dates in the Explorer and use blink or difference.</p></div></div>}</section>;
}

export function VisualizationWorkspace() {
  const [mode, setMode] = useState<Mode>("space");
  const [targets, setTargets] = useState<Target[]>([]);
  const [place, setPlace] = useState<Place | null>(null);
  const [raIn, setRaIn] = useState(""), [decIn, setDecIn] = useState("");
  const [observations, setObservations] = useState<Observation[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle"); const [error, setError] = useState("");
  const [stars, setStars] = useState<Star[] | null>(null); const [starsError, setStarsError] = useState(""); const [selectedStar, setSelectedStar] = useState<Star | null>(null);
  const [educational, setEducational] = useState(false);
  const fromTarget = (t: Target): Place => ({ ra: t.ra, dec: t.dec, name: t.name, targetId: t.id, start: t.search_start ?? null, end: t.search_end ?? null });

  // Start: ?ra&dec (shared link) → the last place explored in the Explorer → Mira.
  useEffect(() => {
    const c = new AbortController();
    getJson<{ targets: Target[] }>("/api/targets", c.signal).then(({ targets }) => {
      setTargets(targets);
      const q = new URLSearchParams(window.location.search); const byId = (id: string | null) => targets.find(t => t.id === id);
      let last: { ra: number; dec: number; targetId: string | null; start: string | null; end: string | null } | null = null;
      try { last = JSON.parse(localStorage.getItem(LAST_KEY) ?? "null"); } catch { last = null; }
      if (q.has("ra") && q.has("dec")) { const t = byId(q.get("target")); setPlace({ ra: Number(q.get("ra")), dec: Number(q.get("dec")), name: t?.name ?? "Shared location", targetId: t?.id ?? null, start: q.get("start") ?? t?.search_start ?? null, end: q.get("end") ?? t?.search_end ?? null }); }
      else if (last && Number.isFinite(last.ra) && Number.isFinite(last.dec)) { const t = byId(last.targetId); setPlace({ ra: last.ra, dec: last.dec, name: t?.name ?? "Your last Explorer location", targetId: t?.id ?? null, start: last.start, end: last.end }); }
      else { const t = byId("mira") ?? targets[0]; if (t) setPlace(fromTarget(t)); }
    }).catch(e => { setStatus("error"); setError(errorMessage(e)); });
    return () => c.abort();
  }, []);

  useEffect(() => {
    if (!place) return; setRaIn(place.ra.toFixed(5)); setDecIn(place.dec.toFixed(5));
    const c = new AbortController(); setStatus("loading"); setError(""); setStars(null); setStarsError(""); setSelectedStar(null);
    const q = new URLSearchParams({ ra: String(place.ra), dec: String(place.dec) }); if (place.start) q.set("start", place.start); if (place.end) q.set("end", place.end);
    getJson<{ observations: Observation[] }>(`/api/search?${q}`, c.signal).then(d => { setObservations(d.observations); setStatus("ready"); }).catch(e => { if (!c.signal.aborted) { setStatus("error"); setError(errorMessage(e)); } });
    getJson<{ stars: Star[] }>(`/api/gaia-stars?${new URLSearchParams({ ra: String(place.ra), dec: String(place.dec), radius: "0.25" })}`, c.signal).then(d => { setStars(d.stars); setSelectedStar([...d.stars].sort((a, b) => a.distance_ly - b.distance_ly)[0] ?? null); }).catch(e => { if (!c.signal.aborted) setStarsError(errorMessage(e)); });
    return () => c.abort();
  }, [place]);

  const goTo = () => { const ra = Number(raIn), dec = Number(decIn); if (Number.isFinite(ra) && ra >= 0 && ra < 360 && Number.isFinite(dec) && dec >= -90 && dec <= 90) setPlace({ ra, dec, name: `RA ${ra.toFixed(3)}°, Dec ${dec.toFixed(3)}°`, targetId: null, start: null, end: null }); else setError("Enter RA from 0 to 360 and Dec from −90 to 90 degrees."); };
  const useLast = () => { try { const l = JSON.parse(localStorage.getItem(LAST_KEY) ?? "null"); if (l) { const t = targets.find(x => x.id === l.targetId); setPlace({ ra: l.ra, dec: l.dec, name: t?.name ?? "Your last Explorer location", targetId: t?.id ?? null, start: l.start, end: l.end }); } else setError("No Explorer location yet: search one in the Explorer first."); } catch { setError("Browser storage is unavailable."); } };
  const ex = EXPLAIN[mode];
  const explorerHref = place ? `/observations?ra=${place.ra}&dec=${place.dec}${place.targetId ? `&target=${place.targetId}` : ""}` : "/explore";
  const ready = status === "ready" && place;

  return <main className="viz-page">
    <section className="viz-page-title"><div><p className="viz-kicker">LEARNING LAB · REAL NASA DATA</p><h1>See the data.<br /><span>Understand the universe.</span></h1><p>Pick a spot in the sky and explore it five ways: real stars in 3D, SPHEREx’s infrared colours, the real image, all six detectors, and every visit.</p></div><button className={`viz-learn-toggle ${educational ? "on" : ""}`} onClick={() => setEducational(v => !v)}>{educational ? "Learning tips on" : "Turn on learning tips"}<span>✦</span></button></section>
    <div className="viz-workspace"><aside className="viz-side-panel">
      <div className="viz-side-heading"><span className="viz-side-icon">⌖</span><div><p className="viz-kicker">YOUR LOCATION</p><h2>{place?.name ?? "Loading…"}</h2></div></div>
      <div className="viz-coord-pair"><label><small>RA (deg)</small><input value={raIn} onChange={e => setRaIn(e.target.value)} inputMode="decimal" aria-label="Right ascension in degrees" /></label><label><small>Dec (deg)</small><input value={decIn} onChange={e => setDecIn(e.target.value)} inputMode="decimal" aria-label="Declination in degrees" /></label></div>
      <div className="viz-side-actions"><button onClick={goTo}>Go to RA/Dec</button><button onClick={useLast}>My last Explorer spot</button></div>
      <p className="viz-side-label">OR A DEMO TARGET</p>
      <select value={place?.targetId ?? ""} onChange={e => { const t = targets.find(x => x.id === e.target.value); if (t) setPlace(fromTarget(t)); }} aria-label="Demo target"><option value="" disabled>Choose a target</option>{targets.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
      <div className="viz-demo-callout"><span>REAL DATA</span><p>{status === "ready" ? `${observations.length} SPHEREx images · ${stars ? `${stars.length} Gaia stars` : "stars loading…"}` : status === "loading" ? "Searching the NASA archive…" : "—"}</p><small>NASA SPHEREx via IRSA · Gaia DR3 via IRSA</small></div>
      <p className="viz-side-label">VIEW</p><div className="viz-mode-list">{MODES.map(m => <button key={m.id} className={mode === m.id ? "active" : ""} onClick={() => setMode(m.id)} aria-pressed={mode === m.id}><span>{m.icon}</span>{m.label}<i>→</i></button>)}</div>
      {mode === "space" && selectedStar && <div className="viz-selection-box"><p className="viz-side-label">SELECTED STAR</p><div className="viz-selected-name"><i style={{ background: starColor(selectedStar.bp_rp) }} /><strong>Gaia DR3 {selectedStar.source_id}</strong></div><p>{Math.round(selectedStar.distance_ly).toLocaleString()} light-years away (parallax {selectedStar.parallax_mas.toFixed(2)} mas) · G magnitude {selectedStar.g_mag?.toFixed(1) ?? "—"}</p></div>}
      <Link className="viz-return-link" href={explorerHref}>Compare these images in the Explorer <span>↗</span></Link>
    </aside>
      <section className="viz-main-panel"><div className="viz-main-heading"><div><p className="viz-kicker">{MODES.find(m => m.id === mode)?.label.toUpperCase()}</p><h2>{ex.title}</h2></div><div className="viz-main-actions"><span className="viz-illustrative-chip">Real data</span></div></div>
        {(status === "error" || error) && <div className="notice error" role="alert">{error}</div>}
        {status === "loading" && <p className="viz-inline-note" role="status">Searching the NASA archive for this location… (5–15 s the first time)</p>}
        {ready && !observations.length && mode !== "space" && <p className="viz-inline-note">SPHEREx has no images here in the data we searched.</p>}
        {ready && mode === "space" && (stars ? (stars.length ? <SpaceScene place={place} stars={stars} selected={selectedStar} onSelect={setSelectedStar} /> : <p className="viz-inline-note">Gaia has no stars with a precise distance within 0.25° of this spot.</p>) : starsError ? <div className="notice error" role="alert">{starsError}</div> : <p className="viz-inline-note" role="status">Asking Gaia for the stars around this spot… (about 10 s the first time)</p>)}
        {ready && observations.length > 0 && mode === "spectrum" && <Spectrum place={place} observations={observations} />}
        {ready && observations.length > 0 && mode === "image" && <ImageView place={place} observations={observations} />}
        {ready && observations.length > 0 && mode === "bands" && <BandCompare place={place} observations={observations} />}
        {ready && observations.length > 0 && mode === "time" && <TimeCompare place={place} observations={observations} />}
        <section className="viz-explanation"><div className="viz-explanation-mark">i</div><div className="viz-explanation-copy"><div className="viz-explanation-title"><p className="viz-kicker">WHAT THIS VIEW MEANS</p><h3>{ex.title}</h3></div><div className="viz-explanation-grid"><p><b>What am I looking at?</b>{ex.what}</p><p><b>Unit</b>{ex.unit}</p><p><b>Why is it useful?</b>{ex.use}</p><p><b>What can’t we conclude?</b>{ex.not}</p><p><b>Data source</b>{ex.source}</p></div>{educational && <div className="viz-learning-tip"><span>✦ A little science</span><p>RA and Dec work like longitude and latitude on the sky. A coordinate gives a direction; the distance of a star comes from its parallax, the tiny yearly wobble Gaia measures as Earth goes around the Sun.</p></div>}</div></section>
      </section>
    </div><footer className="viz-footer"><span>SKYTRACE · Learn through exploration</span><span>All views use real data: NASA SPHEREx and Gaia DR3, through NASA/IPAC IRSA.</span><div><button onClick={() => setEducational(v => !v)}>{educational ? "Hide learning tips" : "Show learning tips"}</button></div></footer>
  </main>;
}
