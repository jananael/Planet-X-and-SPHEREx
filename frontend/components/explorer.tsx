"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { StarryBackground } from "./starry-background";
import { ObservationDetails } from "./observation-details";
import { ScientificEvidence } from "./scientific-evidence";
import { ExplainPlayer } from "./explain-player";
import { explainUrl, type ExplainFacts } from "../lib/explain";
import { emptyCoverageMessage, formatUtc, NOT_AVAILABLE } from "../lib/scientific-format";

// Loaded only when the user opens it (Aladin Lite + sky imagery are heavy).
const SkyMap = dynamic(() => import("./sky-map").then(m => m.SkyMap), { ssr: false });
import { errorMessage, getJson, loadBlink } from "../lib/api";
import { bestBand, defaultSelection, groupVisits, observationDates, parseCoordinates, selectDate } from "../lib/observations";
import { PIXEL_ARCSEC, STORIES, storyById, type Story } from "../lib/stories";
import type { BlinkFrame, Coordinates, FrameFailure, Observation, SearchOptions, Stretch, Target } from "../lib/types";

const targetSearch = (t: Target): SearchOptions => ({ start: t.search_start, end: t.search_end, band: t.preferred_band });

const targetIcons = { asteroid: "☄", comet: "✧", brown_dwarf: "◉", star: "✦", variable: "◈" };
const utc = formatUtc;
function month(value: string) { if (formatUtc(value) === NOT_AVAILABLE) return NOT_AVAILABLE; return new Date(value).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }); }

