"use client";

import { useEffect, useRef, useState } from "react";
import { ApiFailure, getCandidateAnalysis } from "../lib/api";
import { candidateSearchGroup } from "../lib/observations";
import { aggregateEvidence, analysisError, analysisOutcome, analysisSelectionKey, candidateFlags, candidateQuality, candidateStatus, classificationLabels, evidenceForCandidate, evidenceLabels, explainFlag, imageReliability, matchingAnalysis, measurementAvailability, uncertaintyAvailability } from "../lib/scientific-evidence";
import { dataSourceLabel, finiteNumber, formatUtc, NOT_AVAILABLE, numberValue, textValue, measurementValue, uncertaintyValue } from "../lib/scientific-format";
import type { AnalysisPhase, AnalysisResult, Candidate, CandidateResponse } from "../lib/scientific-types";
import type { BlinkFrame, Coordinates, Observation } from "../lib/types";
import "./scientific-evidence.css";

const phaseLabels: Record<AnalysisPhase, string> = {
  not_analyzed: "Not analyzed", requesting: "Requesting analysis", queued: "Queued / pending", processing: "Processing",
  completed: "Analysis completed", completed_empty: "Analysis completed — no candidates returned", failed: "Analysis failed",
  unavailable: "Analysis unavailable", network_error: "Results unavailable — connection or archive error", no_coverage: "No image coverage — not a scientific no-result finding",
};
const initial: AnalysisResult = { phase: "not_analyzed", message: "Candidate analysis has not been requested for this selection.", retry: false };
type Stored = { key: string; outcome: AnalysisResult; response: CandidateResponse | null };

