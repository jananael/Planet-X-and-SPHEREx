"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brand } from "./brand";
import { DEMO_DATA_NOTICE, DEMO_IMAGE_PIXELS, DEMO_OBSERVATIONS, DEMO_SOURCES, DEMO_SPECTRUM, MODE_EXPLANATIONS, type DemoSource, type VisualizationMode } from "../lib/visualization-model";
import { getJson } from "../lib/api";
import type { Coordinates } from "../lib/types";
import "./visualization-workspace.css";

const MODES: { id: VisualizationMode; label: string; icon: string }[] = [
  { id: "space", label: "3D space", icon: "◉" }, { id: "sky", label: "Sky map", icon: "✧" },
  { id: "spectrum", label: "Spectrum", icon: "⌁" }, { id: "image", label: "Image", icon: "▧" },
  { id: "bands", label: "Bands", icon: "◫" }, { id: "time", label: "Timeline", icon: "◷" },
];
const IMAGE_SIDE = DEMO_IMAGE_PIXELS.length;

type Camera = { yaw: number; pitch: number; zoom: number; panX: number; panY: number };
type Projected = { source: DemoSource; x: number; y: number; radius: number; depth: number };
const INITIAL_CAMERA: Camera = { yaw: -0.38, pitch: 0.18, zoom: 1, panX: 0, panY: 0 };

function project3d(source: DemoSource, camera: Camera, width: number, height: number): Projected {
  const ra = source.raDeg * Math.PI / 180; const dec = source.decDeg * Math.PI / 180;
  const r = 1.2 + source.distanceLy / 82;
  let x = Math.cos(dec) * Math.sin(ra) * r;
  let y = Math.sin(dec) * r;
  let z = Math.cos(dec) * Math.cos(ra) * r;
  const cy = Math.cos(camera.yaw); const sy = Math.sin(camera.yaw);
  [x, z] = [x * cy - z * sy, x * sy + z * cy];
  const cp = Math.cos(camera.pitch); const sp = Math.sin(camera.pitch);
  [y, z] = [y * cp - z * sp, y * sp + z * cp];
  const perspective = 4.6 / (4.6 + z);
  const scale = Math.min(width, height) * 0.27 * camera.zoom;
  return { source, x: width / 2 + camera.panX + x * scale * perspective, y: height / 2 + camera.panY - y * scale * perspective, radius: Math.max(4, source.radius * perspective * camera.zoom * 4.2), depth: z };
}

