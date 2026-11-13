"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { angularDistance, BOOKMARK_KEY, normalizeSkyPoint, readBookmarks, sameSkyPoint, skyRegion, type CoverageMetadata, type SkyBookmark, type SkyFeature, type SkyLocation } from "../lib/sky-navigation";
import type { Coordinates } from "../lib/types";
import "./sky-map.css";

// Keep the existing pinned atlas. Its survey now connects directly to CDS.
const SCRIPT = "https://cdn.jsdelivr.net/npm/aladin-lite@3.8.2/dist/aladin.js";
const SURVEY = "https://cdn.skies.esac.esa.int/DSSColor";
type Star = Coordinates & { id: string; name: string; mag: number };
type AtlasData = { bounds: SkyFeature[]; lines: SkyFeature[]; names: Record<string, string>; stars: Star[] };
/* eslint-disable @typescript-eslint/no-explicit-any */
let loader: Promise<any> | null = null;
function loadAladin(): Promise<any> {
  loader ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const cleanup = () => { clearTimeout(timer); window.removeEventListener("skytrace-atlas-ready", ready); window.removeEventListener("skytrace-atlas-error", fail); };
    const fail = () => { cleanup(); script.remove(); loader = null; reject(new Error("Check your connection and WebGL2 support, then retry.")); };
    const ready = () => { cleanup(); resolve((window as any).A); };
    const timer = setTimeout(fail, 60000);
    window.addEventListener("skytrace-atlas-ready", ready); window.addEventListener("skytrace-atlas-error", fail);
    script.type = "module";
    script.textContent = `try { const { default: A } = await import("${SCRIPT}"); await A.init; window.A = A; window.dispatchEvent(new Event("skytrace-atlas-ready")); } catch { window.dispatchEvent(new Event("skytrace-atlas-error")); }`;
    script.onerror = fail; document.head.appendChild(script);
  });
  return loader;
}
async function loadCatalog(signal: AbortSignal): Promise<AtlasData> {
  const [bounds, lines, names, stars] = await Promise.all(["constellations.bounds.json", "constellations.lines.json", "constellations.json", "named-stars.json"].map(async file => {
    const response = await fetch("/skytrace/catalogs/" + file, { signal });
    if (!response.ok) throw Error("Catalog data unavailable");
    return response.json();
  }));
  return { bounds: bounds.features, lines: lines.features, names: Object.fromEntries(names.features.map((f: any) => [f.id, f.properties.name])), stars };
}
const fmt = (value: number) => value.toFixed(5);
const layerChoices = [["names", "Star names"], ["boundaries", "Constellation boundaries"], ["lines", "Constellation lines"], ["grid", "Equatorial grid"], ["survey", "DSS survey background"], ["bookmarks", "User bookmarks"]] as const;

