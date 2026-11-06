"use client";

// Interactive sky map (Aladin Lite, CDS Strasbourg) to pick a position by clicking.
// - Loaded only when opened, from a pinned public CDN build. It is not bundled into our code:
//   Aladin Lite is GPL-3, so we use it like an external service instead of shipping it.
// - Imagery: AllWISE infrared colour HiPS hosted by NASA/IPAC IRSA. IRSA sends no CORS headers,
//   so the browser gets the tiles through our backend relay (/api/hips/allwise, cached).
import { useEffect, useRef, useState } from "react";
import { API_BASE } from "../lib/api";

const ALADIN_SCRIPT = "https://cdn.jsdelivr.net/npm/aladin-lite@3.8.2/dist/aladin.js";
const SURVEY = `${API_BASE}/api/hips/allwise`;

type Point = { ra: number; dec: number };
type Marker = { id: string; name: string; ra: number; dec: number };

/* eslint-disable @typescript-eslint/no-explicit-any */
let loader: Promise<any> | null = null;
function loadAladin(): Promise<any> {
  const w = window as any;
  if (w.A) return w.A.init.then(() => w.A);
  // The npm build is an ES module (export default), so load it through a module script
  // that hands the library to the page.
  loader ??= new Promise((resolve, reject) => {
    const timer = setTimeout(() => fail(new Error("Sky map timed out")), 30_000);
    const fail = (error: Error) => { clearTimeout(timer); window.removeEventListener("aladin-ready", ready); loader = null; reject(error); };
    const ready = () => { clearTimeout(timer); w.A.init.then(() => resolve(w.A), fail); };
    window.addEventListener("aladin-ready", ready, { once: true });
    const script = document.createElement("script");
    script.type = "module";
    script.textContent = `import A from "${ALADIN_SCRIPT}"; window.A = A; window.dispatchEvent(new Event("aladin-ready"));`;
    script.onerror = () => fail(new Error("Could not load the sky map"));
    document.head.appendChild(script);
  });
  return loader;
}

const norm = (p: Point): Point => ({ ra: ((p.ra % 360) + 360) % 360, dec: Math.max(-90, Math.min(90, p.dec)) });
const fmt = (n: number) => n.toFixed(5);

export function SkyMap({ center, markers, onPick }: { center: Point | null; markers: Marker[]; onPick: (p: Point) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const aladin = useRef<any>(null);
  const pickLayer = useRef<any>(null);
  const A = useRef<any>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [picked, setPicked] = useState<Point | null>(null);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    loadAladin().then(lib => {
      if (cancelled || !box.current) return;
      A.current = lib;
      const start = center ?? { ra: 266.4, dec: -29.0 }; // galactic centre as a default view
      const view = lib.aladin(box.current, {
        survey: SURVEY, fov: center ? 2 : 40, target: `${start.ra} ${start.dec}`, cooFrame: "ICRSd",
        showReticle: true, showZoomControl: true, showFullscreenControl: false, showLayersControl: false,
        showGotoControl: false, showShareControl: false, showSimbadPointerControl: false,
        showCooGridControl: false, showSettingsControl: false, showProjectionControl: false, showFrame: false,
        showContextMenu: false,
        // No calls to CDS servers: no default survey list (DSS2) and no usage logging.
        hipsList: [], log: false,
      });
      aladin.current = view;
      const catalog = lib.catalog({ name: "Demo targets", sourceSize: 16, color: "#c27af3", shape: "circle" });
      view.addCatalog(catalog);
      catalog.addSources(markers.map(m => lib.source(m.ra, m.dec, { name: m.name })));
      pickLayer.current = lib.graphicOverlay({ color: "#ffffff", lineWidth: 2 });
      view.addOverlay(pickLayer.current);
      view.on("click", (e: any) => {
        if (!e || e.isDragging) return;
        const ra = typeof e.ra === "number" ? e.ra : view.pix2world(e.x, e.y)?.[0];
        const dec = typeof e.dec === "number" ? e.dec : view.pix2world(e.x, e.y)?.[1];
        if (!Number.isFinite(ra) || !Number.isFinite(dec)) return;
        const p = norm({ ra, dec });
        setPicked(p);
        pickLayer.current.removeAll();
        pickLayer.current.add(lib.circle(p.ra, p.dec, 0.03, { color: "#ffffff" }));
      });
      setStatus("ready");
    }).catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow searches made elsewhere (target cards, typed coordinates, stories).
  useEffect(() => {
    if (status !== "ready" || !center || !aladin.current) return;
    aladin.current.gotoRaDec(center.ra, center.dec);
    if (aladin.current.getFov?.()[0] > 5) aladin.current.setFoV(2);
  }, [center, status]);

  return (
    <div className="sky-map">
      <div className="sky-map-view" ref={box} aria-label="Interactive infrared sky map. Click to pick a position." role="application" />
      {status === "loading" && <p className="sky-map-status">Loading the sky…</p>}
      {status === "error" && <p className="sky-map-status error">The sky map could not load. You can still enter coordinates.</p>}
      {status === "ready" && <div className="sky-map-pick">
        {picked ? <span>RA {fmt(picked.ra)}° · Dec {fmt(picked.dec)}°</span> : <span className="muted">Click the sky to pick a point. Purple circles are demo targets.</span>}
        <button type="button" className="primary-button" disabled={!picked} onClick={() => picked && onPick(picked)}>Search here <span aria-hidden="true">↗</span></button>
      </div>}
      <p className="sky-map-credit">Map: Aladin Lite (CDS, Strasbourg) · AllWISE infrared (NASA/JPL-Caltech/UCLA, via IRSA)</p>
    </div>
  );
}
