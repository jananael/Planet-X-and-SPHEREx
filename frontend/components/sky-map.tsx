"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { angularDistance, BOOKMARK_KEY, normalizeSkyPoint, readBookmarks, sameSkyPoint, skyRegion, type CoverageMetadata, type SkyBookmark, type SkyFeature, type SkyLocation } from "../lib/sky-navigation";
import type { Coordinates } from "../lib/types";
import { errorMessage, getJson } from "../lib/api";
import "./sky-map.css";

// Keep the existing pinned atlas. Its survey now connects directly to CDS.
const SCRIPT = "https://cdn.jsdelivr.net/npm/aladin-lite@3.8.2/dist/aladin.js";
const SURVEY = "https://cdn.skies.esac.esa.int/DSSColor";
// Quick buttons: J2000 positions from SIMBAD, so they work instantly and offline.
const QUICK_OBJECTS = [
  { id: "M31", label: "Andromeda", name: "M31 · Andromeda Galaxy", ra: 10.684708, dec: 41.26875 },
  { id: "M42", label: "Orion Nebula", name: "M42 · Orion Nebula", ra: 83.822083, dec: -5.391111 },
  { id: "M45", label: "Pleiades", name: "M45 · Pleiades", ra: 56.75, dec: 24.116667 },
];
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