function SpaceScene({ selected, onSelect, onSelectSource }: { selected: string; onSelect: (id: string) => void; onSelectSource: (source: DemoSource) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null); const drag = useRef<{ x: number; y: number; camera: Camera } | null>(null);
  const projected = useRef<Projected[]>([]);
  const [camera, setCamera] = useState(INITIAL_CAMERA);
  const [layers, setLayers] = useState({ stars: true, paths: true, labels: true });
  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d"); if (!ctx) return; ctx.scale(dpr, dpr);
    const w = rect.width; const h = rect.height;
    const bg = ctx.createRadialGradient(w * .52, h * .48, 5, w * .52, h * .48, Math.max(w, h) * .78);
    bg.addColorStop(0, "#101a32"); bg.addColorStop(.55, "#080e1c"); bg.addColorStop(1, "#040710"); ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    if (layers.stars) {
      for (let i = 0; i < 170; i++) {
        const x = ((i * 97.31) % 997) / 997 * w; const y = ((i * 233.17) % 991) / 991 * h;
        const radius = i % 19 === 0 ? 1.35 : .55; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = i % 6 === 0 ? "rgba(181,194,255,.72)" : "rgba(231,238,255,.55)"; ctx.fill();
      }
    }
    if (layers.paths) {
      ctx.beginPath(); ctx.ellipse(w / 2 + camera.panX, h / 2 + camera.panY, w * .31 * camera.zoom, h * .12 * camera.zoom, -.12, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(141,119,199,.28)"; ctx.setLineDash([3, 8]); ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
    }
    const points = DEMO_SOURCES.map(source => project3d(source, camera, w, h)).sort((a, b) => b.depth - a.depth); projected.current = points;
    for (const point of points) {
      const active = point.source.id === selected; const radius = point.radius * (active ? 1.25 : 1);
      const glow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius * 4.5);
      glow.addColorStop(0, `${point.source.color}a8`); glow.addColorStop(1, `${point.source.color}00`);
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(point.x, point.y, radius * 4.5, 0, Math.PI * 2); ctx.fill();
      const sphere = ctx.createRadialGradient(point.x - radius * .42, point.y - radius * .5, radius * .05, point.x + radius * .25, point.y + radius * .3, radius * 1.7);
      sphere.addColorStop(0, "#ffffff"); sphere.addColorStop(.2, point.source.color); sphere.addColorStop(1, "#222039");
      ctx.fillStyle = sphere; ctx.beginPath(); ctx.arc(point.x, point.y, radius, 0, Math.PI * 2); ctx.fill();
      if (active) { ctx.strokeStyle = "#f5eaff"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(point.x, point.y, radius + 4, 0, Math.PI * 2); ctx.stroke(); }
      if (layers.labels) { ctx.font = "11px DM Sans, sans-serif"; ctx.fillStyle = active ? "#fff" : "#b7c0d7"; ctx.fillText(point.source.name, point.x + radius + 8, point.y + 4); }
    }
    ctx.fillStyle = "rgba(226,231,248,.55)"; ctx.font = "10px DM Sans, sans-serif"; ctx.fillText("SIMULATED OBJECTS · DEPTH VIEW", 18, h - 18);
  }, [camera, layers, selected]);
  useEffect(() => { draw(); const observer = new ResizeObserver(draw); if (canvasRef.current) observer.observe(canvasRef.current); return () => observer.disconnect(); }, [draw]);
  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, camera };
  };
  const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current) return; const dx = event.clientX - drag.current.x; const dy = event.clientY - drag.current.y; const start = drag.current.camera;
    if (event.shiftKey || event.button === 1) setCamera({ ...start, panX: start.panX + dx, panY: start.panY + dy });
    else setCamera({ ...start, yaw: start.yaw + dx * .008, pitch: Math.max(-1.3, Math.min(1.3, start.pitch + dy * .008)) });
  };
  const pointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (drag.current) {
      const distance = Math.hypot(event.clientX - drag.current.x, event.clientY - drag.current.y);
      if (distance < 5) {
        const rect = event.currentTarget.getBoundingClientRect(); const hit = [...projected.current].reverse().find(p => Math.hypot(p.x - (event.clientX - rect.left), p.y - (event.clientY - rect.top)) < p.radius + 12);
        if (hit) { onSelect(hit.source.id); onSelectSource(hit.source); }
      }
    }
    drag.current = null;
  };
  const changeZoom = (factor: number) => setCamera(c => ({ ...c, zoom: Math.max(.6, Math.min(2.5, c.zoom * factor)) }));
  const toggleLayer = (key: keyof typeof layers) => setLayers(v => ({ ...v, [key]: !v[key] }));
  const perspective = (yaw: number, pitch: number) => setCamera(c => ({ ...c, yaw, pitch }));
  return <section className="viz-scene-panel" aria-label="Interactive three-dimensional scene">
    <div className="viz-scene-toolbar"><div><span className="viz-live-dot" /> Simulated local scene <span className="viz-scene-meta">· drag to rotate · shift-drag to pan · scroll to zoom</span></div><div className="viz-perspectives"><button onClick={() => perspective(0, 0)}>Front</button><button onClick={() => perspective(1.4, 0)}>Side</button><button onClick={() => perspective(0, 1.1)}>Top</button><button onClick={() => setCamera(INITIAL_CAMERA)}>Reset</button></div></div>
    <div className="viz-scene-canvas-wrap"><canvas ref={canvasRef} aria-label="Interactive 3D illustrative space scene. Drag to rotate and select an object." onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onWheel={e => { e.preventDefault(); changeZoom(e.deltaY < 0 ? 1.08 : .92); }} />
      <div className="viz-canvas-controls"><button aria-label="Zoom in" onClick={() => changeZoom(1.15)}>+</button><button aria-label="Zoom out" onClick={() => changeZoom(.87)}>−</button><button aria-label="Reset camera" onClick={() => setCamera(INITIAL_CAMERA)}>⌂</button></div>
      <div className="viz-layer-menu">{(["stars", "paths", "labels"] as const).map(key => <label key={key}><input type="checkbox" checked={layers[key]} onChange={() => toggleLayer(key)} />{key === "paths" ? "Guide path" : key[0].toUpperCase() + key.slice(1)}</label>)}</div>
    </div>
    <div className="viz-object-strip">{DEMO_SOURCES.map(source => <button key={source.id} className={source.id === selected ? "active" : ""} onClick={() => { onSelect(source.id); onSelectSource(source); }}><i style={{ background: source.color }} />{source.name}<span>→</span></button>)}</div>
  </section>;
}

type SkyObject = { name?: string; source_id?: string; ra_deg: number; dec_deg: number; g_mag?: number | null; ra_error_mas?: number | null; dec_error_mas?: number | null; position_method?: string; object_type?: string; visual_magnitude?: number | null; position_error_arcsec?: number | null; pmra_mas_yr?: number | null; pmdec_mas_yr?: number | null; parallax_mas?: number | null };
type SkyCatalogResponse = { center: Coordinates; radius_deg: number; epoch_utc: string; stars: SkyObject[]; solar_system_objects: SkyObject[]; providers: Record<string, { status: string; count?: number; reason?: string }> };