export function SkyMap({ center, onSelect, onPick, coverage }: { center: Coordinates | null; onSelect: (p: Coordinates) => void; onPick: (p: Coordinates) => void; coverage?: CoverageMetadata }) {
  const root = useRef<HTMLDivElement>(null), box = useRef<HTMLDivElement>(null);
  const atlas = useRef<any>(null), lib = useRef<any>(null), layers = useRef<Record<string, any>>({});
  const data = useRef<AtlasData | null>(null), selected = useRef<SkyLocation | null>(null);
  const onSelection = useRef(onSelect); onSelection.current = onSelect;
  const initialCenter = useRef(center), requestId = useRef(0), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0), [message, setMessage] = useState("");
  const [picked, setPicked] = useState<SkyLocation | null>(null), [query, setQuery] = useState("");
  const [resolving, setResolving] = useState(false), [catalogReady, setCatalogReady] = useState(false);
  const [bookmarks, setBookmarks] = useState<SkyBookmark[]>([]), [storageMessage, setStorageMessage] = useState("");
  const [fullscreen, setFullscreen] = useState(false), [expanded, setExpanded] = useState(false);
  const [toggles, setToggles] = useState({ names: false, boundaries: false, lines: false, grid: false, survey: true, bookmarks: true, coverage: false });
  const choose = useCallback((point: Coordinates, name?: string, origin: SkyLocation["origin"] = "coordinate", recenter = false, notify = true) => {
    const location = { ...normalizeSkyPoint(point), name, origin };
    requestId.current++;
    if (timer.current) clearTimeout(timer.current);
    setResolving(false);
    selected.current = location; setPicked(location);
    if (layers.current.selection && lib.current) { layers.current.selection.removeAll(); layers.current.selection.addSources([lib.current.source(location.ra, location.dec, { name: name ?? "Selected coordinates", origin })]); }
    if (recenter && atlas.current) { atlas.current.gotoRaDec(location.ra, location.dec); atlas.current.setFoV(4); }
    if (notify) onSelection.current({ ra: location.ra, dec: location.dec });
  }, []);

  useEffect(() => {
    try { setBookmarks(readBookmarks(localStorage.getItem(BOOKMARK_KEY))); } catch { setStorageMessage("Browser storage is unavailable. Bookmarks cannot persist here."); }
    const sync = (e: StorageEvent) => { if (e.key === BOOKMARK_KEY || e.key === null) setBookmarks(readBookmarks(e.newValue)); };
    const full = () => setFullscreen(document.fullscreenElement === root.current);
    window.addEventListener("storage", sync); document.addEventListener("fullscreenchange", full);
    return () => { window.removeEventListener("storage", sync); document.removeEventListener("fullscreenchange", full); };
  }, []);
  useEffect(() => {
    if (!expanded) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    root.current?.focus();
    return () => { document.body.style.overflow = overflow; if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [expanded]);

  useEffect(() => {
    let cancelled = false, view: any;
    const controller = new AbortController();
    setStatus("loading"); setMessage(""); setCatalogReady(false);
    loadAladin().then(A => {
      if (cancelled || !box.current) return;
      lib.current = A;
      const start = initialCenter.current ?? { ra: 10.6847, dec: 41.2690 };
      view = A.aladin(box.current, { survey: SURVEY, fov: initialCenter.current ? 4 : 65, target: `${start.ra} ${start.dec}`, cooFrame: "ICRSd", showReticle: true, showZoomControl: true, showFullscreenControl: false, showLayersControl: false, showGotoControl: false, showShareControl: false, showSimbadPointerControl: false, showCooGridControl: false, showSettingsControl: false, showProjectionControl: false, showFrame: false, showContextMenu: false, hipsList: [], log: false });
      atlas.current = view;
      const selection = A.catalog({ name: "Selected position", sourceSize: 14, color: "#5BC0DE", shape: "circle" });
      const saved = A.catalog({ name: "User bookmarks (not discoveries)", sourceSize: 12, color: "#F4D6B0", shape: "cross" });
      view.addCatalog(saved); view.addCatalog(selection); layers.current = { selection, bookmarks: saved };
      let catalogHit = false;
      view.on("objectClicked", (object: any) => {
        if (!object || !Number.isFinite(object.ra) || !Number.isFinite(object.dec)) return;
        catalogHit = true; requestId.current++; setResolving(false);
        choose({ ra: object.ra, dec: object.dec }, object.data?.name, object.data?.origin ?? "catalog");
      });
      view.on("click", (event: any) => {
        if (catalogHit) { catalogHit = false; return; }
        if (!event || event.isDragging) return;
        const world = Number.isFinite(event.ra) && Number.isFinite(event.dec) ? [event.ra, event.dec] : view.pix2world(event.x, event.y);
        if (!world?.every(Number.isFinite)) return;
        requestId.current++; setResolving(false); setMessage(""); choose({ ra: world[0], dec: world[1] });
      });
      if (selected.current) choose(selected.current, selected.current.name, selected.current.origin, false, false);
      else if (initialCenter.current) choose(initialCenter.current, undefined, "coordinate", false, false);
      setStatus("ready");
      fetch(`${SURVEY}/properties`, { signal: controller.signal }).then(response => {
        if (!response.ok) throw Error("Survey unavailable");
      }).catch(() => { if (!cancelled) setMessage("DSS survey imagery is unavailable. Check your internet connection. Catalog layers and coordinate navigation remain available."); });
      loadCatalog(controller.signal).then(catalog => {
        if (cancelled) return;
        data.current = catalog;
        const names = A.catalog({ name: "Named Hipparcos stars", sourceSize: 4, color: "#F4D6B0", displayLabel: true, labelColumn: "name", labelColor: "#F4D6B0", labelFont: "11px sans-serif" });
        names.addSources(catalog.stars.map(star => A.source(star.ra, star.dec, { name: star.name, origin: "catalog" })));
        view.addCatalog(names); names.hide(); layers.current.names = names;
        for (const key of ["boundaries", "lines"] as const) {
          const overlay = A.graphicOverlay({ name: key === "lines" ? "Constellation figures" : "Constellation boundaries (J2000)", color: key === "lines" ? "#5BC0DE" : "#829bb3", lineWidth: 1 });
          view.addOverlay(overlay);
          for (const feature of key === "lines" ? catalog.lines : catalog.bounds) for (const ring of feature.geometry.coordinates) overlay.add(A.polyline(ring.map(([ra, dec]: number[]) => [((ra % 360) + 360) % 360, dec])));
          overlay.hide(); layers.current[key] = overlay;
        }
        setCatalogReady(true);
      }).catch(() => { if (!cancelled) setMessage("Catalog overlays could not load. Survey navigation and coordinate selection remain available."); });
    }).catch(error => { if (!cancelled) { setStatus("error"); setMessage(error.message); } });
    return () => {
      cancelled = true; controller.abort(); requestId.current++;
      if (timer.current) clearTimeout(timer.current);
      if (view) {
        view.on("click", null); view.on("objectClicked", null); view.removeOverlays();
        // Pinned v3.8.2 has no public dispose API. Stop its inspected scheduler
        // and observer; a pending redraw can only schedule this no-op afterward.
        view.view.resizeObserver?.disconnect(); view.view.zoom?.stopAnimation(); view.view.redrawClbk = () => {};
      }
      atlas.current = null; lib.current = null; layers.current = {}; box.current?.replaceChildren();
    };
  }, [choose, retry]);

  useEffect(() => { if (status === "ready" && center && (!selected.current || angularDistance(selected.current, center) >= 1e-8)) choose(center, undefined, "coordinate", true, false); }, [center, status, choose]);
  useEffect(() => {
    if (status !== "ready" || !atlas.current) return;
    for (const key of ["names", "boundaries", "lines", "bookmarks"] as const) { const layer = layers.current[key]; if (layer) toggles[key] ? layer.show() : layer.hide(); }
    atlas.current.setCooGrid({ enabled: toggles.grid, color: "#5BC0DE", opacity: .4 });
    atlas.current.getBaseImageLayer()?.setOpacity(toggles.survey ? 1 : 0);
    const saved = layers.current.bookmarks; saved.removeAll(); saved.addSources(bookmarks.map(point => lib.current.source(point.ra, point.dec, { name: point.name, origin: "bookmark" })));
  }, [toggles, bookmarks, status, catalogReady]);
  useEffect(() => {
    if (status !== "ready" || !atlas.current || !lib.current) return;
    if (layers.current.coverage) { atlas.current.removeOverlay(layers.current.coverage); delete layers.current.coverage; }
    if (!coverage?.regions.length || !toggles.coverage) return;
    const overlay = lib.current.graphicOverlay({ name: `SPHEREx coverage · ${coverage.release}`, color: "#D97706", lineWidth: 2 });
    atlas.current.addOverlay(overlay); layers.current.coverage = overlay;
    for (const region of coverage.regions) overlay.add(lib.current.polygon(region.vertices.map(point => { const p = normalizeSkyPoint(point); return [p.ra, p.dec]; })));
  }, [coverage, toggles.coverage, status]);

  function resolve(name: string) {
    if (!atlas.current || !name.trim()) return;
    if (!/[a-z]/i.test(name)) { setMessage("Enter an astronomical object name such as M31. For coordinates, use the RA and Dec fields above."); return; }
    const id = ++requestId.current; setResolving(true); setMessage("");
    if (timer.current) clearTimeout(timer.current);
    const failed = () => { if (id === requestId.current) { setResolving(false); setMessage(`Could not resolve “${name}”. Try a catalog identifier such as M31, M42, or M45.`); } };
    timer.current = setTimeout(() => { if (id === requestId.current) { failed(); requestId.current++; } }, 20000);
    atlas.current.gotoObject(encodeURIComponent(name.trim()), {
      success: (coordinates: number[]) => {
        if (id !== requestId.current) { if (selected.current) atlas.current?.gotoRaDec(selected.current.ra, selected.current.dec); return; }
        if (timer.current) clearTimeout(timer.current);
        try { choose({ ra: coordinates[0], dec: coordinates[1] }, name.trim(), "catalog", true); setResolving(false); } catch { failed(); }
      }, error: () => { if (timer.current) clearTimeout(timer.current); failed(); },
    });
  }
  function persist(next: SkyBookmark[]) {
    try { localStorage.setItem(BOOKMARK_KEY, JSON.stringify({ version: 1, locations: next })); setBookmarks(next); setStorageMessage(""); }
    catch { setStorageMessage("Could not save changes. Browser storage may be blocked or full."); }
  }
  function save() {
    if (!picked || bookmarks.some(point => sameSkyPoint(point, picked))) return;
    persist([...bookmarks, { ra: picked.ra, dec: picked.dec, name: picked.name ?? `Sky at ${fmt(picked.ra)}, ${fmt(picked.dec)}`, id: crypto.randomUUID(), kind: "bookmark", createdAt: new Date().toISOString() }]);
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement === root.current) await document.exitFullscreen();
      else if (expanded) setExpanded(false);
      else if (root.current?.requestFullscreen) await root.current.requestFullscreen();
      else setExpanded(true);
    } catch { setExpanded(value => !value); }
  }
  const region = picked && data.current ? skyRegion(picked, data.current.bounds, data.current.names) : null;
  const nearest = picked && data.current ? data.current.stars.map(star => ({ star, distance: angularDistance(picked, star) })).filter(hit => hit.distance < .1).sort((a, b) => a.distance - b.distance)[0] : null;
  const saved = picked && bookmarks.some(point => sameSkyPoint(point, picked));

  return <div ref={root} tabIndex={-1} role={expanded ? "dialog" : undefined} aria-modal={expanded || undefined} aria-label="Sky Navigator" className={`sky-map sky-navigator${expanded ? " navigator-expanded" : ""}`} onKeyDown={event => {
    if (event.key === "Escape" && expanded) setExpanded(false);
    if (event.key === "Tab" && expanded && root.current) {
      const controls = [...root.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), a[href], summary, [tabindex='0']")].filter(element => element.getClientRects().length > 0);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <div className="navigator-toolbar"><div><p className="eyebrow">NAVIGATE THE REAL SKY</p><h3>Sky Navigator</h3>
      <form className="navigator-search" onSubmit={event => { event.preventDefault(); resolve(query); }}><label className="navigator-sr" htmlFor="sky-object-search">Find an astronomical object</label><input id="sky-object-search" placeholder="Find an object · M31, M42, M45…" value={query} onChange={event => setQuery(event.target.value)} maxLength={120} /><button type="submit" disabled={status !== "ready" || resolving || !query.trim()}>{resolving ? "Finding…" : "Find"}</button></form>
      <div className="navigator-quick" aria-label="Suggested catalog searches">{[["M31", "Andromeda"], ["M42", "Orion Nebula"], ["M45", "Pleiades"]].map(([id, name]) => <button key={id} type="button" disabled={status !== "ready" || resolving} onClick={() => { setQuery(id); resolve(id); }}>{name}</button>)}</div></div>
      <div className="navigator-actions"><details className="navigator-layers"><summary>Layers</summary><div>{layerChoices.map(([key, label]) => <label key={key}><input type="checkbox" checked={toggles[key]} disabled={status !== "ready" || (["names", "boundaries", "lines"].includes(key) && !catalogReady)} onChange={event => { const checked = event.target.checked; setToggles(values => ({ ...values, [key]: checked })); }} />{label}</label>)}
        <label><input type="checkbox" disabled={!coverage?.regions.length || status !== "ready"} checked={toggles.coverage} onChange={event => { const checked = event.target.checked; setToggles(values => ({ ...values, coverage: checked })); }} />SPHEREx Observation Coverage</label><small>{coverage?.regions.length ? `${coverage.source} · ${coverage.release}` : "Coverage data not yet available. No coverage is inferred from this map."}</small></div></details>
        <button type="button" onClick={() => void toggleFullscreen()} aria-label={fullscreen || expanded ? "Exit fullscreen sky navigator" : "Open fullscreen sky navigator"}>{fullscreen || expanded ? "Exit fullscreen" : "Fullscreen"}</button></div></div>
    <div className="navigator-atlas-wrap"><div className="sky-map-view" ref={box} role="group" tabIndex={0} aria-label="Astronomical sky atlas. Drag to pan, scroll or pinch to zoom. Arrow keys pan, plus and minus zoom, Enter selects the center." onKeyDown={event => {
      if (!atlas.current || status !== "ready") return;
      const view = atlas.current, [ra, dec] = view.getRaDec(), fov = view.getFov()[0];
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) { event.preventDefault(); const p = normalizeSkyPoint({ ra: ra + (event.key === "ArrowLeft" ? fov / 6 : event.key === "ArrowRight" ? -fov / 6 : 0), dec: Math.max(-89.99, Math.min(89.99, dec + (event.key === "ArrowUp" ? fov / 6 : event.key === "ArrowDown" ? -fov / 6 : 0))) }); view.gotoRaDec(p.ra, p.dec); }
      else if (["+", "=", "-"].includes(event.key)) { event.preventDefault(); view.setFoV(Math.max(.01, Math.min(180, fov * (event.key === "-" ? 1.5 : 1 / 1.5)))); }
      else if (event.key === "Enter") { event.preventDefault(); choose({ ra, dec }); }
    }} />{status !== "ready" && <div className="navigator-loading" role="status"><strong>{status === "loading" ? "Opening the sky atlas…" : "The atlas is unavailable"}</strong><p>{status === "loading" ? "Loading Aladin Lite and the DSS optical survey. No SPHEREx backend is required." : message}</p>{status === "error" && <button type="button" onClick={() => setRetry(value => value + 1)}>Retry atlas</button>}</div>}</div>
    {message && status !== "error" && <p className="navigator-message" role="status">{message}</p>}
    <div className="navigator-selection"><div aria-live="polite">{picked ? <><span className="navigator-kind">{picked.origin === "catalog" ? "Catalog object · CDS / Hipparcos" : picked.origin === "bookmark" ? "User bookmark · not a discovery" : "Selected sky coordinates"}</span>{picked.name && <strong>{picked.name}</strong>}<dl><div><dt>RA / ICRS</dt><dd>{fmt(picked.ra)}°</dd></div><div><dt>Dec / ICRS</dt><dd>{fmt(picked.dec)}°</dd></div><div><dt>Sky region</dt><dd>{region ?? "Region unavailable"}</dd></div></dl>{nearest && <small>Nearby named star: {nearest.star.name} ({(nearest.distance * 60).toFixed(1)} arcmin away). Proximity does not identify the selected object.</small>}</> : <><strong>Choose your next patch of sky.</strong><p>Click or tap the map, find an object, or select the map center. Coordinates update the inputs above.</p></>}</div>
      <div className="navigator-selection-actions"><button type="button" disabled={status !== "ready"} onClick={() => { const [ra, dec] = atlas.current.getRaDec(); choose({ ra, dec }); }}>Select map center</button><button type="button" disabled={!picked || !!saved} onClick={save}>{saved ? "Bookmarked" : "Save bookmark"}</button><button type="button" className="primary-button" disabled={!picked} onClick={() => picked && onPick({ ra: picked.ra, dec: picked.dec })}>Explore This Region</button></div></div>
    <details className="navigator-bookmarks"><summary>Saved sky locations <span>{bookmarks.length}</span></summary><p>User bookmarks stored in this browser. These are not verified astronomical discoveries.</p><ul>{bookmarks.map(point => <li key={point.id}><button type="button" disabled={status !== "ready"} onClick={() => choose(point, point.name, "bookmark", true)}><strong>{point.name}</strong><small>{fmt(point.ra)}° / {fmt(point.dec)}°</small></button><button type="button" aria-label={`Remove bookmark ${point.name}`} onClick={() => persist(bookmarks.filter(item => item.id !== point.id))}>Remove</button></li>)}</ul>{!bookmarks.length && <p>No bookmarks yet. Select a position and save it above.</p>}</details>
    {storageMessage && <p className="navigator-message" role="status">{storageMessage}</p>}
    <p className="sky-map-credit">Atlas: Aladin Lite / CDS · Imagery: DSS optical survey, not SPHEREx · Star names: Hipparcos · Constellations: d3-celestial (J2000). Figure lines are guides, not boundaries. <a href="/skytrace/catalogs/README.txt" target="_blank" rel="noreferrer">Data sources</a>. Object search and survey imagery require internet access.</p>
  </div>;
}
