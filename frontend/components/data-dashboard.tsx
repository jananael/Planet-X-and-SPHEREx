"use client";
// Data dashboard on REAL data: everything here comes from /api/search for one sky location (NASA SPHEREx
// via IRSA) and, only when the user asks, from the candidate engine (/api/candidates). No invented numbers.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Brand } from "./brand";
import { constellationId, drawSkyBackdrop, loadCatalog, skyPainter, SKY_H, SKY_W, type Catalog } from "./sky-backdrop";
import { errorMessage, getCandidateAnalysis, getJson } from "../lib/api";
import { bandShares, BAND_COLORS, candidateSummary, latest, monthlyHistogram, overview, wavelengthCoverage, type CandidateLike } from "../lib/dashboard";
import { candidateSearchGroup } from "../lib/observations";
import { skyRegion } from "../lib/sky-navigation";
import type { Coordinates, Observation, Target } from "../lib/types";
import "./data-dashboard.css";

type Place = { point: Coordinates; name: string; targetId: string | null; start?: string | null; end?: string | null };
const fmtDate = (iso: string | null) => iso ? new Date(iso).toISOString().slice(0, 10) : "—";
const pct = (x: number) => `${Math.round(x * 100)}%`;

function SkyThumb({ point, onRegion }: { point: Coordinates; onRegion: (name: string | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  useEffect(() => { loadCatalog().then(setCatalog, () => setCatalog(null)); }, []);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d"); if (!ctx || !catalog) return;
    const region = skyRegion(point, catalog.bounds, catalog.names); onRegion(region);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const painter = skyPainter(ctx, point.ra);
    drawSkyBackdrop(painter, catalog, point.ra, constellationId(catalog, region), 0);
    const [x, y] = painter.P(point.ra, point.dec);
    ctx.strokeStyle = "#ffd166"; ctx.lineWidth = 2.5; ctx.shadowColor = "#ffb84d"; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0;
    ctx.restore();
  }, [catalog, point, onRegion]);
  return <canvas ref={canvas} width={SKY_W} height={SKY_H} className="dash-sky" role="img" aria-label="The selected location on the real all-sky map" />;
}

function Donut({ slices, total }: { slices: ReturnType<typeof bandShares>; total: number }) {
  const R = 70, r = 44, C = 90; let a0 = -Math.PI / 2;
  const arcs = slices.map(s => {
    const a1 = a0 + s.share * Math.PI * 2, large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (a: number, rad: number) => `${C + rad * Math.cos(a)} ${C + rad * Math.sin(a)}`;
    const d = s.share >= 0.9999 ? `M ${p(0, R)} A ${R} ${R} 0 1 1 ${p(Math.PI, R)} A ${R} ${R} 0 1 1 ${p(0, R)} M ${p(0, r)} A ${r} ${r} 0 1 0 ${p(Math.PI, r)} A ${r} ${r} 0 1 0 ${p(0, r)}`
      : `M ${p(a0, R)} A ${R} ${R} 0 ${large} 1 ${p(a1, R)} L ${p(a1, r)} A ${r} ${r} 0 ${large} 0 ${p(a0, r)} Z`;
    a0 = a1; return { ...s, d };
  });
  return <div className="dash-donut-wrap">
    <svg viewBox="0 0 180 180" className="dash-donut" role="img" aria-label="Images by detector band">
      {arcs.map(s => <path key={s.band} d={s.d} fill={s.color} stroke="#0b1020" strokeWidth="2"><title>{`${s.band}: ${s.count} images (${pct(s.share)})`}</title></path>)}
      <text x="90" y="86" textAnchor="middle" className="dash-donut-num">{total}</text>
      <text x="90" y="104" textAnchor="middle" className="dash-donut-sub">images</text>
    </svg>
    <ul className="dash-legend">{slices.map(s => <li key={s.band}><i style={{ background: s.color }} />{s.band}<b>{pct(s.share)}</b><small>{s.count}</small></li>)}</ul>
  </div>;
}