function CoordinateSkyView() {
  const [ra, setRa] = useState(""); const [dec, setDec] = useState(""); const [date, setDate] = useState("");
  const [center, setCenter] = useState<Coordinates | null>(null); const [catalog, setCatalog] = useState<SkyCatalogResponse | null>(null);
  const [selectedObject, setSelectedObject] = useState<SkyObject | null>(null); const [loading, setLoading] = useState(false); const [message, setMessage] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search); const initialRa = Number(params.get("ra")); const initialDec = Number(params.get("dec"));
    setDate(new Date().toISOString().slice(0, 10));
    if (params.has("ra") && params.has("dec") && Number.isFinite(initialRa) && Number.isFinite(initialDec) && initialRa >= 0 && initialRa < 360 && initialDec >= -90 && initialDec <= 90) {
      setRa(String(initialRa)); setDec(String(initialDec)); setCenter({ ra: initialRa, dec: initialDec });
    }
  }, []);
  useEffect(() => {
    if (!center || !date) return;
    const controller = new AbortController(); setLoading(true); setMessage(""); setCatalog(null); setSelectedObject(null);
    const epoch = `${date}T12:00:00Z`;
    getJson<SkyCatalogResponse>(`/api/sky-objects?${new URLSearchParams({ ra: String(center.ra), dec: String(center.dec), radius_deg: "0.5", epoch })}`, controller.signal)
      .then(setCatalog).catch(error => { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "The catalog query could not be completed."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [center, date]);
  const submit = (event: React.FormEvent) => {
    event.preventDefault(); const nextRa = Number(ra), nextDec = Number(dec);
    if (!ra.trim() || !dec.trim() || !Number.isFinite(nextRa) || nextRa < 0 || nextRa >= 360 || !Number.isFinite(nextDec) || nextDec < -90 || nextDec > 90 || !date) { setMessage("Enter RA from 0° to under 360°, Dec from −90° to 90°, and an observation date."); return; }
    const next = { ra: nextRa, dec: nextDec }; setCenter(next);
    const url = new URL(window.location.href); url.searchParams.set("ra", String(nextRa)); url.searchParams.set("dec", String(nextDec)); url.searchParams.set("start", date); window.history.replaceState({}, "", url);
  };
  const stars = catalog?.stars ?? []; const smallBodies = catalog?.solar_system_objects ?? [];
  const allObjects = [...stars.map(item => ({ ...item, category: "Star" })), ...smallBodies.map(item => ({ ...item, category: item.object_type || "Solar-system object" }))];
  const point = (object: SkyObject) => {
    if (!center || !catalog) return { x: 500, y: 310 };
    let deltaRa = object.ra_deg - center.ra; if (deltaRa > 180) deltaRa -= 360; if (deltaRa < -180) deltaRa += 360;
    return { x: 500 + deltaRa * Math.cos(center.dec * Math.PI / 180) / catalog.radius_deg * 450, y: 310 - (object.dec_deg - center.dec) / catalog.radius_deg * 280 };
  };
  const provider = (key: string) => catalog?.providers[key];
  return <section className="viz-catalog-panel" aria-label="Coordinate-based sky map">
    <div className="viz-catalog-intro"><div><strong>Objects near your sky position</strong><p>Enter a direction in the sky. The map shows catalogued stars and known solar-system objects near that direction.</p></div><span className="viz-catalog-chip">{catalog ? "Catalog results" : "Coordinate search"}</span></div>
    <form className="viz-coordinate-form" onSubmit={submit}>
      <label>Right ascension (RA), degrees<input inputMode="decimal" value={ra} onChange={event => setRa(event.target.value)} placeholder="e.g. 34.8366" aria-label="Right ascension in degrees" /></label>
      <label>Declination (Dec), degrees<input inputMode="decimal" value={dec} onChange={event => setDec(event.target.value)} placeholder="e.g. −2.9776" aria-label="Declination in degrees" /></label>
      <label>Sky position date (UTC)<input type="date" value={date} onChange={event => setDate(event.target.value)} aria-label="Sky position date in UTC" /></label>
      <button type="submit" disabled={loading || !date}>{loading ? "Searching…" : "Show nearby objects"}</button>
    </form>
    {message && <p className="viz-catalog-message" role="alert">{message}</p>}
    {!center && <div className="viz-catalog-empty">Choose a sky position to load real catalog results. If you came from Explorer, its RA and Dec will be filled in here.</div>}
    {center && <>
      {loading && <p className="viz-catalog-status" role="status">Querying Gaia DR3 and SkyBoT for RA {center.ra.toFixed(5)}°, Dec {center.dec.toFixed(5)}°…</p>}
      {catalog && <div className="viz-provider-status" aria-label="Catalog source status">
        <span><b>Gaia DR3:</b> {provider("gaia_dr3")?.status === "available" ? `${stars.length} cataloged stars returned (brightest 300 maximum)` : `unavailable${provider("gaia_dr3")?.reason ? ` (${provider("gaia_dr3")?.reason})` : ""}`}</span>
        <span><b>SkyBoT:</b> {provider("skybot")?.status === "available" ? `${smallBodies.length} known solar-system objects returned` : `unavailable${provider("skybot")?.reason ? ` (${provider("skybot")?.reason})` : ""}`}</span>
        <span><b>Epoch:</b> {catalog.epoch_utc.replace("T", " ").slice(0, 16)} UTC · geocenter</span>
      </div>}
      {catalog && <svg className="viz-catalog-map" viewBox="0 0 1000 620" role="img" aria-label={`Catalog sky map centered on RA ${center.ra}, Dec ${center.dec} degrees`}>
        <defs><clipPath id="catalog-map-clip"><rect x="50" y="30" width="900" height="560" rx="12" /></clipPath><radialGradient id="catalog-map-bg"><stop stopColor="#121e38" /><stop offset="1" stopColor="#070b16" /></radialGradient></defs>
        <rect x="50" y="30" width="900" height="560" rx="12" fill="url(#catalog-map-bg)" />
        {[0, 1, 2, 3, 4].map(i => { const cosDec = Math.max(.01, Math.cos(center.dec * Math.PI / 180)); return <g key={i}><line x1={50 + i * 225} y1="30" x2={50 + i * 225} y2="590" stroke="#ffffff18"/><line x1="50" y1={30 + i * 140} x2="950" y2={30 + i * 140} stroke="#ffffff18"/><text x={50 + i * 225} y="612" textAnchor="middle" className="viz-map-tick">{(center.ra + (i - 2) * .25 / cosDec).toFixed(3)}°</text><text x="42" y={34 + i * 140} textAnchor="end" className="viz-map-tick">{(center.dec + (2 - i) * .25).toFixed(3)}°</text></g>; })}
        <g clipPath="url(#catalog-map-clip)">{stars.map((object, i) => { const p = point(object); const radius = Math.max(2.5, Math.min(7, 6 - ((object.g_mag ?? 15) - 6) * .32)); return <g key={object.source_id ?? `star-${i}`} onClick={() => setSelectedObject(object)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") setSelectedObject(object); }} role="button" tabIndex={0} aria-label={`Gaia star ${object.source_id}, magnitude ${object.g_mag ?? "unknown"}`}><circle cx={p.x} cy={p.y} r={radius + (selectedObject?.source_id === object.source_id ? 4 : 0)} fill="#81c7ff" fillOpacity=".18"/><circle cx={p.x} cy={p.y} r={radius} fill="#a9d7ff" stroke="#e6f4ff" strokeWidth=".7"/></g>; })}
          {smallBodies.map((object, i) => { const p = point(object); return <g key={`${object.name}-${i}`} onClick={() => setSelectedObject(object)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") setSelectedObject(object); }} role="button" tabIndex={0} aria-label={`${object.object_type ?? "Solar-system object"} ${object.name ?? "unknown"}`}><path d={`M ${p.x} ${p.y - 8} l 7 13 h -14 z`} fill="#ffbd69" stroke="#fff0d7" strokeWidth="1.4"/><circle cx={p.x} cy={p.y} r={selectedObject?.name === object.name ? 12 : 0} fill="none" stroke="#fff0d7"/></g>; })}
        </g><circle cx="500" cy="310" r="8" fill="none" stroke="#f4d6b0" strokeWidth="1.5"/><path d="M 488 310h24 M 500 298v24" stroke="#f4d6b0" strokeWidth="1"/>
        <text x="500" y="22" textAnchor="middle" className="viz-axis-label">North ↑ · each grid step = 0.25°</text><text x="500" y="610" textAnchor="middle" className="viz-axis-label">Right ascension · degrees</text>
      </svg>}
      {catalog && <div className="viz-catalog-footer"><span><i className="viz-star-key"/> Gaia DR3 stars · brighter stars have larger markers</span><span><i className="viz-asteroid-key"/> Known solar-system objects</span><span>Center cross = entered coordinates</span><span>Click a marker for details</span></div>}
      {selectedObject && <div className="viz-object-detail"><strong>{selectedObject.source_id ? `Gaia DR3 source ${selectedObject.source_id}` : `${selectedObject.object_type ?? "Solar-system object"}: ${selectedObject.name ?? "unnamed"}`}</strong><span>RA {selectedObject.ra_deg.toFixed(6)}° · Dec {selectedObject.dec_deg.toFixed(6)}°</span>{selectedObject.g_mag != null && <span>Gaia G magnitude {selectedObject.g_mag.toFixed(2)}</span>}{selectedObject.ra_error_mas != null && selectedObject.dec_error_mas != null && <span>Catalog coordinate uncertainty: RA ±{selectedObject.ra_error_mas.toFixed(2)} mas, Dec ±{selectedObject.dec_error_mas.toFixed(2)} mas</span>}{selectedObject.visual_magnitude != null && <span>Predicted visual magnitude {selectedObject.visual_magnitude.toFixed(1)} · position uncertainty {selectedObject.position_error_arcsec ?? "not provided"} arcsec</span>}{selectedObject.parallax_mas != null && <span>Parallax {selectedObject.parallax_mas.toFixed(2)} mas · proper motion {selectedObject.pmra_mas_yr ?? "—"}, {selectedObject.pmdec_mas_yr ?? "—"} mas/year</span>}{selectedObject.position_method && <span>Coordinate handling: {selectedObject.position_method}</span>}</div>}
      {catalog && <p className="viz-catalog-caveat">This is a 2D direction map, not a physical 3D model. Gaia positions are propagated from J2016.0 using proper motion only; radial velocity is not included. SkyBoT predictions use the geocenter, not the SPHEREx spacecraft, and include known objects only. The returned Gaia list is capped at the 300 brightest sources. Sources: <a href="https://gea.esac.esa.int/archive/" target="_blank" rel="noreferrer">Gaia Archive</a> · <a href="https://ssp.imcce.fr/webservices/skybot/api/conesearch/" target="_blank" rel="noreferrer">IMCCE SkyBoT</a>.</p>}
    </>}
  </section>;
}

function Spectrum({ onSelect }: { onSelect: (index: number) => void }) {
  const [hovered, setHovered] = useState<number | null>(null); const [zoom, setZoom] = useState(1); const [panX, setPanX] = useState(0); const [index, setIndex] = useState(3);
  const selected = hovered ?? index; const left = 82; const right = 775; const top = 42; const bottom = 405;
  const point = (i: number) => ({ x: left + panX + (DEMO_SPECTRUM[i]!.wavelengthUm - .5) / 4.3 * right / zoom, y: bottom - DEMO_SPECTRUM[i]!.flux / 10 * (bottom - top) });
  return <section className="viz-chart-panel"><div className="viz-chart-top"><div><strong>Illustrative source spectrum</strong><small>Hover or select a point to inspect the sample value.</small></div><div className="viz-chart-controls"><button aria-label="Pan spectrum left" onClick={() => setPanX(v => v - 28)}>← Pan</button><button aria-label="Pan spectrum right" onClick={() => setPanX(v => v + 28)}>Pan →</button><button onClick={() => setZoom(v => Math.min(1.8, v * 1.15))}>Zoom +</button><button onClick={() => setZoom(v => Math.max(.7, v / 1.15))}>Zoom −</button><button onClick={() => { setZoom(1); setPanX(0); }}>Reset</button></div></div>
    <svg viewBox="0 0 900 480" className="viz-spectrum" role="img" aria-label="Interactive illustrative spectrum plot">
      {[0, 2, 4, 6, 8, 10].map(y => <g key={y}><line x1={left} y1={bottom - y / 10 * (bottom - top)} x2="830" y2={bottom - y / 10 * (bottom - top)} stroke="#ffffff12" /><text x={left - 18} y={bottom - y / 10 * (bottom - top) + 4} textAnchor="end">{y}</text></g>)}
      {DEMO_SPECTRUM.map((d, i) => { const p = point(i); const err = d.uncertainty / 10 * (bottom - top); return <g key={d.wavelengthUm} className="viz-spectrum-point" onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} onClick={() => { setIndex(i); onSelect(i); }} role="button" tabIndex={0} aria-label={`Select ${d.wavelengthUm} micrometer point, illustrative flux ${d.flux}`} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { setIndex(i); onSelect(i); } }}><line x1={p.x} x2={p.x} y1={p.y - err} y2={p.y + err} stroke="#d6b7ff" strokeWidth="2"/><line x1={p.x - 5} x2={p.x + 5} y1={p.y - err} y2={p.y - err} stroke="#d6b7ff"/><line x1={p.x - 5} x2={p.x + 5} y1={p.y + err} y2={p.y + err} stroke="#d6b7ff"/><circle cx={p.x} cy={p.y} r={i === selected ? 8 : 5} fill={i === selected ? "#fff" : "#bd83f2"} stroke="#120b20" strokeWidth="2"/></g>; })}
      <polyline points={DEMO_SPECTRUM.map((_, i) => { const p = point(i); return `${p.x},${p.y}`; }).join(" ")} fill="none" stroke="#ba84fa" strokeWidth="3" />
      <text x="430" y="462" textAnchor="middle" className="viz-axis-label">Wavelength · μm</text><text transform="translate(24 225) rotate(-90)" textAnchor="middle" className="viz-axis-label">Illustrative flux · arbitrary units</text>
      {[1, 2, 3, 4, 5].map(x => <text key={x} x={left + (x - .5) / 4.3 * right / zoom} y="430" textAnchor="middle">{x}</text>)}
    </svg><div className="viz-selected-measure"><b>{DEMO_SPECTRUM[selected]!.wavelengthUm.toFixed(1)} μm</b><span>Flux {DEMO_SPECTRUM[selected]!.flux.toFixed(1)} ± {DEMO_SPECTRUM[selected]!.uncertainty.toFixed(2)} demo units</span><small>Illustrative uncertainty bar only; not a measured uncertainty.</small></div>
  </section>;
}

function ImageView() {
  const canvasRef = useRef<HTMLCanvasElement>(null); const dragging = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null); const [stretch, setStretch] = useState<"linear" | "sqrt" | "log">("sqrt"); const [pixel, setPixel] = useState<{ x: number; y: number; value: number } | null>(null); const [zoom, setZoom] = useState(1); const [pan, setPan] = useState({ x: 0, y: 0 });
  useEffect(() => { const canvas = canvasRef.current; const ctx = canvas?.getContext("2d"); if (!canvas || !ctx) return; const cell = 8; const max = Math.max(...DEMO_IMAGE_PIXELS.flat()); ctx.clearRect(0, 0, canvas.width, canvas.height); DEMO_IMAGE_PIXELS.forEach((row, y) => row.forEach((value, x) => { const normalized = Math.min(1, value / max); const mapped = stretch === "linear" ? normalized : stretch === "sqrt" ? Math.sqrt(normalized) : Math.log1p(normalized * 9) / Math.log(10); const hue = 220 - mapped * 140; ctx.fillStyle = `hsl(${hue} 78% ${7 + mapped * 64}%)`; ctx.fillRect(x * cell, y * cell, cell + 1, cell + 1); })); }, [stretch]);
  return <section className="viz-image-panel"><div className="viz-image-top"><div><strong>Demo detector frame</strong><small>Generated pixel field · no source image loaded</small></div><div className="viz-image-tools"><label>Display stretch<select value={stretch} onChange={e => setStretch(e.target.value as typeof stretch)}><option value="linear">Linear</option><option value="sqrt">Square root</option><option value="log">Logarithmic</option></select></label><button onClick={() => setZoom(v => Math.min(2.4, v * 1.2))}>Zoom +</button><button onClick={() => setZoom(v => Math.max(.8, v / 1.2))}>Zoom −</button><button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>Reset</button></div></div>
    <div className="viz-image-wrap" onPointerMove={e => { if (dragging.current) setPan({ x: dragging.current.panX + e.clientX - dragging.current.x, y: dragging.current.panY + e.clientY - dragging.current.y }); }}><canvas ref={canvasRef} width="384" height="384" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); dragging.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }; }} onPointerUp={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); dragging.current = null; }} onMouseMove={e => { const rect = e.currentTarget.getBoundingClientRect(); const x = Math.max(0, Math.min(47, Math.floor((e.clientX - rect.left) / rect.width * IMAGE_SIDE))); const y = Math.max(0, Math.min(47, Math.floor((e.clientY - rect.top) / rect.height * IMAGE_SIDE))); setPixel({ x, y, value: DEMO_IMAGE_PIXELS[y]![x]! }); }} onMouseLeave={() => setPixel(null)} aria-label="Illustrative image with pixel hover values" />
      <div className="viz-colorbar"><span>High</span><i /><span>Low</span></div></div><div className="viz-pixel-readout">{pixel ? <>Pixel x {pixel.x}, y {pixel.y} · value {pixel.value.toFixed(2)} demo units</> : "Move over the image to inspect a pixel"}</div>
  </section>;
}