export function CandidateCard({ candidate, selectedIds }: { candidate: Candidate; selectedIds: string[] }) {
  const flags = candidateFlags(candidate), evidence = evidenceForCandidate(candidate);
  const reference = candidate.detections.find(d => finiteNumber(d.ra_deg) && finiteNumber(d.dec_deg));
  const associated = candidate.observation_ids.filter(id => selectedIds.includes(id));
  const photometryFailed = flags.includes("photometry_failed");
  return <article className="scientific-candidate">
    <div className="scientific-card-heading"><h4>Candidate {candidate.candidate_id}</h4><span className="scientific-status">{candidateStatus(candidate.status)}</span></div>
    <p className="scientific-limitation"><strong>Unconfirmed candidate.</strong> Further scientific validation is required; neither a catalog match nor a ranking score confirms a detection.</p>
    <p className="scientific-origin">{candidate.is_mock ? "SYNTHETIC / EXAMPLE MEASUREMENTS — not scientific engine measurements" : "Backend-reported measurements — validation is separate"}</p>
    <p>{associated.length ? `${associated.length} associated observation(s) are in your selection.` : "This regional candidate uses other observations, not your selected images."}</p>
    <dl className="scientific-metadata">
      <div><dt>Classification</dt><dd>{classificationLabels[candidate.classification?.candidate_type ?? ""] ?? NOT_AVAILABLE}</dd></div>
      <div><dt>Reference RA / Dec (first reported detection)</dt><dd>{numberValue(reference?.ra_deg, "°")} / {numberValue(reference?.dec_deg, "°")}</dd></div>
      <div><dt>First reported observation time (UTC)</dt><dd>{formatUtc(candidate.detections[0]?.observation_time)}</dd></div>
      <div><dt>Method</dt><dd>{textValue(candidate.classification?.method)}</dd></div>
      <div><dt>Matched object</dt><dd>{textValue(candidate.known_match)}</dd></div>
      <div><dt>Data release</dt><dd>{textValue(candidate.data_release)}</dd></div>
      <div><dt>Engine version</dt><dd>{textValue(candidate.engine_version)}</dd></div>
      <div><dt>Backend data quality</dt><dd>{textValue(candidate.quality?.data_quality)}</dd></div>
      <div><dt>Ranking score (0–1, not a probability)</dt><dd>{textValue(candidate.classification?.method) !== NOT_AVAILABLE ? numberValue(candidate.classification?.score) : "Not available — scoring method not supplied"}</dd></div>
    </dl>
    <p className="scientific-limitation">{evidenceLabels[evidence.state]}: {evidence.explanation}</p>
    {candidate.status === "known_object" && <p className="scientific-limitation">A catalog or ephemeris match does not validate the current detection.</p>}
    {photometryFailed && <p className="scientific-alert" role="status">{explainFlag("photometry_failed").explanation}</p>}
    <details className="scientific-details"><summary>Supporting observations, measurements &amp; limitations</summary>
      <p><strong>Associated Observation IDs:</strong> {candidate.observation_ids.length ? candidate.observation_ids.join(", ") : NOT_AVAILABLE}</p>
      <div className="scientific-table-wrap"><table><caption>Per-observation measurements reported by the backend</caption><thead><tr><th>Observation / UTC time</th><th>RA / Dec (°)</th><th>SNR</th><th>Flux</th><th>Flux uncertainty</th><th>Quality</th></tr></thead><tbody>{candidate.detections.map(d => <tr key={d.observation_id}><td>{textValue(d.observation_id)}<small>{formatUtc(d.observation_time)}</small><small>Band {textValue(d.band)} · {numberValue(d.wavelength_um, "µm")}</small></td><td>{numberValue(d.ra_deg)} / {numberValue(d.dec_deg)}</td><td>{numberValue(d.snr)}</td><td>{measurementValue(d.flux, d.flux_error, d.flux_unit ?? "")}<small>{d.flux != null && !d.flux_unit && "Unit: Not available"}</small></td><td>{d.flux == null ? "Not available ? no flux measurement" : uncertaintyValue(d.flux_error, d.flux_unit ?? "")}</td><td>{d.quality_flags?.length ? d.quality_flags.map(f => explainFlag(f).title).join("; ") : Array.isArray(d.quality_flags) ? "No issues reported; checks not certified" : "Quality checks unavailable"}</td></tr>)}</tbody></table></div>
      <dl className="scientific-metadata">
        <div><dt>Median / minimum SNR</dt><dd>{numberValue(candidate.median_snr)} / {numberValue(candidate.min_snr)}</dd></div>
        <div><dt>Angular displacement</dt><dd>{measurementValue(candidate.motion?.angular_displacement_arcsec, null, "arcsec")}</dd></div>
        <div><dt>RA / Dec displacement (on sky)</dt><dd>{measurementValue(candidate.motion?.delta_ra_arcsec, null, "arcsec")} / {measurementValue(candidate.motion?.delta_dec_arcsec, null, "arcsec")}</dd></div>
        <div><dt>Motion uncertainty</dt><dd>{uncertaintyValue(candidate.motion?.uncertainty_arcsec, "arcsec")}</dd></div>
        <div><dt>Angular speed</dt><dd>{measurementValue(candidate.motion?.angular_speed_arcsec_per_day, null, "arcsec/day")}</dd></div>
        <div><dt>Position angle (east of north)</dt><dd>{numberValue(candidate.motion?.position_angle_deg, "°")}</dd></div>
        <div><dt>Flux change</dt><dd>{measurementValue(candidate.brightness?.delta_flux, null)}{candidate.brightness?.delta_flux != null && " (units: see per-observation measurements)"}{photometryFailed && " — brightness measurement failure reported"}</dd></div>
        <div><dt>Magnitude change</dt><dd>{measurementValue(candidate.brightness?.delta_mag, null, "mag")}</dd></div>
        <div><dt>Variability assessment</dt><dd>{photometryFailed ? "No brightness conclusion — photometry failed" : textValue(candidate.brightness?.variability_status)}</dd></div>
      </dl>
      <p className="scientific-limitation">Uncertainty provenance: flux_error uses the reported flux unit. Motion uncertainty is reported in arcsec; the contract does not identify which motion component it describes, so it is not attached to displacement or speed. Statistical versus systematic errors and confidence levels are not specified. RA/Dec, SNR, wavelength and brightness-change uncertainties are not supplied. Measurement method: {textValue(candidate.classification?.method)}; engine: {textValue(candidate.engine_version)}.</p>
      <h5>Quality &amp; reliability</h5><p>{candidateQuality(candidate)}</p>{flags.map(flag => <p key={flag}><strong>{explainFlag(flag).title}:</strong> {explainFlag(flag).explanation}</p>)}
      <details className="scientific-details"><summary>Additional evidence supplied by the engine</summary>{candidate.evidence && Object.keys(candidate.evidence).length ? <pre>{JSON.stringify(candidate.evidence, null, 2)}</pre> : <p>Not available</p>}</details>
    </details>
  </article>;
}

