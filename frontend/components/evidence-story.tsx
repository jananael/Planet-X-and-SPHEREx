"use client";

import { useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { AnalysisResult, Candidate } from "../lib/scientific-types";
import type { BlinkFrame } from "../lib/types";
import { candidateFrames, evidenceDimensions, storyVerdict } from "../lib/evidence-story";
import { candidateFlags, candidateStatus, classificationLabels, evidenceForCandidate, evidenceLabels, explainFlag, imageReliability, observationProvenance } from "../lib/scientific-evidence";
import { dataSourceLabel, finiteNumber, formatUtc, measurementValue, numberValue, textValue, uncertaintyValue } from "../lib/scientific-format";
import "./evidence-story.css";

export function EvidenceStory({ outcome, candidates, frames, currentFrame, referenceFrame, source, loading, canAnalyze, onAnalyze, onViewEvidence, onCancelEvidence, onCompare, advanced }: {
  outcome: AnalysisResult; candidates: Candidate[]; frames: BlinkFrame[]; currentFrame?: BlinkFrame; referenceFrame?: BlinkFrame;
  source: string | null; loading: boolean; canAnalyze: boolean; onAnalyze: () => void;
  onViewEvidence?: (candidate: Candidate) => Promise<string | null>; onCancelEvidence?: () => void; onCompare?: () => void; advanced: ReactNode;
}) {
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [dimension, setDimension] = useState("quality");
  const [viewState, setViewState] = useState<{ id: string; message: string; loading: boolean } | null>(null);
  const viewRequest = useRef(0);
  const dossier = useRef<HTMLDivElement>(null);
  const uid = useId();
  const ready = outcome.phase === "completed" || outcome.phase === "completed_empty";
  const candidate = ready ? candidates.find(c => c.candidate_id === chosenId) ?? candidates[0] : undefined;
  const relevant = candidateFrames(loading ? [] : frames, candidate);
  const preview = candidate ? relevant[0] : !loading ? currentFrame ?? relevant[0] : undefined;
  const reference = candidate ? relevant.find(f => f.obs.id !== preview?.obs.id) : !loading && referenceFrame?.obs.id !== preview?.obs.id ? referenceFrame : undefined;
  const flags = candidate ? candidateFlags(candidate) : [];
  const reliability = imageReliability(relevant);
  const dimensions = evidenceDimensions(relevant, candidate);
  const currentDimension = dimensions.find(d => d.id === dimension)!;
  const isSynthetic = candidate?.is_mock;
  const headline = storyVerdict(outcome, candidate);
  const warning = flags.includes("poor_wcs") ? "Check image alignment before interpreting apparent motion."
    : reliability.spectral.state === "incompatible" || reliability.spectral.state === "estimated" ? "Review spectral compatibility before interpreting brightness changes."
    : candidate?.quality?.insufficient_evidence || flags.includes("insufficient_epochs") ? "Select additional observations from different dates, then review the evidence again."
    : candidate ? "Inspect this candidate's supporting observations and review its quality warnings."
    : relevant.length < 2 ? "Select observations from at least two times to compare changes visually." : "Compare your observations while keeping data quality and missing measurements in mind.";
  const next = ["unavailable", "network_error", "no_coverage"].includes(outcome.phase) ? "Scientific analysis is currently unavailable. Continue exploring the available images visually."
    : outcome.phase === "failed" ? "Review the processing error below. Retry only when the backend supports another request."
    : outcome.phase === "not_analyzed" ? "Request the regional analysis to investigate possible changes. The backend may report that its scientific engine is unavailable."
    : ["queued", "processing", "requesting"].includes(outcome.phase) ? "Wait for a completed backend result. No scientific conclusion is available yet." : warning;
  const canRequest = !["requesting", "queued", "processing"].includes(outcome.phase) && canAnalyze;

  async function view(candidate: Candidate) {
    if (!onViewEvidence) return;
    const request = ++viewRequest.current;
    setViewState({ id: candidate.candidate_id, message: "Finding the associated observations…", loading: true });
    try {
      const message = await onViewEvidence(candidate);
      if (viewRequest.current === request) setViewState({ id: candidate.candidate_id, message: message ?? "Supporting observations selected in the image viewer.", loading: false });
    } catch {
      if (viewRequest.current === request) setViewState({ id: candidate.candidate_id, message: "Supporting images could not be loaded. Your selection has not been replaced with unrelated images.", loading: false });
    }
  }

  return <section className="evidence-story" aria-labelledby="evidence-story-title">
    <header className="story-masthead"><div><p className="eyebrow">OBSERVATION → EVIDENCE → NEXT ACTION</p><h2 id="evidence-story-title">Evidence Story<span>Follow the Evidence</span></h2></div><p className="story-source">{dataSourceLabel(source)}</p></header>
    <div className="investigation-desk">
      <figure className="investigation-lens">
        {preview ? <div className={`lens-images ${reference ? "with-reference" : ""}`}><img src={preview.url} alt={`Observation ${preview.obs.id}; ${formatUtc(preview.obs.obs_time)}`} />{reference && <img src={reference.url} alt={`Reference observation ${reference.obs.id}; ${formatUtc(reference.obs.obs_time)}`} />}</div>
          : <div className="lens-empty"><span aria-hidden="true">◎</span><strong>{loading ? "Gathering observations" : candidate ? "Supporting images are not loaded" : "Your investigation starts with an observation"}</strong><p>{candidate ? "Use View Evidence in Images to load the associated observations." : "Choose images above. Only available observations will appear here."}</p></div>}
        <figcaption>{preview ? <><time>{formatUtc(preview.obs.obs_time)}</time><span>{preview.obs.id}</span>{reference && <span>Reference: {reference.obs.id} · {formatUtc(reference.obs.obs_time)}</span>}</> : <span>No image available</span>}</figcaption>
      </figure>
      <div className="scientific-verdict"><p className="story-question">01 / WHAT DID WE OBSERVE?</p><span className="story-phase">{outcome.phase.replaceAll("_", " ")}</span><h3>{headline}</h3><p role="status">{outcome.message}</p>
        {isSynthetic && <p className="story-caution">Synthetic candidate measurements — not real scientific-engine results, even if an image is real.</p>}
        {candidate ? <button type="button" className="primary-button" onClick={() => dossier.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" })}>Explore Candidates ↓</button>
          : ready || (["unavailable", "no_coverage"].includes(outcome.phase) && !outcome.retry) ? <button type="button" className="primary-button" disabled={!onCompare || !frames.length} onClick={onCompare}>Review Observations ↑</button>
          : <button type="button" className="primary-button" disabled={!canRequest} onClick={onAnalyze}>{outcome.retry ? "Retry Analysis Request" : "Analyze This Region"}</button>}
        <p className="story-limitation">A candidate is not a confirmed discovery. Image downloads and catalog matches do not establish measurement validity.</p>
      </div>
    </div>

    <div className="story-evidence"><p className="story-question">02 / CAN WE TRUST THE EVIDENCE?</p>
      <div className="evidence-strip" role="tablist" aria-label="Evidence dimensions">{dimensions.map((item, index) => <button type="button" role="tab" id={`${uid}-${item.id}`} key={item.id} aria-selected={dimension === item.id} aria-controls={`${uid}-detail`} tabIndex={dimension === item.id ? 0 : -1} onClick={() => setDimension(item.id)} onKeyDown={event => {
        const next = event.key === "ArrowRight" ? (index + 1) % dimensions.length : event.key === "ArrowLeft" ? (index + dimensions.length - 1) % dimensions.length : event.key === "Home" ? 0 : event.key === "End" ? dimensions.length - 1 : null;
        if (next !== null) { event.preventDefault(); setDimension(dimensions[next].id); document.getElementById(`${uid}-${dimensions[next].id}`)?.focus(); }
      }}><span>{item.label}</span><small className={item.state === "Warning" || item.state === "Failed" ? "needs-review" : ""}>{item.state}{item.id === "spectral" && reliability.spectral.state === "estimated" ? " · Estimated" : ""}</small></button>)}</div>
      <div className="evidence-shared-detail" role="tabpanel" id={`${uid}-detail`} aria-labelledby={`${uid}-${dimension}`} tabIndex={0}><div key={`${dimension}-${candidate?.candidate_id ?? "selection"}`} className="evidence-detail-content"><h3>{currentDimension.label}</h3>
        {dimension === "quality" && <><p>No flags reported is not proof that quality checks passed. Calibration certification is not supplied by this contract.</p>{flags.map(flag => <p key={flag}><strong>{explainFlag(flag).title}: </strong>{explainFlag(flag).explanation}</p>)}{reliability.warnings.filter(w => !/spectral/i.test(w.title)).map(w => <p key={w.title}><strong>{w.title}: </strong>{w.explanation}</p>)}{relevant.map(f => <p key={f.obs.id}>{f.obs.id} — TRANSIENT-flagged pixels: {finiteNumber(f.transientPixels) ? f.transientPixels : "Unknown"}</p>)}{!relevant.length && <p>Image quality information is unknown until the associated images load.</p>}{reliability.unknown.map(message => <p key={message}>{message}</p>)}</>}
        {dimension === "alignment" && <><p>{flags.includes("poor_wcs") ? explainFlag("poor_wcs").explanation : "No explicit WCS validation or positional alignment uncertainty has been supplied. North-up display does not verify alignment."}</p><p>Apparent movement can arise from image misalignment. No candidate marker is drawn: accurate candidate-to-image pixel coordinates are not available.</p></>}
        {dimension === "spectral" && <><p>{reliability.spectral.explanation}</p>{relevant.map(f => <p key={f.obs.id}>{f.obs.id} — Band {textValue(f.obs.band)} · Wavelength {numberValue(f.wavelengthUm, "µm")} · Bandwidth {numberValue(f.bandwidthUm, "µm")}</p>)}<p>Metadata overlap is not a scientifically verified brightness comparison.</p></>}
        {dimension === "uncertainty" && <>{candidate ? <><p>{candidate.is_mock ? "Synthetic / example values — not real NASA measurements." : "Backend-reported values; availability does not certify measurement validity."}</p>{flags.includes("photometry_failed") && <p className="story-caution">Photometry failed. Reported raw flux values cannot support a brightness-change conclusion.</p>}<div className="scientific-table-wrap"><table><caption>Reported flux and uncertainty</caption><thead><tr><th>Observation ID</th><th>Flux</th><th>Method / provenance</th></tr></thead><tbody>{candidate.detections.map(d => <tr key={d.observation_id}><td>{d.observation_id}</td><td>{finiteNumber(d.flux) ? measurementValue(d.flux, d.flux_unit ? d.flux_error : null, d.flux_unit ?? "") : "Not measured"}{finiteNumber(d.flux) && !d.flux_unit && " · Unit not available"}</td><td>{textValue(candidate.classification?.method)} · {textValue(candidate.engine_version)}</td></tr>)}</tbody></table></div><p>Motion uncertainty: {uncertaintyValue(candidate.motion?.uncertainty_arcsec, "arcsec")}. Its component, statistical/systematic type and confidence level are not supplied.</p></> : <p>Not measured. Uncertainty not available — no selected candidate measurement result.</p>}</>}
        <p className="story-detail-reference">Observation IDs: {candidate ? candidate.observation_ids.join(", ") || "Not available" : relevant.map(f => f.obs.id).join(", ") || "Not available"}</p>
      </div></div>
    </div>

    <div className="story-next"><span className="story-question">03 / WHAT SHOULD WE DO NEXT?</span><p>{next}</p></div>
    <div className="candidate-dossiers" ref={dossier}>
      <div className="dossier-heading"><h3>Candidate evidence dossiers</h3><span>{ready ? `${candidates.length} reported` : "Not available"}</span></div>
      {!candidates.length && <p className="story-limitation">{outcome.phase === "completed_empty" ? "The completed analysis returned no candidates. This does not establish that no astronomical changes exist." : "No completed candidate evidence is available. No candidate examples have been substituted."}</p>}
      {ready && candidates.map((item, index) => { const images = candidateFrames(loading ? [] : frames, item); const detection = item.detections[0]; return <article className={`candidate-dossier ${candidate?.candidate_id === item.candidate_id ? "selected" : ""}`} key={item.candidate_id}>
        <span className="dossier-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><div className="dossier-preview">{images[0] ? <img src={images[0].url} alt={`Supporting observation ${images[0].obs.id}`} /> : <span>Image not loaded</span>}</div>
        <div className="dossier-content"><button type="button" className="dossier-select" aria-pressed={candidate?.candidate_id === item.candidate_id} onClick={() => { onCancelEvidence?.(); setChosenId(item.candidate_id); viewRequest.current++; setViewState(null); }}><span>{item.candidate_id}</span><small>Select dossier</small></button><p>{candidateStatus(item.status)}</p><p>{classificationLabels[item.classification?.candidate_type ?? ""] ?? "Classification not available"} · RA {numberValue(detection?.ra_deg, "°")} / Dec {numberValue(detection?.dec_deg, "°")}</p><p>{formatUtc(detection?.observation_time)}</p><p className="dossier-ids">Observation IDs: {item.observation_ids.join(", ") || "Not available"}</p><p>{item.is_mock ? "Synthetic example measurements" : "Unconfirmed candidate measurements"} · {evidenceLabels[evidenceForCandidate(item).state]}</p><p>First reported flux: {finiteNumber(detection?.flux) ? measurementValue(detection.flux, detection.flux_unit ? detection.flux_error : null, detection.flux_unit ?? "") : "Not measured"}{finiteNumber(detection?.flux) && !detection?.flux_unit && " · Unit not available"}</p><p className="story-limitation">{candidateFlags(item).length ? candidateFlags(item).map(f => explainFlag(f).title).join(" · ") : "Quality flags unknown or no issues reported; checks not certified."}</p>
          <button type="button" className="share-button" disabled={!onViewEvidence || !item.observation_ids.length || !!viewState?.loading} onClick={() => { setChosenId(item.candidate_id); void view(item); }}>View Evidence in Images ↑</button>
          {viewState?.id === item.candidate_id && <p role="status">{viewState.message}</p>}
        </div></article>; })}
    </div>
    <details className="story-advanced"><summary>Advanced Scientific Details</summary><p>Complete provenance and reported scientific values. Missing values remain unavailable.</p>{relevant.map(f => <details key={f.obs.id} className="scientific-details"><summary>Observation {f.obs.id}</summary><dl className="scientific-metadata">{observationProvenance(f.obs, source, f).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></details>)}{advanced}</details>
  </section>;
}