function CoverageChart({ coverage }: { coverage: ReturnType<typeof wavelengthCoverage> }) {
  const W = 520, H = 40 + coverage.length * 30, x = (um: number) => 50 + (um - 0.4) / (5.1 - 0.4) * (W - 70);
  return <svg viewBox={`0 0 ${W} ${H}`} className="dash-coverage" role="img" aria-label="Infrared wavelengths covered by each detector">
    <rect x={x(0.4)} y={8} width={x(0.7) - x(0.4)} height={H - 34} className="dash-visible" />
    <text x={(x(0.4) + x(0.7)) / 2} y={H - 30} textAnchor="middle" className="dash-axis">eye</text>
    {coverage.map((c, i) => <g key={c.band}>
      <text x={8} y={30 + i * 30} className="dash-axis-strong">{c.band}</text>
      <rect x={x(c.fromUm)} y={18 + i * 30} width={Math.max(3, x(c.toUm) - x(c.fromUm))} height={16} rx={4} fill={c.color}><title>{`${c.band}: ${c.fromUm.toFixed(2)}–${c.toUm.toFixed(2)} µm, ${c.images} images`}</title></rect>
      <text x={x(c.toUm) + 6} y={30 + i * 30} className="dash-axis">{c.images}</text>
    </g>)}
    {[1, 2, 3, 4, 5].map(u => <g key={u}><line x1={x(u)} x2={x(u)} y1={10} y2={H - 22} className="dash-grid" /><text x={x(u)} y={H - 6} textAnchor="middle" className="dash-axis">{u} µm</text></g>)}
  </svg>;
}

function Histogram({ bins }: { bins: ReturnType<typeof monthlyHistogram> }) {
  const W = 560, H = 190, max = Math.max(1, ...bins.map(b => b.total)), bw = (W - 50) / Math.max(1, bins.length);
  const every = Math.ceil(bins.length / 10);
  return <svg viewBox={`0 0 ${W} ${H}`} className="dash-hist" role="img" aria-label="Images per month, split by detector">
    {[0, 0.5, 1].map(f => <g key={f}><line x1={40} x2={W} y1={160 - f * 140} y2={160 - f * 140} className="dash-grid" /><text x={34} y={164 - f * 140} textAnchor="end" className="dash-axis">{Math.round(max * f)}</text></g>)}
    {bins.map((b, i) => { let y = 160; return <g key={b.month}>
      {Object.entries(b.counts).sort(([a], [c]) => a.localeCompare(c)).map(([band, n]) => { const h = n / max * 140; y -= h; return <rect key={band} x={44 + i * bw} y={y} width={Math.max(2, bw - 3)} height={h} fill={BAND_COLORS[band]}><title>{`${b.label}: ${n} ${band} images`}</title></rect>; })}
      {i % every === 0 && <text x={44 + i * bw + bw / 2} y={178} textAnchor="middle" className="dash-axis">{b.label}</text>}
    </g>; })}
  </svg>;
}

function Bars({ rows, color }: { rows: { label: string; count: number }[]; color: string }) {
  const max = Math.max(1, ...rows.map(r => r.count));
  return <ul className="dash-bars">{rows.map(r => <li key={r.label}><span>{r.label}</span><i><b style={{ width: `${(r.count / max) * 100}%`, background: color }} /></i><em>{r.count}</em></li>)}</ul>;
}