function BandCompare({ active }: { active: string }) {
  const [split, setSplit] = useState(50);
  return <section className="viz-band-panel"><div className="viz-band-intro"><div><strong>Compare illustrative infrared bands</strong><small>Brightness values are demo units, not calibrated flux.</small></div><label>Swipe comparison<input type="range" min="15" max="85" value={split} onChange={e => setSplit(Number(e.target.value))} aria-label="Adjust band comparison divider" /></label></div><div className="viz-band-grid">{DEMO_OBSERVATIONS.map((obs, i) => <article key={obs.id} className={obs.id === active ? "selected" : ""}><div className="viz-band-art" style={{ "--band-tone": obs.tone, "--band-size": `${32 + obs.value * 2}px` } as React.CSSProperties}><div className="viz-band-wipe" style={{ width: `${split}%` }} /><span>DEMO {i + 1}</span></div><strong>{obs.band}</strong><small>Illustrative brightness {obs.value.toFixed(1)} units</small></article>)}</div><p className="viz-inline-note">Real multi-band comparison requires compatible observations, verified timestamps, and calibrated measurements.</p></section>;
}

function TimeCompare({ active, onSelect }: { active: string; onSelect: (id: string) => void }) {
  const selected = DEMO_OBSERVATIONS.find(obs => obs.id === active) ?? DEMO_OBSERVATIONS[0]!;
  return <section className="viz-time-panel"><div className="viz-time-header"><div><strong>Observation timeline</strong><small>Three illustrative snapshots · no real exposure times</small></div><span>{selected.time}</span></div><div className="viz-timeline">{DEMO_OBSERVATIONS.map((obs, i) => <button key={obs.id} className={obs.id === active ? "active" : ""} onClick={() => onSelect(obs.id)}><span className="viz-time-dot" style={{ background: obs.tone }} /><b>{obs.time}</b><small>{obs.band}</small><i style={{ height: `${24 + obs.value * 13}px`, background: `linear-gradient(${obs.tone},#7863ac33)` }} /><em>Frame {i + 1}</em></button>)}</div><div className="viz-time-description"><b>{selected.band}</b><span>Demo brightness {selected.value.toFixed(1)} arbitrary units</span><p>This control changes which illustrative snapshot is highlighted. It does not show real time evolution or source motion.</p></div></section>;
}