export function Explorer() {
  const [targets, setTargets] = useState<Target[]>([]);
  const [source, setSource] = useState<string | null>(null);
  const [startupError, setStartupError] = useState("");
  const [startupRetry, setStartupRetry] = useState(0);
  const [ra, setRa] = useState(""); const [dec, setDec] = useState("");
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [band, setBand] = useState("D3");
  const [selected, setSelected] = useState<string[]>([]);
  const [size, setSize] = useState(300); const [stretch, setStretch] = useState<Stretch>("asinh");
  const [frames, setFrames] = useState<BlinkFrame[]>([]);
  const [failures, setFailures] = useState<FrameFailure[]>([]);
  const [loadingFrames, setLoadingFrames] = useState(false);
  const [progress, setProgress] = useState({ ready: 0, completed: 0 });
  const [frameRetry, setFrameRetry] = useState(0);
  const [index, setIndex] = useState(0); const [playing, setPlaying] = useState(false);
  // "Explain it simply": plain-language scenes over the same real frames (facts from /api/explain).
  const [explain, setExplain] = useState<ExplainFacts | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainError, setExplainError] = useState("");
  useEffect(() => { setExplain(null); setExplainError(""); }, [frames]);  // new frames: new explanation
  const canExplain = frames.length > 0 && !loadingFrames && !!coordinates;
  async function openExplain() {
    if (!coordinates || !frames.length) return;
    setExplainLoading(true); setExplainError(""); setPlaying(false);
    try { setExplain(await getJson<ExplainFacts>(explainUrl(coordinates.ra, coordinates.dec, size, frames.map(f => f.obs.id)), new AbortController().signal)); }
    catch (error) { setExplainError(errorMessage(error)); }
    finally { setExplainLoading(false); }
  }
  const [viewMode, setViewMode] = useState<"images" | "video">("images");
  const [speed, setSpeed] = useState(0.7);
  const [difference, setDifference] = useState(false);
  const [compare, setCompare] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [exporting, setExporting] = useState(false);
  const compareRef = useRef(false); compareRef.current = compare;
  const [split, setSplit] = useState(50);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageBox, setStageBox] = useState({ w: 0, h: 0 });
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState("");
  const [story, setStory] = useState<{ id: string; step: number } | null>(null);
  const storyAutoplayed = useRef<string | null>(null);
  const searchController = useRef<AbortController | null>(null);
  const frameController = useRef<AbortController | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const selectedTarget = targets.find(t => t.id === targetId);
  const activeStory = story ? storyById(story.id) : undefined;
  const mapCenter = useMemo(() => {
    try { return parseCoordinates(ra, dec); } catch { return null; }
  }, [ra, dec]);

  // opts: time window + preferred band, for moving objects that are only in a few images.
  const search = useCallback(async (position: Coordinates, id: string | null = null, opts: SearchOptions = {}, preview = false) => {
    searchController.current?.abort(); frameController.current?.abort();
    const controller = new AbortController(); searchController.current = controller;
    setRa(String(position.ra)); setDec(String(position.dec)); setCoordinates(position); setTargetId(id);
    setSearching(true); setSearchError(""); setObservations([]); setSelected([]); setFrames([]); setFailures([]); setPlaying(false); setSearched(false);
    const url = new URL(window.location.href); url.searchParams.set("ra", String(position.ra)); url.searchParams.set("dec", String(position.dec));
    for (const key of ["start", "end", "band"] as const) { const v = opts[key]; if (v) url.searchParams.set(key, v); else url.searchParams.delete(key); }
    window.history.replaceState(null, "", url);
    try {
      const q = new URLSearchParams({ ra: String(position.ra), dec: String(position.dec) });
      if (opts.start) q.set("start", opts.start); if (opts.end) q.set("end", opts.end);
      const data = await getJson<{ observations: Observation[] }>(`/api/search?${q}`, controller.signal);
      if (controller.signal.aborted) return;
      const list = [...data.observations].sort((a, b) => a.mjd - b.mjd);
      const nextBand = opts.band && list.some(o => o.band === opts.band) ? opts.band : bestBand(list);
      setObservations(list); setBand(nextBand); setSelected(preview ? defaultSelection(list, nextBand) : []); setSearched(true);
    } catch (error) { if (!controller.signal.aborted) setSearchError(errorMessage(error)); }
    finally { if (!controller.signal.aborted) setSearching(false); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setStartupError("");
    Promise.all([
      getJson<{ targets: Target[] }>("/api/targets", controller.signal),
      getJson<{ data_source: string }>("/api/health", controller.signal),
    ]).then(([data, health]) => { if (!controller.signal.aborted) { setTargets(data.targets); setSource(health.data_source); } })
      .catch(error => { if (!controller.signal.aborted) { setSource(null); setStartupError(errorMessage(error)); } });
    return () => controller.abort();
  }, [startupRetry]);

  useEffect(() => {
    const readLocation = () => {
      const params = new URLSearchParams(window.location.search);
      if (params.has("ra") || params.has("dec")) {
        const r = params.get("ra") ?? "", d = params.get("dec") ?? ""; setRa(r); setDec(d);
        try { void search(parseCoordinates(r, d), null, { start: params.get("start"), end: params.get("end"), band: params.get("band") }, true); } catch (error) { setSearchError((error as Error).message); }
      }
    };
    readLocation(); window.addEventListener("popstate", readLocation);
    return () => { window.removeEventListener("popstate", readLocation); searchController.current?.abort(); frameController.current?.abort(); };
  }, [search]);

  // A shared link (?ra=&dec=) carries only coordinates: re-highlight the matching demo target.
  useEffect(() => {
    if (targetId || !coordinates || !targets.length) return;
    const match = targets.find(t => Math.abs(t.ra - coordinates.ra) < 1e-6 && Math.abs(t.dec - coordinates.dec) < 1e-6);
    if (match) setTargetId(match.id);
  }, [targets, coordinates, targetId]);

  const selectedObservations = useMemo(() => observations.filter(o => selected.includes(o.id)), [observations, selected]);
  const visits = useMemo(() => groupVisits(observations), [observations]);
  const dates = useMemo(() => observationDates(observations, band), [observations, band]);
  const knownObservationDates = useMemo(() => [...new Set(observations.map(o => formatUtc(o.obs_time)).filter(value => value !== NOT_AVAILABLE).map(value => value.slice(0, 10)))].sort(), [observations]);

  // Stage size -> on-screen size of the (square, object-fit: contain) image, for the scale bar.
  useEffect(() => {
    const el = stageRef.current; if (!el) return;
    const observer = new ResizeObserver(([entry]) => setStageBox({ w: entry.contentRect.width, h: entry.contentRect.height }));
    observer.observe(el); return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const controller = new AbortController(); frameController.current = controller;
    let owned: BlinkFrame[] = [];
    setFrames([]); setFailures([]); setIndex(0); setPlaying(false); setProgress({ ready: 0, completed: 0 });
    if (!coordinates || !selectedObservations.length) { setLoadingFrames(false); return () => controller.abort(); }
    setLoadingFrames(true);
    loadBlink(selectedObservations, { ...coordinates, size, stretch }, controller.signal, (ready, completed) => setProgress({ ready, completed }))
      .then(result => {
        owned = result.frames;
        if (controller.signal.aborted) { owned.forEach(f => URL.revokeObjectURL(f.url)); owned = []; return; }
        setFrames(result.frames); setFailures(result.failures);
        if (compareRef.current && result.frames.length > 1) setIndex(result.frames.length - 1);
      }).catch(error => {
        if (!controller.signal.aborted) setFailures([{ observation: selectedObservations[0], code: "INTERNAL_ERROR", message: errorMessage(error) }]);
      }).finally(() => { if (!controller.signal.aborted) setLoadingFrames(false); });
    return () => { controller.abort(); owned.forEach(f => URL.revokeObjectURL(f.url)); };
  }, [coordinates, selectedObservations, size, stretch, frameRetry]);

  // In Compare mode frame 1 is always the left side, so the right side skips it.
  const step = useCallback((direction: number) => {
    setIndex(i => {
      const n = frames.length; if (!n) return 0;
      let next = (i + direction + n) % n;
      if (compare && n > 1 && next === 0) next = (next + direction + n) % n;
      return next;
    });
  }, [frames.length, compare]);
  useEffect(() => {
    if (!playing || frames.length < 2 || loadingFrames) return;
    const timer = setInterval(() => step(1), speed * 1000); return () => clearInterval(timer);
  }, [playing, speed, step, frames.length, loadingFrames]);
  // A deliberate Video selection starts the sequence once its images are ready.
  // Pausing does not change these dependencies, so it stays paused until resumed.
  useEffect(() => {
    setPlaying(viewMode === "video" && frames.length >= 2 && !loadingFrames);
  }, [viewMode, frames, loadingFrames]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest("input,select,textarea,button,[contenteditable=true]")) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setPlaying(false); step(event.key === "ArrowLeft" ? -1 : 1); }
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  // Guided stories: start playback by themselves once the story's frames are ready.
  useEffect(() => {
    if (!story || loadingFrames || frames.length < 2 || storyAutoplayed.current === story.id) return;
    storyAutoplayed.current = story.id; setPlaying(true);
  }, [story, loadingFrames, frames.length]);

  const frame = frames[index];
  const showDifference = difference && frames.length > 1;
  const showCompare = compare && !showDifference && frames.length > 1 && !!frame;
  // Scale bar: the image spans `size` arcsec across its on-screen width (square, contained).
  const SCALE_ARCSEC: Record<number, number> = { 120: 30, 240: 60, 300: 60, 450: 90, 600: 120, 900: 180 };
  const imagePx = Math.min(stageBox.w, stageBox.h);
  const scaleArcsec = SCALE_ARCSEC[size] ?? Math.round(size / 5);
  const scale = frame && imagePx > 0 ? { arcsec: scaleArcsec, px: Math.round(scaleArcsec / size * imagePx), pixels: Math.round(scaleArcsec / PIXEL_ARCSEC) } : null;
  useEffect(() => {
    if (!showDifference || !canvas.current || !frame) return;
    let cancelled = false;
    // Load-event based (not img.decode(), which can stay pending while the tab is hidden).
    const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src;
    });
    Promise.all([load(frame.url), load(frames[0].url)]).then(([current, reference]) => {
      if (cancelled || !canvas.current) return;
      const surface = canvas.current; surface.width = current.naturalWidth; surface.height = current.naturalHeight;
      const context = surface.getContext("2d", { willReadFrequently: true }); if (!context) return;
      context.imageSmoothingEnabled = false;
      context.drawImage(reference, 0, 0, surface.width, surface.height); const before = context.getImageData(0, 0, surface.width, surface.height);
      context.drawImage(current, 0, 0); const after = context.getImageData(0, 0, surface.width, surface.height);
      for (let p = 0; p < after.data.length; p += 4) {
        const value = Math.max(0, Math.min(255, 128 + after.data[p] - before.data[p]));
        after.data[p] = value; after.data[p + 1] = value; after.data[p + 2] = value; after.data[p + 3] = 255;
      }
      context.putImageData(after, 0, 0);
    }).catch(() => { if (!cancelled) setDifference(false); });
    return () => { cancelled = true; };
  }, [showDifference, frame, frames]);

  function startStory(next: Story) {
    const target = targets.find(t => t.id === next.targetId); if (!target) return;
    storyAutoplayed.current = null; setDifference(false); setViewMode("video"); setStory({ id: next.id, step: 0 });
    if (target.recommended_size_arcsec) setSize(target.recommended_size_arcsec);
    void search({ ra: target.ra, dec: target.dec }, target.id, targetSearch(target), true);
    document.getElementById("viewer-title")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  // Relative moves from the latest state, so quick repeated clicks never skip or repeat a step.
  function moveStory(delta: number) {
    setStory(current => {
      const def = current && storyById(current.id); if (!current || !def) return current;
      const step = Math.min(def.steps.length - 1, Math.max(0, current.step + delta));
      setDifference(!!def.steps[step].difference); if (def.steps[step].difference) setCompare(false);
      return { id: current.id, step };
    });
  }
  function endStory() { setStory(null); setDifference(false); }
  function changeBand(value: string) { setBand(value); setSelected([]); }
  function toggle(id: string) { setSelected(ids => ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]); }
  async function exportGif() {
    setExporting(true); setShareError("");
    try {
      const { makeBlinkGif, downloadBlob } = await import("../lib/gif"); // loaded only when used
      const blob = await makeBlinkGif(frames, { delayMs: Math.round(speed * 1000), synthetic: source === "mock", dataSource: source });
      const name = targetId ?? (coordinates ? `${coordinates.ra.toFixed(4)}_${coordinates.dec.toFixed(4)}` : "sky");
      downloadBlob(blob, `skytrace-${name}.gif`);
    } catch { setShareError("The GIF could not be created. Please try again."); }
    finally { setExporting(false); }
  }
  async function share() {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setShareError(""); setTimeout(() => setCopied(false), 2000); }
    catch { setShareError("Copy the address from your browser to share this position."); }
  }

  return <div className="explorer-page">
    <StarryBackground topOnly />
    <a className="skip-link" href="#explorer">Skip to Explorer</a>
    <header className="site-header"><a href="/" className="explorer-logo" aria-label="SKYTRACE home"><img src="/skytrace/satellite-logo.png" alt="SKYTRACE satellite logo" width="1774" height="887" /></a><nav aria-label="Main navigation"><a href="/">Home</a><Link href="/explore" aria-current="page">Explorer</Link></nav><div className={`source-badge ${source === "mock" ? "mock" : ""}`}><span />{source === "mock" ? "MOCK DATA" : source === "real" ? "LIVE ARCHIVE" : "API NOT CONNECTED"}</div></header>
    <main id="explorer" className="explorer-shell">
      <section className="intro"><div><p className="eyebrow"><span />THE SKY, ACROSS TIME</p><h1>A new way to <span>look closer.</span></h1><p>Pick a patch of sky. Compare infrared observations.<br className="desktop-break" /> See what moves — and what changes.</p></div><ol className="explorer-guide" aria-label="How to explore">
        <li><span aria-hidden="true">01</span><div><strong>Choose a location</strong><p>Try a target, enter coordinates, or use the sky map.</p></div></li>
        <li><span aria-hidden="true">02</span><div><strong>Choose your moments</strong><p>Pick observations from different visits.</p></div></li>
        <li><span aria-hidden="true">03</span><div><strong>Play and compare</strong><p>Watch for changes as you move through time.</p></div></li>
      </ol></section>
      {startupError && <div className="notice error" role="alert">{startupError}<button onClick={() => setStartupRetry(n => n + 1)}>Retry connection</button></div>}
      <div className="workspace explorer-flow">
          <section className="panel target-panel" aria-labelledby="choose-title"><div className="section-heading"><span className="step-number">01</span><div><p className="eyebrow">YOUR STARTING POINT</p><h2 id="choose-title">Enter your sky coordinates</h2></div></div>
            <p className="section-hint">Enter the coordinates of the sky you want to explore. We will find the available images and dates for that location.</p>
            <div className="coordinate-entry">
            <form noValidate onSubmit={event => { event.preventDefault(); endStory(); try { void search(parseCoordinates(ra, dec), null, {}, true); } catch (error) { setSearchError((error as Error).message); } }}><div className="coordinate-grid"><label>Right ascension <span>RA · degrees</span><input aria-label="Right ascension in degrees" type="number" step="any" min="0" max="359.999999" placeholder="0 ≤ RA < 360" value={ra} onChange={event => setRa(event.target.value)} /></label><label>Declination <span>Dec · degrees</span><input aria-label="Declination in degrees" type="number" step="any" min="-90" max="90" placeholder="−90 to 90" value={dec} onChange={event => setDec(event.target.value)} /></label></div><button className="primary-button search-button" type="submit">{searching ? "Searching the sky…" : "Start exploring"}<span aria-hidden="true">↗</span></button></form>
            </div>
            {searchError && searchError !== startupError && <div className="notice error" role="alert">{searchError}{coordinates && <button onClick={() => void search(coordinates, targetId)}>Retry search</button>}</div>}
            <button type="button" className="map-toggle" aria-expanded={showMap} onClick={() => setShowMap(v => !v)}>{showMap ? "Hide sky map" : "Or pick a point on the sky map"} <span aria-hidden="true">{showMap ? "▴" : "▾"}</span></button>
            {showMap && <SkyMap center={mapCenter} onSelect={point => { setRa(String(point.ra)); setDec(String(point.dec)); setSearchError(""); }} onPick={point => { endStory(); void search(point, null, {}, true); }} />}
            <details className="starting-alternative"><summary>Or choose a suggested target</summary>
            <div className="target-list">{targets.map(target => <button key={target.id} className={`target-card ${targetId === target.id ? "selected" : ""}`} onClick={() => { endStory(); if (target.recommended_size_arcsec) setSize(target.recommended_size_arcsec); void search({ ra: target.ra, dec: target.dec }, target.id, targetSearch(target), true); }}><span className="target-icon" aria-hidden="true">{targetIcons[target.type]}</span><span><strong>{target.name}</strong><small>{target.type.replace("_", " ")}</small></span><span className="target-arrow" aria-hidden="true">↗</span></button>)}{!targets.length && <p className="muted">{startupError ? "Connect the backend to load demo targets, or enter coordinates below." : "Loading demo targets…"}</p>}</div>
            {selectedTarget && <p className="target-description">{selectedTarget.description}{selectedTarget.validation_note && <><br /><span className="muted">Target-view check ({selectedTarget.validation_status?.replace("_", " ")}): {selectedTarget.validation_note} This describes the target view, not candidate detection validation.</span></>}</p>}