export function DataDashboard({ onLearningLab }: { onLearningLab: () => void }) {
  const [targets, setTargets] = useState<Target[]>([]);
  const [place, setPlace] = useState<Place | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState("");
  const [region, setRegion] = useState<string | null>(null);
  const [engine, setEngine] = useState<{ state: "idle" | "running" | "done" | "error"; candidates: CandidateLike[]; message: string }>({ state: "idle", candidates: [], message: "" });

  // Location: the one shared from the Explorer (?ra&dec&target), else a demo target with plenty of data.
  useEffect(() => {
    const c = new AbortController();
    getJson<{ targets: Target[] }>("/api/targets", c.signal).then(({ targets }) => {
      setTargets(targets);
      const q = new URLSearchParams(window.location.search), ra = Number(q.get("ra")), dec = Number(q.get("dec"));
      const t = targets.find(t => t.id === q.get("target"));
      if (q.has("ra") && Number.isFinite(ra) && Number.isFinite(dec)) setPlace({ point: { ra, dec }, name: t?.name ?? `RA ${ra.toFixed(3)}°, Dec ${dec.toFixed(3)}°`, targetId: t?.id ?? null, start: q.get("start") ?? t?.search_start, end: q.get("end") ?? t?.search_end });
      else { const d = targets.find(t => t.id === "mira") ?? targets[0]; if (d) setPlace({ point: { ra: d.ra, dec: d.dec }, name: d.name, targetId: d.id, start: d.search_start, end: d.search_end }); }
    }).catch(e => { setStatus("error"); setError(errorMessage(e)); });
    return () => c.abort();
  }, []);

  useEffect(() => {
    if (!place) return;
    const c = new AbortController(); setStatus("loading"); setError(""); setEngine({ state: "idle", candidates: [], message: "" });
    const q = new URLSearchParams({ ra: String(place.point.ra), dec: String(place.point.dec) });
    if (place.start) q.set("start", place.start); if (place.end) q.set("end", place.end);
    getJson<{ observations: Observation[] }>(`/api/search?${q}`, c.signal)
      .then(d => { setObservations(d.observations); setStatus("ready"); })
      .catch(e => { if (!c.signal.aborted) { setStatus("error"); setError(errorMessage(e)); } });
    return () => c.abort();
  }, [place]);

  const ov = useMemo(() => overview(observations), [observations]);
  const slices = useMemo(() => bandShares(observations), [observations]);
  const coverage = useMemo(() => wavelengthCoverage(observations), [observations]);
  const months = useMemo(() => monthlyHistogram(observations), [observations]);
  const recent = useMemo(() => latest(observations, 6), [observations]);
  const topBand = slices.slice().sort((a, b) => b.count - a.count)[0]?.band ?? null;
  const group = useMemo(() => candidateSearchGroup(observations.filter(o => o.band === topBand)), [observations, topBand]);
  const summary = useMemo(() => candidateSummary(engine.candidates), [engine.candidates]);

  async function runEngine() {
    if (!place || !group.ok) return;
    setEngine({ state: "running", candidates: [], message: "" });
    try {
      const r = await getCandidateAnalysis(place.point.ra, place.point.dec, group.band, group.pipeline, new AbortController().signal);
      setEngine({ state: "done", candidates: r.candidates as unknown as CandidateLike[], message: "" });
    } catch (e) { setEngine({ state: "error", candidates: [], message: errorMessage(e) }); }
  }
  const explorerHref = place ? `/observations?ra=${place.point.ra}&dec=${place.point.dec}${place.targetId ? `&target=${place.targetId}` : ""}` : "/explore";

  return <div className="dash-page">
    <header className="dash-header"><Brand /><nav aria-label="Main navigation"><Link href="/">Home</Link><Link href="/explore">Explorer</Link><Link href="/visualization" aria-current="page">Visualization</Link></nav><span className="dash-real-tag"><i /> Real NASA SPHEREx data · IRSA</span></header>
    <div className="dash-title">
      <div><p className="dash-kicker">DATA DASHBOARD</p><h1>{place?.name ?? "Loading…"}</h1>
        <p>Everything below is computed from the real SPHEREx images found at this location{place?.start ? " in its time window" : ""}.</p></div>
      <div className="dash-controls">
        <label>Location<select value={place?.targetId ?? ""} onChange={e => { const t = targets.find(t => t.id === e.target.value); if (t) setPlace({ point: { ra: t.ra, dec: t.dec }, name: t.name, targetId: t.id, start: t.search_start, end: t.search_end }); }}>
          {!place?.targetId && <option value="">{place?.name ?? "Custom location"}</option>}
          {targets.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select></label>
        <button type="button" className="dash-lab" onClick={onLearningLab}>Learning lab (demo) →</button>
      </div>
    </div>
    {status === "error" && <div className="notice error" role="alert">The data could not be loaded: {error}</div>}
    {status === "loading" && <p className="dash-loading" role="status">Searching the NASA archive for this location… (5–15 s the first time)</p>}
    {status === "ready" && !observations.length && <p className="dash-loading">SPHEREx has no images here in the data we searched.</p>}
    {status === "ready" && observations.length > 0 && place && <div className="dash-grid">
      <section className="dash-card dash-overview" aria-labelledby="ov-title">
        <h2 id="ov-title"><i />Sky overview</h2>
        <SkyThumb point={place.point} onRegion={setRegion} />
        <dl className="dash-kpis">
          <div><dt>Images</dt><dd>{ov.images.toLocaleString()}</dd></div>
          <div><dt>Visits</dt><dd>{ov.visits}</dd></div>
          <div><dt>Observing dates</dt><dd>{ov.dates}</dd></div>
          <div><dt>Detector bands</dt><dd>{ov.bands} / 6</dd></div>
          <div><dt>Time span</dt><dd>{ov.spanDays} days</dd></div>
          <div><dt>Constellation</dt><dd>{region ?? "—"}</dd></div>
        </dl>
        <p className="dash-note">{fmtDate(ov.first)} → {fmtDate(ov.last)} · releases {ov.releases.join(" + ")} · pipeline {ov.pipelines.join(", ") || "—"} · RA {place.point.ra.toFixed(4)}°, Dec {place.point.dec.toFixed(4)}°</p>
      </section>
      <section className="dash-card" aria-labelledby="band-title">
        <h2 id="band-title"><i />Images by detector</h2>
        <Donut slices={slices} total={ov.images} />
        <p className="dash-note">SPHEREx has 6 detectors, each seeing a different slice of infrared light (D1 shortest, D6 longest).</p>
      </section>
      <section className="dash-card" aria-labelledby="cov-title">
        <h2 id="cov-title"><i />Wavelength coverage</h2>
        <CoverageChart coverage={coverage} />
        <p className="dash-note">Bars: the infrared range each detector covers here, with its number of images. The shaded strip is the light our eyes can see.</p>
      </section>
      <section className="dash-card dash-wide" aria-labelledby="time-title">
        <h2 id="time-title"><i />Observation timeline</h2>
        <Histogram bins={months} />
        <p className="dash-note">Images per month, coloured by detector. SPHEREx comes back to the same patch about every six months: gaps between bars are when it was looking elsewhere.</p>
      </section>
      <section className="dash-card dash-wide" aria-labelledby="engine-title">
        <h2 id="engine-title"><i />Candidate engine</h2>
        {engine.state === "idle" && <div className="dash-engine-start">
          <p>Run the science engine on up to three {group.ok ? `${group.band} / ${group.pipeline}` : ""} images of this region. It looks for sources that move or change between visits. The first run downloads large images and can take several minutes; later runs are cached.</p>
          <button type="button" className="primary-button" disabled={!group.ok} onClick={() => void runEngine()}>Analyze this region</button>
          {!group.ok && <small>{group.message}</small>}
        </div>}
        {engine.state === "running" && <p className="dash-loading" role="status">The engine is analysing real SPHEREx images… this can take a few minutes the first time.</p>}
        {engine.state === "error" && <div className="notice error" role="alert">{engine.message}</div>}
        {engine.state === "done" && <div className="dash-engine">
          <dl className="dash-kpis small">
            <div><dt>Candidates</dt><dd>{summary.total}</dd></div>
            <div><dt>Known objects</dt><dd>{summary.known}</dd></div>
            <div><dt>With quality flags</dt><dd>{summary.flagged}</dd></div>
            <div><dt>Pending validation</dt><dd>{summary.pending}</dd></div>
          </dl>
          <div><h3>By type</h3><Bars rows={summary.byType} color="#c27af3" /></div>
          <div><h3>Signal-to-noise of detections</h3><Bars rows={summary.snrBins} color="#45b7d1" /></div>
          <p className="dash-note">Every candidate is <b>pending validation</b>: a first-pass engine (thresholds still provisional) — not a discovery. Most “shifts under 1 pixel” are still stars measured slightly differently.</p>
        </div>}
      </section>
      <section className="dash-card dash-wide" aria-labelledby="recent-title">
        <h2 id="recent-title"><i />Latest observations</h2>
        <div className="dash-table-wrap"><table className="dash-table">
          <thead><tr><th>Date (UTC)</th><th>Detector</th><th>Wavelength range</th><th>Release</th><th>File</th></tr></thead>
          <tbody>{recent.map(o => <tr key={o.id}>
            <td>{o.obs_time.replace("T", " ").slice(0, 16)}</td>
            <td><i style={{ background: BAND_COLORS[o.band] }} />{o.band}</td>
            <td>{o.wavelength_range_um ? `${o.wavelength_range_um[0].toFixed(2)}–${o.wavelength_range_um[1].toFixed(2)} µm` : "—"}</td>
            <td>{o.release}</td>
            <td className="dash-file">{o.source_file}</td>
          </tr>)}</tbody>
        </table></div>
        <Link className="dash-open" href={explorerHref}>Open these images in the Explorer →</Link>
      </section>
    </div>}
    <footer className="dash-footer">Data: NASA SPHEREx via NASA/IPAC IRSA · stars: Hipparcos · constellations: IAU · NASA Space Apps 2026 project, not an official NASA product.</footer>
  </div>;
}