export function VisualizationWorkspace() {
  const [mode, setMode] = useState<VisualizationMode>("sky"); const [selected, setSelected] = useState(DEMO_SOURCES[0]!.id);
  const [selectedSource, setSelectedSource] = useState(DEMO_SOURCES[0]!); const [educational, setEducational] = useState(false);
  const [selectedObservation, setSelectedObservation] = useState(DEMO_OBSERVATIONS[0]!.id); const [spectrumIndex, setSpectrumIndex] = useState(3); const [guided, setGuided] = useState(false); const [guideStep, setGuideStep] = useState(0);
  useEffect(() => { const params = new URLSearchParams(window.location.search); if (params.has("ra") && params.has("dec")) setMode("sky"); }, []);
  const explanation = MODE_EXPLANATIONS[mode];
  const guide = useMemo(() => ["Enter sky coordinates to find cataloged stars and solar-system objects nearby.", "Use RA and Dec to describe a direction on the sky.", "Open the 3D learning scene to explore an illustration.", "Try spectrum, image, and timeline examples; those views use illustrative data."], []);
  const nextSource = (delta: number) => { const index = DEMO_SOURCES.findIndex(item => item.id === selectedSource.id); const source = DEMO_SOURCES[(index + delta + DEMO_SOURCES.length) % DEMO_SOURCES.length]!; setSelected(source.id); setSelectedSource(source); };
  return <main className="viz-page">
    <header className="viz-header"><Brand /><nav aria-label="Main navigation"><Link href="/">Home</Link><Link href="/explore">Explorer</Link><Link href="/visualization" aria-current="page">Visualization</Link></nav><span className="viz-dataset-tag"><i /> {mode === "sky" ? "Sky map · catalog-based" : DEMO_DATA_NOTICE}</span></header>
    <section className="viz-page-title"><div><p className="viz-kicker">A SPACE YOU CAN EXPLORE</p><h1>See the data.<br /><span>Understand the universe.</span></h1><p>Move from a sky position to the measurements behind it. Start with a guided, interactive demo.</p></div><button className={`viz-learn-toggle ${educational ? "on" : ""}`} onClick={() => setEducational(v => !v)}>{educational ? "Learning mode on" : "Turn on learning mode"}<span>✦</span></button></section>
    {guided && <section className="viz-guide"><div><p className="viz-kicker">GUIDED EXPLORATION · STEP {guideStep + 1} OF {guide.length}</p><p>{guide[guideStep]}</p></div><div><button onClick={() => setGuideStep(v => (v - 1 + guide.length) % guide.length)}>Back</button><button onClick={() => setGuideStep(v => (v + 1) % guide.length)}>Next step →</button><button className="viz-guide-close" onClick={() => setGuided(false)}>Exit</button></div></section>}
    <div className="viz-workspace"><aside className="viz-side-panel"><div className="viz-side-heading"><span className="viz-side-icon">⌖</span><div><p className="viz-kicker">YOUR WORKSPACE</p><h2>Explore a dataset</h2></div></div><div className="viz-demo-callout"><span>DATA MODES</span><p>Coordinate sky map: catalog-based</p><small>3D, spectrum, image, bands, and timeline views remain illustrative demo views.</small></div><p className="viz-side-label">VISUALIZATION MODE</p><div className="viz-mode-list">{MODES.map(item => <button key={item.id} className={mode === item.id ? "active" : ""} onClick={() => setMode(item.id)} aria-pressed={mode === item.id}><span>{item.icon}</span>{item.label}<i>→</i></button>)}</div><div className="viz-selection-box"><p className="viz-side-label">{mode === "sky" ? "ILLUSTRATIVE EXAMPLE OBJECT" : "SELECTED OBJECT"}</p><div className="viz-selected-name"><i style={{ background: selectedSource.color }} /><strong>{selectedSource.name}</strong></div><p>{mode === "sky" ? "This sample object belongs to the educational 3D scene. Use the catalog markers in the sky map for the coordinate-based results." : selectedSource.description}</p>{mode !== "sky" && <><div className="viz-coord-pair"><span><small>RA · demo</small>{selectedSource.raDeg.toFixed(1)}°</span><span><small>DEC · demo</small>{selectedSource.decDeg.toFixed(1)}°</span></div><div className="viz-side-actions"><button onClick={() => nextSource(-1)} aria-label="Previous object">← Previous</button><button onClick={() => nextSource(1)}>Next →</button></div></>}</div><button className="viz-guide-launch" onClick={() => { setGuided(true); setGuideStep(0); }}>▷ Start guided exploration</button><Link className="viz-return-link" href="/explore">Open real SPHEREx Explorer <span>↗</span></Link></aside>
      <section className="viz-main-panel"><div className="viz-main-heading"><div><p className="viz-kicker">{MODES.find(item => item.id === mode)?.label.toUpperCase()}</p><h2>{mode === "space" ? "Navigate the scene" : mode === "sky" ? "Map the sky around your coordinates" : mode === "spectrum" ? "Explore a spectrum" : mode === "image" ? "Read an image" : mode === "bands" ? "Compare wavelengths" : "Explore observations over time"}</h2></div><div className="viz-main-actions"><span className="viz-illustrative-chip">{mode === "sky" ? "Catalog-based · 2D" : "Illustrative"}</span><button onClick={() => { setMode("sky"); setSelected(DEMO_SOURCES[0]!.id); setSelectedSource(DEMO_SOURCES[0]!); setSelectedObservation(DEMO_OBSERVATIONS[0]!.id); }}>{mode === "sky" ? "Reset workspace" : "Back to sky map"}</button></div></div>
        {mode === "space" && <SpaceScene selected={selected} onSelect={setSelected} onSelectSource={setSelectedSource} />}
        {mode === "sky" && <CoordinateSkyView />}
        {mode === "spectrum" && <Spectrum onSelect={setSpectrumIndex} />}
        {mode === "image" && <ImageView />}
        {mode === "bands" && <BandCompare active={selectedObservation} />}
        {mode === "time" && <TimeCompare active={selectedObservation} onSelect={setSelectedObservation} />}
        {mode !== "sky" && <section className="viz-explanation"><div className="viz-explanation-mark">i</div><div className="viz-explanation-copy"><div className="viz-explanation-title"><p className="viz-kicker">WHAT THIS VIEW MEANS</p><h3>{explanation.title}</h3></div><div className="viz-explanation-grid"><p><b>What am I looking at?</b>{explanation.what}</p><p><b>Unit</b>{explanation.unit}</p><p><b>Why is it useful?</b>{explanation.use}</p><p><b>What can we conclude?</b>{explanation.conclude}</p><p><b>What can’t we conclude?</b>{explanation.not}</p><p><b>Data source</b>SKYTRACE local visualization fixture · {DEMO_DATA_NOTICE}</p></div>{educational && <div className="viz-learning-tip"><span>✦ A little science</span><p>RA and Dec work like longitude and latitude on the sky. A coordinate tells you a direction; by itself it does not tell you how far away an object is.</p></div>}</div></section>}
      </section>
    </div><footer className="viz-footer"><span>SKYTRACE · Learn through exploration</span><span>Sky map uses catalog queries; the other science views are illustrative demo data.</span><div><button onClick={() => setEducational(v => !v)}>{educational ? "Hide learning tips" : "Show learning tips"}</button>{mode === "spectrum" && <span>Selected sample {spectrumIndex + 1} / {DEMO_SPECTRUM.length}</span>}</div></footer>
  </main>;
}