</details>
            <details className="starting-alternative"><summary>Or explore with a guided story</summary>
      <section className="stories" aria-labelledby="stories-title">
        <div className="stories-heading"><p className="eyebrow"><span />GUIDED STORIES</p><h2 id="stories-title">Not sure where to look? <span>Start with a story.</span></h2></div>
        <div className="story-list">{STORIES.map(s => {
          const available = targets.some(t => t.id === s.targetId);
          return <button key={s.id} type="button" className={`story-card ${story?.id === s.id ? "active" : ""}`} disabled={!available} aria-pressed={story?.id === s.id} onClick={() => startStory(s)}>
            <span className="story-kicker">{s.kicker}</span><strong>{s.title}</strong><span className="story-summary">{s.summary}</span>
            <span className="story-go">{!available ? (targets.length ? "Demo data only" : "Loading…") : story?.id === s.id ? "In progress" : "Start story →"}</span>
          </button>;
        })}</div>
      </section>
</details>
          </section>
        <section className="panel viewer-panel" aria-labelledby="viewer-title"><div className="viewer-heading"><div className="section-heading"><span className="step-number">03</span><div><p className="eyebrow">SEE WHAT TIME REVEALS</p><h2 id="viewer-title">Your view of the sky</h2></div></div><span className="alignment-badge">◎ North up · East left</span></div>
          <div className="audience-picker" role="group" aria-label="Choose how to see the results">
            <button type="button" aria-pressed="true">
              <span className="audience-icon" aria-hidden="true">🔬</span><span className="audience-title">Scientific view</span>
              <small>The real images with time, band, wavelength, release and file. Compare, blink, difference, guided walkthrough.</small>
            </button>
            <button type="button" className="audience-simple" disabled aria-describedby="simple-soon">
              <span className="audience-icon" aria-hidden="true">✨</span><span className="audience-title">Simple explanation <span className="soon-badge" id="simple-soon">Coming soon</span></span>
              <small>An animated, narrated video that explains the change in plain words, for anyone. In progress.</small>
            </button>
          </div>
          {source && <p className={`data-source-line ${source === "mock" ? "mock" : ""}`}>{source === "real" ? "● Real data: NASA SPHEREx images from NASA/IPAC IRSA (DR1 + QR3)" : source === "mock" ? "● Synthetic demo data: not real observations" : ""}</p>}
          <div className="viewer-mode-picker" role="group" aria-label="Choose how to view observations">
            <button type="button" aria-pressed={!explain && viewMode === "images"} aria-controls="sky-observation-view" onClick={() => { setExplain(null); setViewMode("images"); setPlaying(false); }}><span>Images</span><small>Inspect one moment at a time</small></button>
            <button type="button" aria-pressed={!explain && viewMode === "video"} aria-controls="sky-observation-view" onClick={() => { setExplain(null); setViewMode("video"); setCompare(false); setPlaying(frames.length >= 2 && !loadingFrames); }}><span>Video</span><small>Watch changes across time</small></button>
            <button type="button" aria-pressed={!!explain} disabled={!canExplain || explainLoading} onClick={() => { if (!explain) void openExplain(); }}><span>{explainLoading ? "Preparing…" : "Walkthrough"}</span><small>{canExplain ? "Step by step: what changed and where" : "Load images first"}</small></button>
          </div>

          {explainError && <div className="notice error" role="alert">The walkthrough could not be prepared: {explainError}</div>}
          {explain && <ExplainPlayer frames={frames} facts={explain} onClose={() => setExplain(null)} />}
          {!explain && <p className="viewer-mode-hint" id="viewer-mode-help">{viewMode === "images" ? "Step through your selected images using the arrows or frame markers. Use Compare or Difference to inspect changes." : "An animated sequence of your selected observations, not a live telescope feed. Select at least two images, then play, pause, or adjust the interval."}</p>}
          {activeStory && story && <div className="story-panel" role="region" aria-label={`Story: ${activeStory.title}`}>
            <div className="story-panel-top"><span className="story-kicker">{activeStory.kicker} · STEP {story.step + 1} OF {activeStory.steps.length}</span><button className="story-exit" onClick={endStory} aria-label="Exit story">✕</button></div>
            <h3>{activeStory.title}</h3>
            <p aria-live="polite">{activeStory.steps[story.step].text}</p>
            <div className="story-nav"><button disabled={story.step === 0} onClick={() => moveStory(-1)}>← Back</button><span className="story-dots" aria-hidden="true">{activeStory.steps.map((_, i) => <span key={i} className={i === story.step ? "on" : ""} />)}</span>{story.step < activeStory.steps.length - 1 ? <button className="story-next" onClick={() => moveStory(1)}>Next →</button> : <button className="story-next" onClick={endStory}>Finish</button>}</div>
          </div>}
          {searched && observations.length > 0 && selected.length === 0 && <div className="viewer-availability"><p>Images are available for this location. Choose the dates you want to load.</p><a href="#available-observations">Choose your images below &darr;</a></div>}
          <div id="sky-observation-view" className="viewer-stage" style={explain ? { display: "none" } : undefined} aria-label={viewMode === "video" ? "Animated observation sequence" : "Observation image viewer"} aria-describedby="viewer-mode-help" aria-busy={loadingFrames} ref={stageRef}>
            {frame && !loadingFrames ? <>{frames.map((f, i) => <img key={f.obs.id} src={f.url} alt={`${source === "mock" ? "Synthetic demo observation" : source === "real" ? "SPHEREx observation" : "Observation (source unavailable)"}, ${utc(f.obs.obs_time)}, ${f.obs.band}`} className="sky-frame" style={{ visibility: i === index && !showDifference ? "visible" : "hidden" }} />)}{difference && frames.length > 1 && <canvas ref={canvas} className="sky-frame difference-canvas" role="img" aria-label="Difference between the current frame and the first frame" />}{showCompare && <><img src={frames[0].url} alt="" aria-hidden="true" className="sky-frame compare-reference" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }} /><span className="compare-line" style={{ left: `${split}%` }} aria-hidden="true" /><span className="compare-tag left">{utc(frames[0].obs.obs_time).slice(0, 16)}</span><span className="compare-tag right">{utc(frame.obs.obs_time).slice(0, 16)}</span><input className="compare-range" type="range" min={0} max={100} value={split} onChange={event => setSplit(Number(event.target.value))} aria-label="Move the comparison divider" /></>}{scale && <div className="scale-bar" aria-label={`Scale: ${scale.arcsec} arcseconds, about ${scale.pixels} SPHEREx pixels`}><span style={{ width: scale.px }} /><small>{scale.arcsec}″ · ≈{scale.pixels} px</small></div>}<span className="crosshair" aria-hidden="true" /><span className="stage-label">{difference && frames.length > 1 ? "DIFFERENCE · FRAME 1 REFERENCE" : showCompare ? `COMPARE · FRAME 1 | FRAME ${index + 1}` : `${frame.obs.band} · ${frame.obs.release}`}</span><span className="stage-counter">{index + 1} / {frames.length}</span><span className="north-label" aria-hidden="true">N ↑</span></> : <div className="viewer-empty"><div className={`view-reticle ${loadingFrames || searching ? "loading" : ""}`} aria-hidden="true"><span>✧</span></div><h3>{searching ? "Finding your patch of sky" : loadingFrames ? "Gathering moments in time" : failures.length ? "Images could not be loaded" : searched && !observations.length ? "A little further into the sky" : "Every comparison starts somewhere"}</h3><p>{loadingFrames ? `${progress.ready} of ${selectedObservations.length} images ready · ${progress.completed} processed` : searching ? "We’re looking for observations at your coordinates." : searched && !observations.length ? "Try another position or one of the demo targets." : selected.length === 0 && observations.length ? "Choose all images or specific dates in Available observations below to load your view." : "Enter your coordinates above to find images of this location."}</p>{loadingFrames && <><progress value={progress.completed} max={selectedObservations.length} /><small>First-time archive images can take 5–30 seconds each.</small></>}</div>}
          </div>
          <div className="playback" role="group" aria-label="Playback controls"><div className="transport"><button aria-label="Previous frame" disabled={loadingFrames || frames.length < 2} onClick={() => { setPlaying(false); step(-1); }}>◀</button><button className="play-button" aria-label={playing ? "Pause playback" : "Play comparison"} disabled={loadingFrames || frames.length < 2} onClick={() => { if (!playing) setViewMode("video"); setPlaying(p => !p); }}>{playing ? "Ⅱ" : "▶"}</button><button aria-label="Next frame" disabled={loadingFrames || frames.length < 2} onClick={() => { setPlaying(false); step(1); }}>▶</button></div><label className="speed-control" htmlFor="speed">Interval <input id="speed" type="range" min="0.2" max="2" step="0.1" value={speed} onChange={event => setSpeed(Number(event.target.value))} /><span>{speed.toFixed(1)}s</span></label></div>
          {viewMode === "video" && <div className="video-timeline"><label htmlFor="video-frame">Video sequence <span>{frames.length ? `Frame ${index + 1} of ${frames.length} / ${playing ? "Playing" : "Paused"}` : "Choose images below to begin"}</span></label><input id="video-frame" type="range" min="0" max={Math.max(0, frames.length - 1)} value={index} disabled={loadingFrames || frames.length < 2} aria-label="Seek to observation frame" aria-valuetext={frame ? utc(frame.obs.obs_time) : "No frames loaded"} onChange={event => { setPlaying(false); setIndex(Number(event.target.value)); }} /></div>}
          <div className="frame-dots" aria-label="Select a frame">{frames.map((f, i) => <button key={f.obs.id} aria-label={`Show frame ${i + 1}`} aria-pressed={i === index} onClick={() => { setPlaying(false); setIndex(i); }} />)}</div>
          <div className="comparison-modes" role="group" aria-label="Comparison modes"><p className="control-caption">Compare your images<span>Optional ways to look closer</span></p><div className="comparison-options"><label className="difference-toggle"><input type="checkbox" checked={compare} disabled={loadingFrames || frames.length < 2} onChange={event => { const on = event.target.checked; setCompare(on); if (on) { setDifference(false); setPlaying(false); setIndex(i => i === 0 ? frames.length - 1 : i); } }} /><span>Compare<small>Slide between two images</small></span></label><label className="difference-toggle"><input type="checkbox" checked={difference} disabled={loadingFrames || frames.length < 2} onChange={event => { setDifference(event.target.checked); if (event.target.checked) setCompare(false); }} /><span>Difference<small>Highlight changes from frame 1</small></span></label></div></div>
          <ObservationDetails frame={frame} reference={(showCompare || showDifference) ? frames[0] : undefined} observations={selectedObservations} frames={frames} source={source} />
          {failures.length > 0 && <div className="notice error" role="alert"><strong>{failures.length} {failures.length === 1 ? "image unavailable" : "images unavailable"}</strong><ul>{failures.map(f => <li key={f.observation.id}>{utc(f.observation.obs_time)}: {f.message}</li>)}</ul><button onClick={() => setFrameRetry(n => n + 1)}>Retry images</button></div>}
          <div className="viewer-settings"><div className="image-adjustments"><p className="control-caption">Image settings<span>Adjust how observations appear</span></p><div className="adjustment-fields"><label>Display stretch<select value={stretch} onChange={event => setStretch(event.target.value as Stretch)}><option value="asinh">Asinh</option><option value="zscale">Zscale</option><option value="linear">Linear</option></select></label><label>Field of view<select value={size} onChange={event => setSize(Number(event.target.value))}><option value="120">120″ · closer</option><option value="240">240″</option><option value="300">300″ · standard</option><option value="450">450″</option><option value="600">600″ · wider</option><option value="900">900″ · widest</option></select></label></div></div><div className="export-actions"><p className="control-caption">Save &amp; share<span>Take your comparison with you</span></p><div className="export-buttons"><button className="share-button" disabled={loadingFrames || frames.length < 2 || exporting} onClick={() => void exportGif()}>{exporting ? "Making GIF…" : "Download GIF ↓"}</button><button className="share-button" disabled={!coordinates} onClick={() => void share()}>{copied ? "Link copied ✓" : "Share position ↗"}</button></div></div></div>
          {shareError && <p className="tiny" role="status">{shareError}</p>}<p className="viewer-footnote">Aligned sky position. Shared brightness scale. A fairer comparison.<br />{difference ? "Difference mode subtracts the first displayed PNG from the current one; it is a visual aid, not a scientific flux measurement." : "Tip: use the left and right arrow keys to step through your frames."}</p>
        </section>
          <section id="available-observations" className="panel results-panel" aria-labelledby="results-title"><div className="section-heading"><span className="step-number">02</span><div><p className="eyebrow">MOMENTS TO COMPARE</p><h2 id="results-title">Available observations <span className="count">{searched ? observations.length : NOT_AVAILABLE}</span></h2></div></div>
            <p className="section-hint" role="status">{searching ? "Searching the archive. Real data may take 5–15 seconds." : !searched ? "Your search results will appear here." : !observations.length ? emptyCoverageMessage(source) : `${visits.length} ${visits.length === 1 ? "visit" : "visits"} · oldest first`}</p>
            {searched && observations.length > 0 && <div className="archive-availability" role="status">
              <p className="eyebrow">{source === "real" ? "NASA / IPAC IRSA ARCHIVE" : source === "mock" ? "SYNTHETIC DEMO DATA" : "OBSERVATION SEARCH RESULTS"}</p>
              <h3>{observations.length} images found / {knownObservationDates.length ? `${knownObservationDates.length} reported dates` : "Observation dates not available"}</h3>
              <p>Available from {(knownObservationDates[0] ?? NOT_AVAILABLE)} to {(knownObservationDates.at(-1) ?? NOT_AVAILABLE)} for RA {coordinates?.ra.toFixed(4)}°, Dec {coordinates?.dec.toFixed(4)}°.</p>
              <p>Use all images in one detector band, or choose specific dates below. Keeping a single band helps make the comparison more consistent.</p>
              <div className="availability-actions"><button className="primary-button" onClick={() => setSelected(observations.filter(o => o.band === band).map(o => o.id))}>Use all {band} images</button><a href="#observation-dates">Choose specific dates</a></div>
            </div>}
            <fieldset className="band-filter" disabled={!observations.length}><legend>Detector band</legend>{["D1", "D2", "D3", "D4", "D5", "D6"].map(value => <button key={value} type="button" aria-pressed={band === value} disabled={!observations.some(o => o.band === value)} className={band === value ? "active" : ""} onClick={() => changeBand(value)}>{value}</button>)}</fieldset>
            {!!observations.length && <><div className="selection-tools"><span>{selected.length} selected</span><button onClick={() => setSelected(observations.filter(o => o.band === band).map(o => o.id))}>Select all {band}</button><button onClick={() => setSelected(defaultSelection(observations, band))}>Suggested selection</button></div><p className="tiny muted">Suggested selection picks one frame per visit (all exposures when there is only one visit). You can also select dates or individual images.</p></>}
            {observations.length > 0 && <fieldset id="observation-dates" className="observation-dates"><legend>Choose the dates you want to view</legend><p className="tiny muted">Dates below have images in {band}. Select a date to include its images, or fine-tune individual exposures in the visits below.</p><div className="date-options">{dates.map(({ date, images }) => {
              const included = images.filter(o => selected.includes(o.id)).length;
              return <label key={date}><input type="checkbox" aria-label={`Include images from ${date}`} checked={included === images.length} ref={el => { if (el) el.indeterminate = included > 0 && included < images.length; }} onChange={event => { const checked = event.target.checked; setSelected(ids => selectDate(ids, images, checked)); }} /><span>{date}<small>{images.length} {images.length === 1 ? "image" : "images"}</small></span></label>;
            })}</div></fieldset>}
            <div className="visits">{visits.map((visit, i) => {
              const matching = visit.filter(o => o.band === band); if (!matching.length) return null;
              return <details key={visit[0].id} open={visits.length <= 4}><summary><span>Visit {i + 1}<small>{month(visit[0].obs_time)}</small></span><span className="visit-count">{matching.length} frames</span></summary><div className="visit-frames">{matching.map(obs => <label key={obs.id}><input type="checkbox" checked={selected.includes(obs.id)} onChange={() => toggle(obs.id)} /><span>{utc(obs.obs_time)}<small>{obs.band} · {obs.release}</small></span></label>)}</div></details>;
            })}</div>
          </section>
        <ScientificEvidence coordinates={coordinates} observations={selectedObservations} frames={frames} source={source} searching={searching} noCoverage={searched && observations.length === 0} searchFailed={!!searchError} loadingImages={loadingFrames} />
      </div>
      <section className="explore-note"><span aria-hidden="true">✦</span><p><strong>Explore with curiosity. Compare with care.</strong> These observations help you investigate changes, not confirm discoveries. A quiet-looking sky can still tell a story.</p></section>
    </main>
    <footer className="site-footer"><a href="/" className="explorer-logo" aria-label="SKYTRACE home"><img src="/skytrace/satellite-logo.png" alt="SKYTRACE satellite logo" width="1774" height="887" /></a><p>Data: NASA SPHEREx via NASA/IPAC IRSA · NASA Space Apps Challenge 2026 project, not an official NASA product.</p><nav aria-label="Footer navigation"><a href="/">Home</a><Link href="/explore" aria-current="page">Explorer</Link></nav></footer>
  </div>;
}
