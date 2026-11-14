"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { BlinkFrame, Observation } from "../lib/types";
import { dataSourceLabel, formatUtc, numberValue, textValue } from "../lib/scientific-format";
import { observationProvenance } from "../lib/scientific-evidence";

function Provenance({ observation, source, frame }: { observation: Observation; source: string | null; frame?: BlinkFrame }) {
  return <dl className="scientific-metadata">{observationProvenance(observation, source, frame).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

export function ObservationDetails({ frame, reference, observations, frames, source }: {
  frame?: BlinkFrame; reference?: BlinkFrame; observations: Observation[]; frames: BlinkFrame[]; source: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) { setOpen(false); setPinned(false); } };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  return <div className="observation-info" ref={root}
    onMouseEnter={() => setOpen(true)} onMouseLeave={() => { if (!pinned && !root.current?.contains(document.activeElement)) setOpen(false); }}
    onFocusCapture={() => setOpen(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setPinned(false); } }}
    onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); setPinned(false); root.current?.querySelector<HTMLButtonElement>("button")?.focus(); setOpen(false); } }}>
    <button type="button" className="observation-info-button" aria-label="Observation details and provenance" aria-expanded={open} aria-controls={id}
      onClick={() => { setPinned(!pinned); setOpen(!pinned); }}><span aria-hidden="true">i</span></button>
    <div id={id} hidden={!open} className="observation-info-panel" role="region" aria-label="Observation details and provenance">
    <div className="metadata scientific-provenance">
    <div className="metadata-title"><span className="eyebrow">OBSERVATION DETAILS &amp; PROVENANCE</span><span>{frame ? "Displayed observation" : "No image loaded"}</span></div>
    {frame ? <>
      <p className="observation-time">{formatUtc(frame.obs.obs_time)}</p>
      <p className="scientific-id"><strong>Observation ID:</strong> {textValue(frame.obs.id)}</p>
      <div className="metadata-tags"><span>{textValue(frame.obs.band)}</span><span>Wavelength: {numberValue(frame.wavelengthUm, "µm")}</span><span>Release: {textValue(frame.obs.release)}</span></div>
      <p className="source-file">{textValue(frame.obs.source_file)}</p>
      <details className="scientific-details"><summary>Full provenance and image quality metadata</summary><Provenance observation={frame.obs} source={source} frame={frame} /></details>
    </> : <p className="muted">Time, identifiers, and image quality information appear as observations are loaded. Search metadata is available below for selected observations.</p>}
    <p className="data-credit">{dataSourceLabel(source)}</p>
    {reference && reference.obs.id !== frame?.obs.id && <details className="scientific-details"><summary>Reference image provenance — {textValue(reference.obs.id)}</summary><Provenance observation={reference.obs} source={source} frame={reference} /></details>}
    {observations.length > 0 && <details className="scientific-details"><summary>Provenance for all {observations.length} selected observations</summary>{observations.map(observation => <details className="scientific-details" key={observation.id}><summary>{textValue(observation.id)} · {formatUtc(observation.obs_time)}</summary><Provenance observation={observation} source={source} frame={frames.find(item => item.obs.id === observation.id)} /></details>)}</details>}
    </div>
    </div>
  </div>;
}
