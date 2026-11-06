"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Brand } from "./brand";

// Loaded only when the user opens it (Aladin Lite + sky imagery are heavy).
const SkyMap = dynamic(() => import("./sky-map").then(m => m.SkyMap), { ssr: false });
import { errorMessage, getJson, loadBlink } from "../lib/api";
import { bestBand, defaultSelection, groupVisits, parseCoordinates } from "../lib/observations";
import { PIXEL_ARCSEC, STORIES, storyById, type Story } from "../lib/stories";
import type { BlinkFrame, Coordinates, FrameFailure, Observation, Stretch, Target } from "../lib/types";

const targetIcons = { asteroid: "☄", comet: "✧", brown_dwarf: "◉", star: "✦", variable: "◈" };
function utc(value: string) { return new Date(value).toISOString().replace("T", " ").replace(/\.\d+Z$|Z$/, " UTC"); }
function month(value: string) { return new Date(value).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }); }

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

  const search = useCallback(async (position: Coordinates, id: string | null = null) => {
    searchController.current?.abort(); frameController.current?.abort();
    const controller = new AbortController(); searchController.current = controller;
    setRa(String(position.ra)); setDec(String(position.dec)); setCoordinates(position); setTargetId(id);
    setSearching(true); setSearchError(""); setObservations([]); setSelected([]); setFrames([]); setFailures([]); setPlaying(false); setSearched(false);
    const url = new URL(window.location.href); url.searchParams.set("ra", String(position.ra)); url.searchParams.set("dec", String(position.dec));
    window.history.replaceState(null, "", url);
    try {
      const data = await getJson<{ observations: Observation[] }>(`/api/search?ra=${position.ra}&dec=${position.dec}`, controller.signal);
      if (controller.signal.aborted) return;
      const list = [...data.observations].sort((a, b) => a.mjd - b.mjd);
      const nextBand = bestBand(list);
      setObservations(list); setBand(nextBand); setSelected(defaultSelection(list, nextBand)); setSearched(true);
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
        try { void search(parseCoordinates(r, d)); } catch (error) { setSearchError((error as Error).message); }
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
  const SCALE_ARCSEC: Record<number, number> = { 120: 30, 300: 60, 600: 120 };
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

  const wavelengths = frames.flatMap(f => f.wavelengthUm === null ? [] : [f.wavelengthUm]);
  const wavelengthWarning = wavelengths.length > 1 && Math.max(...wavelengths) - Math.min(...wavelengths) > 0.05;
  function startStory(next: Story) {
    const target = targets.find(t => t.id === next.targetId); if (!target) return;
    storyAutoplayed.current = null; setDifference(false); setStory({ id: next.id, step: 0 });
    void search({ ra: target.ra, dec: target.dec }, target.id);
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
  function changeBand(value: string) { setBand(value); setSelected(defaultSelection(observations, value)); }
  function toggle(id: string) { setSelected(ids => ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]); }
  async function exportGif() {
    setExporting(true); setShareError("");
    try {
      const { makeBlinkGif, downloadBlob } = await import("../lib/gif"); // loaded only when used
      const blob = await makeBlinkGif(frames, { delayMs: Math.round(speed * 1000), synthetic: source === "mock" });
      const name = targetId ?? (coordinates ? `${coordinates.ra.toFixed(4)}_${coordinates.dec.toFixed(4)}` : "sky");
      downloadBlob(blob, `skytrace-${name}.gif`);
    } catch { setShareError("The GIF could not be created. Please try again."); }
    finally { setExporting(false); }
  }
  async function share() {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setShareError(""); setTimeout(() => setCopied(false), 2000); }
    catch { setShareError("Copy the address from your browser to share this position."); }
  }

  return <>
    <a className="skip-link" href="#explorer">Skip to Explorer</a>
    <header className="site-header"><Brand /><nav aria-label="Main navigation"><Link href="/">Home</Link><Link href="/explore" aria-current="page">Explorer</Link></nav><div className={`source-badge ${source === "mock" ? "mock" : ""}`}><span />{source === "mock" ? "MOCK DATA" : source === "real" ? "LIVE ARCHIVE" : "API NOT CONNECTED"}</div></header>
    <main id="explorer" className="explorer-shell">
      <section className="intro"><div><p className="eyebrow"><span />THE SKY, ACROSS TIME</p><h1>A new way to <span>look closer.</span></h1><p>Pick a patch of sky. Compare infrared observations.<br className="desktop-break" /> See what moves — and what changes.</p></div><div className="intro-note"><span className="orbit-mark" aria-hidden="true">✧</span><span>One sky.<br /><strong>Different moments.</strong></span></div></section>
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
      {startupError && <div className="notice error" role="alert">{startupError}<button onClick={() => setStartupRetry(n => n + 1)}>Retry connection</button></div>}
      <div className="workspace">
        <aside className="sidebar">
          <section className="panel target-panel" aria-labelledby="choose-title"><div className="section-heading"><span className="step-number">01</span><div><p className="eyebrow">YOUR STARTING POINT</p><h2 id="choose-title">Choose a location</h2></div></div>
            <p className="section-hint">Start with a familiar explorer’s target.</p>
            <div className="target-list">{targets.map(target => <button key={target.id} className={`target-card ${targetId === target.id ? "selected" : ""}`} onClick={() => { endStory(); void search({ ra: target.ra, dec: target.dec }, target.id); }}><span className="target-icon" aria-hidden="true">{targetIcons[target.type]}</span><span><strong>{target.name}</strong><small>{target.type.replace("_", " ")}</small></span><span className="target-arrow" aria-hidden="true">↗</span></button>)}{!targets.length && <p className="muted">{startupError ? "Connect the backend to load demo targets, or enter coordinates below." : "Loading demo targets…"}</p>}</div>
            {selectedTarget && <p className="target-description">{selectedTarget.description}{["barnards-star", "wise-0855-0714"].includes(selectedTarget.id) && " Motion is less than one SPHEREx pixel between six-month visits."}</p>}
            <div className="divider-label"><span />OR ENTER COORDINATES<span /></div>
            <form noValidate onSubmit={event => { event.preventDefault(); endStory(); try { void search(parseCoordinates(ra, dec)); } catch (error) { setSearchError((error as Error).message); } }}><div className="coordinate-grid"><label>Right ascension <span>RA · degrees</span><input aria-label="Right ascension in degrees" type="number" step="any" min="0" max="359.999999" placeholder="0 ≤ RA < 360" value={ra} onChange={event => setRa(event.target.value)} /></label><label>Declination <span>Dec · degrees</span><input aria-label="Declination in degrees" type="number" step="any" min="-90" max="90" placeholder="−90 to 90" value={dec} onChange={event => setDec(event.target.value)} /></label></div><button className="primary-button search-button" type="submit">{searching ? "Searching the sky…" : "Search observations"}<span aria-hidden="true">↗</span></button></form>
            {searchError && <div className="notice error" role="alert">{searchError}{coordinates && <button onClick={() => void search(coordinates, targetId)}>Retry search</button>}</div>}
            <button type="button" className="map-toggle" aria-expanded={showMap} onClick={() => setShowMap(v => !v)}>{showMap ? "Hide sky map" : "Or pick a point on the sky map"} <span aria-hidden="true">{showMap ? "▴" : "▾"}</span></button>
            {showMap && <SkyMap center={coordinates} markers={targets} onPick={point => { endStory(); void search(point); }} />}
          </section>
          <section className="panel results-panel" aria-labelledby="results-title"><div className="section-heading"><span className="step-number">02</span><div><p className="eyebrow">MOMENTS TO COMPARE</p><h2 id="results-title">Observations <span className="count">{observations.length}</span></h2></div></div>
            <p className="section-hint" role="status">{searching ? "Searching the archive. Real data may take 5–15 seconds." : !searched ? "Your search results will appear here." : !observations.length ? "No SPHEREx coverage here yet. Try another location." : `${visits.length} ${visits.length === 1 ? "visit" : "visits"} · oldest first`}</p>
            <fieldset className="band-filter" disabled={!observations.length}><legend>Detector band</legend>{["D1", "D2", "D3", "D4", "D5", "D6"].map(value => <button key={value} type="button" aria-pressed={band === value} disabled={!observations.some(o => o.band === value)} className={band === value ? "active" : ""} onClick={() => changeBand(value)}>{value}</button>)}</fieldset>
            {!!observations.length && <><div className="selection-tools"><span>{selected.length} selected</span><button onClick={() => setSelected(observations.filter(o => o.band === band).map(o => o.id))}>Select all {band}</button><button onClick={() => setSelected(defaultSelection(observations, band))}>Reset</button></div><p className="tiny muted">One frame per visit is selected by default (all exposures when there is only one visit). Select more to compare motion within a visit.</p></>}
            <div className="visits">{visits.map((visit, i) => {
              const matching = visit.filter(o => o.band === band); if (!matching.length) return null;
              return <details key={visit[0].id} open={visits.length <= 4}><summary><span>Visit {i + 1}<small>{month(visit[0].obs_time)}</small></span><span className="visit-count">{matching.length} frames</span></summary><div className="visit-frames">{matching.map(obs => <label key={obs.id}><input type="checkbox" checked={selected.includes(obs.id)} onChange={() => toggle(obs.id)} /><span>{utc(obs.obs_time)}<small>{obs.band} · {obs.release}</small></span></label>)}</div></details>;
            })}</div>
          </section>
        </aside>
        <section className="panel viewer-panel" aria-labelledby="viewer-title"><div className="viewer-heading"><div className="section-heading"><span className="step-number">03</span><div><p className="eyebrow">SEE WHAT TIME REVEALS</p><h2 id="viewer-title">Blink viewer</h2></div></div><span className="alignment-badge">◎ North up · East left</span></div>
          {activeStory && story && <div className="story-panel" role="region" aria-label={`Story: ${activeStory.title}`}>
            <div className="story-panel-top"><span className="story-kicker">{activeStory.kicker} · STEP {story.step + 1} OF {activeStory.steps.length}</span><button className="story-exit" onClick={endStory} aria-label="Exit story">✕</button></div>
            <h3>{activeStory.title}</h3>
            <p aria-live="polite">{activeStory.steps[story.step].text}</p>
            <div className="story-nav"><button disabled={story.step === 0} onClick={() => moveStory(-1)}>← Back</button><span className="story-dots" aria-hidden="true">{activeStory.steps.map((_, i) => <span key={i} className={i === story.step ? "on" : ""} />)}</span>{story.step < activeStory.steps.length - 1 ? <button className="story-next" onClick={() => moveStory(1)}>Next →</button> : <button className="story-next" onClick={endStory}>Finish</button>}</div>
          </div>}
          <div className="viewer-stage" aria-busy={loadingFrames} ref={stageRef}>
            {frame && !loadingFrames ? <>{frames.map((f, i) => <img key={f.obs.id} src={f.url} alt={`SPHEREx observation, ${utc(f.obs.obs_time)}, ${f.obs.band}`} className="sky-frame" style={{ visibility: i === index && !showDifference ? "visible" : "hidden" }} />)}{difference && frames.length > 1 && <canvas ref={canvas} className="sky-frame difference-canvas" role="img" aria-label="Difference between the current frame and the first frame" />}{showCompare && <><img src={frames[0].url} alt="" aria-hidden="true" className="sky-frame compare-reference" style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }} /><span className="compare-line" style={{ left: `${split}%` }} aria-hidden="true" /><span className="compare-tag left">{utc(frames[0].obs.obs_time).slice(0, 16)}</span><span className="compare-tag right">{utc(frame.obs.obs_time).slice(0, 16)}</span><input className="compare-range" type="range" min={0} max={100} value={split} onChange={event => setSplit(Number(event.target.value))} aria-label="Move the comparison divider" /></>}{scale && <div className="scale-bar" aria-label={`Scale: ${scale.arcsec} arcseconds, about ${scale.pixels} SPHEREx pixels`}><span style={{ width: scale.px }} /><small>{scale.arcsec}″ · ≈{scale.pixels} px</small></div>}<span className="crosshair" aria-hidden="true" /><span className="stage-label">{difference && frames.length > 1 ? "DIFFERENCE · FRAME 1 REFERENCE" : showCompare ? `COMPARE · FRAME 1 | FRAME ${index + 1}` : `${frame.obs.band} · ${frame.obs.release}`}</span><span className="stage-counter">{index + 1} / {frames.length}</span><span className="north-label" aria-hidden="true">N ↑</span></> : <div className="viewer-empty"><div className={`view-reticle ${loadingFrames || searching ? "loading" : ""}`} aria-hidden="true"><span>✧</span></div><h3>{searching ? "Finding your patch of sky" : loadingFrames ? "Gathering moments in time" : failures.length ? "Images could not be loaded" : searched && !observations.length ? "A little further into the sky" : "Every comparison starts somewhere"}</h3><p>{loadingFrames ? `${progress.ready} of ${selectedObservations.length} images ready · ${progress.completed} processed` : searching ? "We’re looking for observations at your coordinates." : searched && !observations.length ? "Try another position or one of the demo targets." : selected.length === 0 && observations.length ? "Select observations from the list to begin." : "Choose a target or enter coordinates to explore."}</p>{loadingFrames && <><progress value={progress.completed} max={selectedObservations.length} /><small>First-time archive images can take 5–30 seconds each.</small></>}</div>}
          </div>
          <div className="playback"><div className="transport"><button aria-label="Previous frame" disabled={loadingFrames || frames.length < 2} onClick={() => { setPlaying(false); step(-1); }}>◀</button><button className="play-button" aria-label={playing ? "Pause playback" : "Play comparison"} disabled={loadingFrames || frames.length < 2} onClick={() => setPlaying(p => !p)}>{playing ? "Ⅱ" : "▶"}</button><button aria-label="Next frame" disabled={loadingFrames || frames.length < 2} onClick={() => { setPlaying(false); step(1); }}>▶</button></div><label className="speed-control" htmlFor="speed">Interval <input id="speed" type="range" min="0.2" max="2" step="0.1" value={speed} onChange={event => setSpeed(Number(event.target.value))} /><span>{speed.toFixed(1)}s</span></label><label className="difference-toggle"><input type="checkbox" checked={compare} disabled={loadingFrames || frames.length < 2} onChange={event => { const on = event.target.checked; setCompare(on); if (on) { setDifference(false); setPlaying(false); setIndex(i => i === 0 ? frames.length - 1 : i); } }} />Compare</label><label className="difference-toggle"><input type="checkbox" checked={difference} disabled={loadingFrames || frames.length < 2} onChange={event => { setDifference(event.target.checked); if (event.target.checked) setCompare(false); }} />Difference</label></div>
          <div className="frame-dots" aria-label="Select a frame">{frames.map((f, i) => <button key={f.obs.id} aria-label={`Show frame ${i + 1}`} aria-pressed={i === index} onClick={() => { setPlaying(false); setIndex(i); }} />)}</div>
          <div className="metadata" aria-live="polite"><div className="metadata-title"><span className="eyebrow">{frame ? "CURRENT OBSERVATION" : "OBSERVATION DETAILS"}</span><span>{frame ? `Frame ${index + 1} of ${frames.length}` : "Awaiting selection"}</span></div>{frame ? <><p className="observation-time">{utc(frame.obs.obs_time)}</p><div className="metadata-tags"><span>{frame.obs.band}</span><span>{frame.wavelengthUm === null ? "Wavelength unavailable" : `${frame.wavelengthUm.toFixed(3)} µm`}</span><span>{frame.obs.release}</span></div><p className="source-file">{frame.obs.source_file}</p></> : <p className="muted">Time, wavelength, and source file will appear with each frame.</p>}<p className="data-credit">Data: NASA/IPAC IRSA, SPHEREx{source === "mock" && " · Synthetic demo images"}</p></div>
          {wavelengthWarning && <div className="notice warning" role="status">Images were taken at different wavelengths (more than 0.05 µm apart). Brightness differences may reflect wavelength rather than a real change.</div>}
          {failures.length > 0 && <div className="notice error" role="alert"><strong>{failures.length} {failures.length === 1 ? "image unavailable" : "images unavailable"}</strong><ul>{failures.map(f => <li key={f.observation.id}>{utc(f.observation.obs_time)}: {f.message}</li>)}</ul><button onClick={() => setFrameRetry(n => n + 1)}>Retry images</button></div>}
          <div className="viewer-settings"><label>Display stretch<select value={stretch} onChange={event => setStretch(event.target.value as Stretch)}><option value="asinh">Asinh</option><option value="zscale">Zscale</option><option value="linear">Linear</option></select></label><label>Field of view<select value={size} onChange={event => setSize(Number(event.target.value))}><option value="120">120″ · closer</option><option value="300">300″ · standard</option><option value="600">600″ · wider</option></select></label><button className="share-button" disabled={loadingFrames || frames.length < 2 || exporting} onClick={() => void exportGif()}>{exporting ? "Making GIF…" : "Download GIF ↓"}</button><button className="share-button" disabled={!coordinates} onClick={() => void share()}>{copied ? "Link copied ✓" : "Share position ↗"}</button></div>
          {shareError && <p className="tiny" role="status">{shareError}</p>}<p className="viewer-footnote">Aligned sky position. Shared brightness scale. A fairer comparison.<br />{difference ? "Difference mode subtracts the first displayed PNG from the current one; it is a visual aid, not a scientific flux measurement." : "Tip: use the left and right arrow keys to step through your frames."}</p>
        </section>
      </div>
      <section className="explore-note"><span aria-hidden="true">✦</span><p><strong>Explore with curiosity. Compare with care.</strong> These observations help you investigate changes, not confirm discoveries. A quiet-looking sky can still tell a story.</p></section>
    </main>
    <footer className="site-footer"><Brand /><p>Data: NASA SPHEREx via NASA/IPAC IRSA · NASA Space Apps Challenge 2026 project, not an official NASA product.</p><nav aria-label="Footer navigation"><Link href="/">Home</Link><Link href="/explore" aria-current="page">Explorer</Link></nav></footer>
  </>;
}