export function SkyMap({ center, onSelect, onPick, coverage, onClose }: { onClose: () => void; center: Coordinates | null; onSelect: (p: Coordinates) => void; onPick: (p: Coordinates) => void; coverage?: CoverageMetadata }) {
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
  const expanded = true;
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

    window.addEventListener("storage", sync);
    return () => { window.removeEventListener("storage", sync); };
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
    loadAladin().then(async A => {
      // Let the dialog settle into its final layout before the atlas measures it.
      // Entrance effects use clipping, never a scaled measuring surface.
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      // WebGL/catalog setup can block the main thread. Let the entrance finish
      // before creating the atlas so its initialization cannot interrupt the burst.
      await new Promise<void>(resolve => setTimeout(resolve, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1200));
      if (cancelled || !box.current) return;
      lib.current = A;
      const start = initialCenter.current ?? { ra: 10.6847, dec: 41.2690 };
      view = A.aladin(box.current, { survey: SURVEY, fov: initialCenter.current ? 4 : 65, target: `${start.ra} ${start.dec}`, cooFrame: "ICRSd", showReticle: true, showZoomControl: false, showFullscreenControl: false, showLayersControl: false, showGotoControl: false, showShareControl: false, showSimbadPointerControl: false, showCooGridControl: false, showSettingsControl: false, showProjectionControl: false, showFrame: false, showContextMenu: false, hipsList: [], log: false });
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

  // Object names go through our backend (/api/resolve: built-in famous objects + Sesame on its CfA mirror).
  // Aladin's own lookup calls CDS directly, which is unreachable from some networks.
  function resolve(name: string) {
    if (!atlas.current || !name.trim()) return;
    const known = QUICK_OBJECTS.find(o => [o.id, o.label].some(k => k.toLowerCase() === name.trim().toLowerCase()));
    if (known) { requestId.current++; setMessage(""); choose({ ra: known.ra, dec: known.dec }, known.name, "catalog", true); return; }
    if (!/[a-z]/i.test(name)) { setMessage("Enter an astronomical object name such as M31. For coordinates, use the RA and Dec fields above."); return; }
    const id = ++requestId.current; setResolving(true); setMessage("");
    if (timer.current) clearTimeout(timer.current);
    const controller = new AbortController();
    timer.current = setTimeout(() => controller.abort(), 20000);
    getJson<{ name: string; ra: number; dec: number }>(`/api/resolve?name=${encodeURIComponent(name.trim())}`, controller.signal)
      .then(hit => { if (id !== requestId.current) return; choose({ ra: hit.ra, dec: hit.dec }, hit.name, "catalog", true); })
      .catch(error => { if (id === requestId.current) setMessage(controller.signal.aborted ? `Could not resolve “${name}” in time. Try M31, M42 or M45.` : /not found|404/i.test(errorMessage(error)) || /no longer available/i.test(errorMessage(error)) ? `Could not find “${name.trim()}”. Try a catalog name such as M31, NGC 224 or Betelgeuse.` : errorMessage(error)); })
      .finally(() => { if (timer.current) clearTimeout(timer.current); if (id === requestId.current) setResolving(false); });
  }
  function persist(next: SkyBookmark[]) {
    try { localStorage.setItem(BOOKMARK_KEY, JSON.stringify({ version: 1, locations: next })); setBookmarks(next); setStorageMessage(""); }
    catch { setStorageMessage("Could not save changes. Browser storage may be blocked or full."); }
  }
  function save() {
    if (!picked || bookmarks.some(point => sameSkyPoint(point, picked))) return;
    persist([...bookmarks, { ra: picked.ra, dec: picked.dec, name: picked.name ?? `Sky at ${fmt(picked.ra)}, ${fmt(picked.dec)}`, id: crypto.randomUUID(), kind: "bookmark", createdAt: new Date().toISOString() }]);
  }
  const region = picked && data.current ? skyRegion(picked, data.current.bounds, data.current.names) : null;
  const nearest = picked && data.current ? data.current.stars.map(star => ({ star, distance: angularDistance(picked, star) })).filter(hit => hit.distance < .1).sort((a, b) => a.distance - b.distance)[0] : null;
  const saved = picked && bookmarks.some(point => sameSkyPoint(point, picked));

  return <div ref={root} tabIndex={-1}  aria-label="Sky Navigator" className={`sky-map sky-navigator${expanded ? " navigator-expanded" : ""}`} onKeyDown={event => {
    if (event.key === "Escape") onClose();
    if (event.key === "Tab" && expanded && root.current) {
      const controls = [...root.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), a[href], summary, [tabindex='0']")].filter(element => element.getClientRects().length > 0);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <div className="navigator-toolbar"><div><p className="eyebrow">NAVIGATE THE REAL SKY</p><h3>Sky Navigator</h3>
      <form className="navigator-search" onSubmit={event => { event.preventDefault(); resolve(query); }}><label className="navigator-sr" htmlFor="sky-object-search">Find an astronomical object</label><input id="sky-object-search" placeholder="Find an object · M31, M42, M45…" value={query} onChange={event => setQuery(event.target.value)} maxLength={120} /><button type="submit" disabled={status !== "ready" || resolving || !query.trim()}>{resolving ? "Finding…" : "Find"}</button></form>
      <div className="navigator-quick" aria-label="Suggested catalog searches">{QUICK_OBJECTS.map(o => <button key={o.id} type="button" disabled={status !== "ready" || resolving} onClick={() => { setQuery(o.id); resolve(o.id); }}>{o.label}</button>)}</div></div>
      <div className="navigator-actions"><details className="navigator-layers"><summary>Layers</summary><div>{layerChoices.map(([key, label]) => <label key={key}><input type="checkbox" checked={toggles[key]} disabled={status !== "ready" || (["names", "boundaries", "lines"].includes(key) && !catalogReady)} onChange={event => { const checked = event.target.checked; setToggles(values => ({ ...values, [key]: checked })); }} />{label}</label>)}
        <label><input type="checkbox" disabled={!coverage?.regions.length || status !== "ready"} checked={toggles.coverage} onChange={event => { const checked = event.target.checked; setToggles(values => ({ ...values, coverage: checked })); }} />SPHEREx Observation Coverage</label><small>{coverage?.regions.length ? `${coverage.source} · ${coverage.release}` : "Coverage data not yet available. No coverage is inferred from this map."}</small></div></details>
        <button type="button" className="navigator-close" onClick={onClose} aria-label="Close Sky Navigator" title="Close Sky Navigator">×</button></div></div>
    <div className="navigator-atlas-wrap"><div className="sky-map-view" ref={box} role="group" tabIndex={0} aria-label="Astronomical sky atlas. Drag to pan, scroll or pinch to zoom. Arrow keys pan, plus and minus zoom, Enter selects the center." onKeyDown={event => {
      if (!atlas.current || status !== "ready") return;
      const view = atlas.current, [ra, dec] = view.getRaDec(), fov = view.getFov()[0];
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) { event.preventDefault(); const p = normalizeSkyPoint({ ra: ra + (event.key === "ArrowLeft" ? fov / 6 : event.key === "ArrowRight" ? -fov / 6 : 0), dec: Math.max(-89.99, Math.min(89.99, dec + (event.key === "ArrowUp" ? fov / 6 : event.key === "ArrowDown" ? -fov / 6 : 0))) }); view.gotoRaDec(p.ra, p.dec); }
      else if (["+", "=", "-"].includes(event.key)) { event.preventDefault(); view.setFoV(Math.max(.01, Math.min(180, fov * (event.key === "-" ? 1.5 : 1 / 1.5)))); }
      else if (event.key === "Enter") { event.preventDefault(); choose({ ra, dec }); }
    }} />{status !== "ready" && <div className="navigator-loading" role="status"><strong>{status === "loading" ? "Opening the sky atlas…" : "The atlas is unavailable"}</strong><p>{status === "loading" ? "Loading Aladin Lite and the DSS optical survey. No SPHEREx backend is required." : message}</p>{status === "error" && <button type="button" onClick={() => setRetry(value => value + 1)}>Retry atlas</button>}</div>}</div>
    {message && status !== "error" && <p className="navigator-message" role="status">{message}</p>}
    <div className="navigator-selection"><div aria-live="polite">{picked ? <><span className="navigator-kind">{picked.origin === "catalog" ? "Catalog object · CDS / Hipparcos" : picked.origin === "bookmark" ? "User bookmark · not a discovery" : "Selected sky coordinates"}</span>{picked.name && <strong>{picked.name}</strong>}<dl><div><dt>RA / ICRS</dt><dd>{fmt(picked.ra)}°</dd></div><div><dt>Dec / ICRS</dt><dd>{fmt(picked.dec)}°</dd></div><div><dt>Sky region</dt><dd>{region ?? "Region unavailable"}</dd></div></dl>{nearest && <small>Nearby named star: {nearest.star.name} ({(nearest.distance * 60).toFixed(1)} arcmin away). Proximity does not identify the selected object.</small>}</> : <><strong>Choose your next patch of sky.</strong><p>Click or tap the map, find an object, or select the map center. Coordinates update the inputs above.</p></>}</div>
      <div className="navigator-selection-actions"><button type="button" className="navigator-icon" aria-label="Select map center" title="Select map center" disabled={status !== "ready"} onClick={() => { const [ra, dec] = atlas.current.getRaDec(); choose({ ra, dec }); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="12" r="6"/><path d="M12 2v6m0 8v6M2 12h6m8 0h6"/></svg><span className="navigator-tooltip">Select map center</span></button><button type="button" className="navigator-icon" aria-label={saved ? "Bookmarked" : "Save bookmark"} title={saved ? "Bookmarked" : "Save bookmark"} disabled={!picked || !!saved} onClick={save}><svg viewBox="0 0 24 24" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg><span className="navigator-tooltip">{saved ? "Bookmarked" : "Save bookmark"}</span></button><button type="button" className="primary-button" disabled={!picked} onClick={() => picked && onPick({ ra: picked.ra, dec: picked.dec })}>Explore This Region</button></div></div>
    {storageMessage && <p className="navigator-message" role="status">{storageMessage}</p>}
    <details className="navigator-about"><summary title="Map information" aria-label="Map information"><span aria-hidden="true">i</span></summary><div className="map-info-panel"><p className="map-info-eyebrow">ABOUT THIS VIEW</p><h4>Map information</h4><dl><div><dt>Sky atlas</dt><dd>Aladin Lite · CDS</dd></div><div><dt>Background imagery</dt><dd>DSS optical survey</dd></div><div><dt>Star names</dt><dd>Hipparcos catalog</dd></div><div><dt>Constellations</dt><dd>d3-celestial · J2000</dd></div></dl><p>This map shows optical imagery, not SPHEREx observations. Constellation lines are visual guides.</p><a href="/skytrace/catalogs/README.txt" target="_blank" rel="noreferrer">View data sources ↗</a><small>Object search and imagery need an internet connection.</small></div></details>
  </div>;
}