export function ScientificEvidence({ coordinates, observations, frames, source, searching, noCoverage, searchFailed, loadingImages }: {
  coordinates: Coordinates | null; observations: Observation[]; frames: BlinkFrame[]; source: string | null;
  searching: boolean; noCoverage: boolean; searchFailed: boolean; loadingImages: boolean;
}) {
  const key = analysisSelectionKey(coordinates, observations.map(o => o.id), source);
  const candidateGroup = candidateSearchGroup(observations);
  const [stored, setStored] = useState<Stored | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { controller.current?.abort(); setStored(null); return () => controller.current?.abort(); }, [key, searching]);
  const current = matchingAnalysis(stored, key, searching);
  const response = current?.response ?? null;
  const outcome = searching ? { ...initial, message: "Observation search is in progress. Previous candidate results have been cleared." }
    : noCoverage ? { phase: "not_analyzed" as const, retry: false, message: "No observations were returned for the current search and filters. Scientific candidate analysis was not performed; this does not establish that no changes exist." }
    : searchFailed ? { phase: "unavailable" as const, retry: false, message: "Observation search failed. Candidate analysis has not been evaluated for this search." }
    : current?.outcome ?? initial;
  const candidates = response?.candidates ?? [];
  const ids = observations.map(o => o.id);
  const related = candidates.filter(c => c.observation_ids.some(id => ids.includes(id)));
  const quality = imageReliability(frames);
  const flagNames = [...new Set(related.flatMap(candidateFlags))];
  const evidence = aggregateEvidence(related, quality.warnings.length > 0);
  const resultReady = outcome.phase === "completed" || outcome.phase === "completed_empty";
  const usableEvidence = resultReady ? evidence : { state: "not_evaluated" as const, explanation: "No completed analysis is available for this selection. Images and a successful download do not establish scientific validity." };
  const qualityText = flagNames.length || quality.warnings.length || related.some(c => c.quality?.data_quality === "degraded") ? "Quality warnings detected"
    : related.length && related.every(c => Array.isArray(c.quality_flags) && c.detections.every(d => Array.isArray(d.quality_flags))) ? "No quality issues reported — not a certification that checks passed" : "Quality checks unavailable or incomplete";
  async function analyze() {
    if (!coordinates || searching || !observations.length) return;
    if (!candidateGroup.ok) {
      setStored({ key, response: null, outcome: { phase: "failed", retry: false, message: candidateGroup.message } });
      return;
    }
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    setStored({ key, response: null, outcome: { phase: "requesting", retry: false, message: "Requesting candidate analysis. No queued or processing job state has been reported by the backend yet." } });
    try {
      const data = await getCandidateAnalysis(coordinates.ra, coordinates.dec, candidateGroup.band, candidateGroup.pipeline, request.signal);
      if (source === "mock" && data.candidates.some(candidate => !candidate.is_mock)) throw new ApiFailure("INVALID_RESPONSE", "Candidate provenance conflicts with mock image mode.");
      if (!request.signal.aborted) setStored({ key, response: data, outcome: analysisOutcome(data) });
    } catch (error) {
      if (!request.signal.aborted) setStored({ key, response: null, outcome: analysisError(error instanceof ApiFailure ? error.code : undefined, error instanceof ApiFailure ? error.message : undefined) });
    }
  }
  return <section className="panel scientific-panel" aria-labelledby="scientific-summary-title">
    <div className="scientific-card-heading"><div><p className="eyebrow">EVIDENCE BEFORE CONCLUSIONS</p><h2 id="scientific-summary-title">Scientific Evidence Summary</h2></div><span className="scientific-status">{evidenceLabels[usableEvidence.state]}</span></div>
    <p className="scientific-limitation">{usableEvidence.explanation}</p>
    <dl className="scientific-metadata scientific-summary-grid">
      <div><dt>Selected observations</dt><dd>{observations.length ? `${observations.length} selected · ${loadingImages ? "images loading" : `${frames.length} loaded`}` : "No observations selected"}</dd></div>
      <div><dt>Selected Observation IDs</dt><dd>{ids.length ? ids.join(", ") : NOT_AVAILABLE}</dd></div>
      <div><dt>Candidate classification</dt><dd>{resultReady && related.length ? [...new Set(related.map(c => classificationLabels[c.classification?.candidate_type ?? ""] ?? NOT_AVAILABLE))].join("; ") : NOT_AVAILABLE}</dd></div>
      <div><dt>Image data source</dt><dd>{dataSourceLabel(source)}</dd></div>
      <div><dt>Candidate status for this selection</dt><dd>{resultReady && related.length ? [...new Set(related.map(c => candidateStatus(c.status)))].join("; ") : NOT_AVAILABLE}</dd></div>
      <div><dt>Measurement availability</dt><dd>{measurementAvailability(resultReady ? related : [])}</dd></div>
      <div><dt>Uncertainty availability</dt><dd>{uncertaintyAvailability(resultReady ? related : [])}</dd></div>
      <div><dt>Data quality</dt><dd>{qualityText}</dd></div>
      <div><dt>Scientific validation</dt><dd>Not available — the current backend contract does not certify validated detections or verified measurements.</dd></div>
    </dl>
    <section className="scientific-quality" aria-labelledby="scientific-quality-title"><h3 id="scientific-quality-title">Data Quality &amp; Reliability</h3><p>{qualityText}</p>
      {quality.warnings.map(warning => <div className="scientific-warning" key={warning.title}><strong>{warning.title}</strong><p>{warning.explanation}</p></div>)}
      {flagNames.map(flag => <div className="scientific-warning" key={flag}><strong>{explainFlag(flag).title}</strong><p>{explainFlag(flag).explanation}</p></div>)}
      {related.some(c => c.quality?.data_quality === "degraded") && <p className="scientific-warning">The backend reports degraded candidate data quality. Reliability is limited even if no specific quality flag was supplied.</p>}
      {quality.unknown.map(message => <p className="scientific-limitation" key={message}>{message}</p>)}
      {!frames.length && <p className="scientific-limitation">Image-level quality information is not available until images are loaded.</p>}
      {quality.spectral.state === "overlap" && <p className="scientific-limitation">{quality.spectral.explanation}</p>}
      <p className="scientific-limitation">Missing flags do not mean that quality checks passed. Backend data quality and candidate validation are separate from image display quality.</p>
    </section>
    <section className="scientific-findings" aria-labelledby="scientific-findings-title"><div className="scientific-card-heading"><h3 id="scientific-findings-title">Scientific Findings &amp; Candidate Analysis</h3><button type="button" className="share-button" disabled={!coordinates || !observations.length || searching || noCoverage || searchFailed || outcome.phase === "requesting"} onClick={() => void analyze()}>{outcome.phase === "requesting" ? "Requesting…" : outcome.retry ? "Retry candidate request" : "Load candidate analysis"}</button></div>
      <div role="status" className="scientific-analysis-state"><strong>{phaseLabels[outcome.phase]}</strong><p>{outcome.message}</p></div>
      <p className="scientific-limitation">Validation of detections is not yet available in this backend contract. A known-object match is not a confirmation. Candidate classifications, measurement validity, and the evidence summary are separate concepts.</p>
      {coordinates && <p className="scientific-limitation">{candidateGroup.ok
        ? "Scope: regional candidate search within 0.25° of RA " + coordinates.ra + "°, Dec " + coordinates.dec + "°, restricted to " + candidateGroup.band + "/" + candidateGroup.pipeline + ". Releases may differ when the processing pipeline matches. The API searches compatible archive observations in this region; selected dates and image IDs do not limit the input frames."
        : "Regional candidate analysis needs one selected detector band and one supported processing pipeline. " + candidateGroup.message}</p>}
      {response && <p>Candidate records returned: {response.count}. {response.analysis?.data_source === "mock" && <strong>Synthetic demo analysis — not real SPHEREx measurements.</strong>}</p>}
      {response && !resultReady && candidates.length > 0 && <p className="scientific-warning">These records are not reported as completed results. Do not treat them as a successful scientific analysis.</p>}
      {resultReady && candidates.length > 0 && !related.length && <p className="scientific-limitation">None of the regional candidates reference the currently selected observations. They do not evaluate this image comparison.</p>}
      {candidates.map(candidate => <CandidateCard key={candidate.candidate_id} candidate={candidate} selectedIds={ids} />)}
    </section>
  </section>;
}
