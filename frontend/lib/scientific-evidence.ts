import type { BlinkFrame, Observation } from "./types.ts";
import type { AnalysisResult, Candidate, CandidateResponse, EvidenceState } from "./scientific-types.ts";
import { dataSourceLabel, finiteNumber, formatUtc, NOT_AVAILABLE, numberValue, textValue } from "./scientific-format.ts";
import { mixedPipelines, spectralAssessment } from "./observations.ts";
import type { Coordinates } from "./types.ts";

export function analysisSelectionKey(coordinates: Coordinates | null, observationIds: string[], source: string | null) {
  return JSON.stringify([coordinates?.ra, coordinates?.dec, [...observationIds].sort(), source]);
}
export function matchingAnalysis<T extends { key: string }>(stored: T | null, key: string, searching: boolean): T | null {
  return !searching && stored?.key === key ? stored : null;
}

export const candidateStatuses: Record<string, string> = {
  pending_validation: "Possible Candidate — Awaiting Validation",
  known_object: "Matched to Known Object",
  artifact: "Likely Imaging or Processing Artifact",
  rejected: "Rejected Candidate",
};
export const classificationLabels: Record<string, string> = {
  possible_moving_object: "Possible moving object", possible_variable: "Possible variable source",
  sub_pixel_motion: "Motion below one image pixel", unclassified: "Unclassified",
};
export const evidenceLabels: Record<EvidenceState, string> = {
  verified: "Verified Measurement", uncertain: "Uncertain Result", insufficient: "Insufficient Evidence", not_evaluated: "Not Evaluated / Data Unavailable",
};
export function candidateStatus(status: string) { return candidateStatuses[status] ?? "Validation status not available"; }
export const qualityDescriptions: Record<string, { title: string; explanation: string }> = {
  low_snr: { title: "Low signal-to-noise ratio", explanation: "The backend flagged a signal below its SNR threshold of 5. Small changes may not be reliable; this warning alone is not a rejection." },
  saturated: { title: "Saturated measurement area", explanation: "Some pixels may exceed the detector's useful range. Brightness measurements can be unreliable." },
  poor_wcs: { title: "Uncertain astrometric alignment", explanation: "The positional alignment is uncertain. Apparent motion or image differences could be caused by misalignment." },
  photometry_failed: { title: "Photometry could not be completed", explanation: "Brightness could not be measured reliably. No brightness-change conclusion can be drawn from this measurement; any separate motion result needs its own evidence." },
  near_transient_pixels: { title: "Near transient-flagged pixels", explanation: "The source or its measurement area is near pipeline-flagged transient pixels. Apparent changes require additional review." },
  edge_of_image: { title: "Near the image edge", explanation: "The measurement area may be incomplete. Position and brightness estimates may be affected." },
  mixed_pipeline: { title: "Different processing pipelines", explanation: "Processing or calibration may differ. Brightness differences may come from processing rather than the sky." },
  extended_source: { title: "Extended source", explanation: "The source is not point-like. Methods designed for stars may not measure it reliably." },
  high_background: { title: "High background", explanation: "Background emission affects the measurement. Faint sources and small brightness changes may be less reliable." },
  insufficient_epochs: { title: "Insufficient independent observations", explanation: "There are not enough independent exposures for a reliable conclusion. More observations are needed." },
};
export function explainFlag(flag: string) {
  return qualityDescriptions[flag] ?? { title: `Unrecognized quality flag: ${flag}`, explanation: "The backend reported this flag, but its meaning is not documented in this interface. Its effect on the measurement is unknown." };
}
export function candidateFlags(candidate: Candidate): string[] {
  return [...new Set([...(candidate.quality_flags ?? []), ...candidate.detections.flatMap(d => d.quality_flags ?? [])])];
}
export function candidateQuality(candidate: Candidate): string {
  if (candidateFlags(candidate).length || candidate.quality?.data_quality === "degraded") return "Quality warnings detected";
  const complete = Array.isArray(candidate.quality_flags) && candidate.detections.every(d => Array.isArray(d.quality_flags));
  return complete ? "No quality issues reported — checks are not certified as passed" : "Quality checks unavailable or incomplete";
}
export function evidenceForCandidate(candidate: Candidate): { state: EvidenceState; explanation: string } {
  if (candidate.is_mock) return { state: "not_evaluated", explanation: "These are synthetic or contract-example measurements. They do not validate an astronomical result, even when the referenced image is real." };
  if (candidate.quality?.insufficient_evidence === true || ["artifact", "rejected"].includes(candidate.status)) return { state: "insufficient", explanation: "The backend reports insufficient evidence, an artifact, or a rejected candidate. This is not a confirmed astronomical change." };
  const brightnessFailed = candidateFlags(candidate).includes("photometry_failed");
  const measured = (!brightnessFailed && (candidate.detections.some(d => finiteNumber(d.flux) || finiteNumber(d.snr)) || finiteNumber(candidate.brightness?.delta_flux) || finiteNumber(candidate.brightness?.delta_mag))) || hasMotion(candidate);
  if (!measured) return { state: "insufficient", explanation: "No usable quantitative measurement was supplied. Positions or a classification alone do not establish a change." };
  if (!["valid", "degraded"].includes(candidate.quality?.data_quality ?? "") || typeof candidate.quality?.insufficient_evidence !== "boolean") return { state: "not_evaluated", explanation: "Measurements exist, but the backend has not reported enough reliability information to evaluate them." };
  // Contract 0.2 has no measurement-validity or validated-detection assertion.
  // Even data_quality='valid', a known match, or a high SNR cannot create one.
  return { state: "uncertain", explanation: "Measurements were reported, but explicit measurement validation is not available in the current backend contract. Review the flags, uncertainties, and supporting observations." };
}
function hasMotion(candidate: Candidate): boolean {
  return [candidate.motion?.delta_ra_arcsec, candidate.motion?.delta_dec_arcsec, candidate.motion?.angular_displacement_arcsec, candidate.motion?.angular_speed_arcsec_per_day, candidate.motion?.position_angle_deg].some(finiteNumber);
}
export function measurementAvailability(candidates: Candidate[]): string {
  if (!candidates.length) return "No associated completed measurement result available";
  const real = candidates.filter(candidate => !candidate.is_mock);
  if (!real.length) return "Synthetic or example measurements only — not evaluated as real scientific measurements";
  const suppliedFluxes = real.flatMap(candidate => candidateFlags(candidate).includes("photometry_failed") ? [] : candidate.detections).filter(detection => finiteNumber(detection.flux)).length;
  const motionResults = real.filter(hasMotion).length;
  return `${suppliedFluxes} flux measurement(s) and ${motionResults} candidate(s) with motion metrics reported. Availability does not imply validity. Missing values are not zero.`;
}
export function uncertaintyAvailability(candidates: Candidate[]): string {
  const real = candidates.filter(c => !c.is_mock);
  if (!real.length) return "Not available — no associated real measurement result";
  const detections = real.flatMap(c => c.detections).filter(d => finiteNumber(d.flux));
  const supplied = detections.filter(d => finiteNumber(d.flux_error) && d.flux_error >= 0).length;
  const invalid = real.some(c => c.detections.some(d => d.flux_error != null && (!finiteNumber(d.flux_error) || d.flux_error < 0)) || (c.motion?.uncertainty_arcsec != null && (!finiteNumber(c.motion.uncertainty_arcsec) || c.motion.uncertainty_arcsec < 0)));
  const motion = real.filter(c => finiteNumber(c.motion?.uncertainty_arcsec) && c.motion.uncertainty_arcsec >= 0).length;
  return `${supplied} of ${detections.length} reported flux measurement(s) have uncertainty; ${motion} candidate(s) report positional uncertainty. Other uncertainties, statistical/systematic type and confidence levels are not supplied.${invalid ? " Invalid uncertainty reported — unavailable, not zero." : ""}`;
}
export function aggregateEvidence(candidates: Candidate[], imageWarnings: boolean): { state: EvidenceState; explanation: string } {
  if (!candidates.length) return { state: "not_evaluated", explanation: "No analysis result is associated with the selected observations. A displayed image is not a verified measurement." };
  const states = candidates.map(evidenceForCandidate);
  if (states.some(s => s.state === "insufficient")) return { state: "insufficient", explanation: "At least one associated result has insufficient evidence or was rejected as an astronomical candidate. Inspect each candidate separately." };
  if (states.some(s => s.state === "uncertain")) return { state: "uncertain", explanation: imageWarnings ? "Associated measurements and image-level warnings need review. Scientific validation remains incomplete." : "Associated measurements require validation. A known-object match does not validate the current detection." };
  return { state: "not_evaluated", explanation: "Associated results are synthetic or do not provide enough reliability metadata. No verified measurement can be asserted." };
}

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function flags(value: unknown) { return value === undefined || value === null || (Array.isArray(value) && value.every(v => typeof v === "string")); }
/** Reject malformed scientific responses instead of treating them as an empty result. */
export function parseCandidateResponse(value: unknown): CandidateResponse {
  if (!record(value) || !Array.isArray(value.candidates) || !Number.isSafeInteger(value.count) || value.count !== value.candidates.length) throw Error("Invalid candidate list");
  for (const candidate of value.candidates) {
    if (!record(candidate) || typeof candidate.candidate_id !== "string" || !candidate.candidate_id.trim() || typeof candidate.status !== "string" || typeof candidate.is_mock !== "boolean" || !Array.isArray(candidate.observation_ids) || !candidate.observation_ids.every(id => typeof id === "string") || !Array.isArray(candidate.detections) || !flags(candidate.quality_flags)) throw Error("Invalid candidate");
    for (const detection of candidate.detections) {
      if (!record(detection) || typeof detection.observation_id !== "string" || !flags(detection.quality_flags)) throw Error("Invalid detection");
      for (const key of ["ra_deg", "dec_deg", "snr", "flux", "flux_error", "wavelength_um", "bandwidth_um"]) if (detection[key] != null && !finiteNumber(detection[key])) throw Error("Invalid scientific number");
      if ((finiteNumber(detection.dec_deg) && Math.abs(detection.dec_deg) > 90) || (finiteNumber(detection.ra_deg) && (detection.ra_deg < 0 || detection.ra_deg >= 360))) throw Error("Invalid measured coordinates");
    }
    if (candidate.quality != null && (!record(candidate.quality) || (candidate.quality.insufficient_evidence != null && typeof candidate.quality.insufficient_evidence !== "boolean"))) throw Error("Invalid reliability information");
    if (candidate.classification != null && !record(candidate.classification)) throw Error("Invalid classification");
    for (const key of ["median_snr", "min_snr"]) if (candidate[key] != null && !finiteNumber(candidate[key])) throw Error("Invalid SNR summary");
    for (const key of ["motion", "brightness"]) {
      const metrics = candidate[key];
      if (metrics != null && !record(metrics)) throw Error("Invalid measurements");
      if (record(metrics)) for (const [field, metric] of Object.entries(metrics)) {
        if (!["band", "variability_status"].includes(field) && metric != null && !finiteNumber(metric)) throw Error("Invalid scientific measurement");
      }
    }
    if (record(candidate.classification) && candidate.classification.score != null && (!finiteNumber(candidate.classification.score) || candidate.classification.score < 0 || candidate.classification.score > 1)) throw Error("Invalid ranking score");
    const ids = candidate.detections.map(d => d.observation_id);
    const observationIds = candidate.observation_ids as string[];
    if (observationIds.length !== ids.length || new Set(ids).size !== ids.length || new Set(observationIds).size !== ids.length || !ids.every(id => observationIds.includes(id))) throw Error("Mismatched observation references");
  }
  if (value.analysis != null && (!record(value.analysis) || !["not_analyzed", "queued", "processing", "completed", "failed", "unavailable"].includes(String(value.analysis.state)) || !["mock", "real"].includes(String(value.analysis.data_source)) || value.analysis.scope !== "sky_region")) throw Error("Invalid analysis state");
  if (record(value.analysis) && value.analysis.data_source === "mock" && value.candidates.some(candidate => candidate.is_mock !== true)) throw Error("Inconsistent mock provenance");
  return value as unknown as CandidateResponse;
}
export function analysisOutcome(response: CandidateResponse): AnalysisResult {
  const state = response.analysis?.state;
  if (!state) return { phase: "unavailable", retry: false, message: response.count ? "Candidate records were returned, but the backend did not report whether analysis completed." : "An empty response was returned without an analysis state. Analysis completion and absence of candidates cannot be inferred." };
  const simulated = response.analysis?.data_source === "mock";
  if (state === "completed") return { phase: response.count ? "completed" : "completed_empty", retry: false, message: response.count ? `${simulated ? "Synthetic demo analysis" : "Regional analysis"} completed. Results still require scientific interpretation and validation.` : `${simulated ? "Synthetic demo analysis" : "Regional analysis"} completed with no candidates returned. This does not establish that no astronomical changes exist.` };
  const labels = { queued: "The backend reports analysis is queued. No result is available yet.", processing: "The backend reports analysis is processing. No completed result is available yet.", failed: "The backend reports analysis failed. No successful scientific conclusion is available.", unavailable: "The backend reports analysis is unavailable.", not_analyzed: "The backend reports this region has not been analyzed." };
  return { phase: state, retry: false, message: labels[state] };
}
export function analysisError(code?: string): AnalysisResult {
  if (["NOT_IMPLEMENTED", "NOT_FOUND"].includes(code ?? "")) return { phase: "unavailable", retry: false, message: "Scientific candidate analysis is unavailable for this backend. The real-data engine may not be connected. No absence of changes can be inferred." };
  if (code === "NO_COVERAGE") return { phase: "no_coverage", retry: false, message: "The backend reports no image coverage for the requested analysis region. This is different from an analysis that found no candidates." };
  if (["TIMEOUT", "NETWORK", "UPSTREAM_ERROR"].includes(code ?? "") || !code) return { phase: "network_error", retry: true, message: "Candidate results could not be retrieved because the network or upstream archive is unavailable. Analysis completion is unknown." };
  return { phase: "failed", retry: code === "INTERNAL_ERROR", message: code === "INVALID_RESPONSE" ? "Candidate data failed response validation. The result is unavailable; it is not a successful analysis." : "The backend could not complete the scientific request. No successful result or no-candidate conclusion can be drawn." };
}

export function observationProvenance(observation: Observation, source: unknown, frame?: BlinkFrame): [string, string][] {
  return [
    ["Observation ID", textValue(observation.id)], ["Timestamp (UTC)", formatUtc(observation.obs_time)],
    ["Data source / archive", dataSourceLabel(source)], ["Original filename", textValue(observation.source_file)],
    ["Archive product ID", textValue(observation.archive_id)], ["Data release", textValue(observation.release)],
    ["Detector band", textValue(observation.band)],
    ["Wavelength", numberValue(frame ? frame.wavelengthUm : observation.wavelength_um, "µm")],
    ["Bandwidth", numberValue(frame ? frame.bandwidthUm : observation.bandwidth_um, "µm")],
    ["Wavelength source", textValue(frame?.wavelengthSource ?? observation.wavelength_source)],
    ["Processing version", textValue(frame?.processingVersion ?? observation.processing_version)],
    ["Processing level", NOT_AVAILABLE],
    ["TRANSIENT-flagged pixels", numberValue(frame?.transientPixels)],
    ["Pixels repaired for display", numberValue(frame?.repairedPixels)],
    ["Repaired pixel flags", frame?.repairedFlags ? frame.repairedFlags.join(", ") || "No display-repair flags reported" : NOT_AVAILABLE],
  ];
}
export function imageReliability(frames: BlinkFrame[]): { warnings: { title: string; explanation: string }[]; unknown: string[]; spectral: ReturnType<typeof spectralAssessment> } {
  const warnings: { title: string; explanation: string }[] = [], unknown: string[] = [];
  const spectral = spectralAssessment(frames);
  if (frames.some(f => finiteNumber(f.transientPixels) && f.transientPixels > 0)) warnings.push({ title: "TRANSIENT-flagged pixels present", explanation: "The image response reports transient-flagged pixels that were not repaired. Apparent changes near them require caution." });
  if (frames.some(f => finiteNumber(f.repairedPixels) && f.repairedPixels > 0)) warnings.push({ title: "Pixels repaired for display", explanation: "The backend replaced flagged pixels in the displayed PNG. The display is not the untouched measurement data; do not measure flux from it." });
  if (frames.some(f => f.transientPixels == null)) unknown.push("TRANSIENT pixel information is unavailable for one or more images. Unknown does not mean zero.");
  if (frames.some(f => f.repairedPixels == null)) unknown.push("Display-repair information is unavailable for one or more images.");
  const processing = frames.map(f => ({ obs: { ...f.obs, processing_version: f.processingVersion ?? f.obs.processing_version } }));
  if (mixedPipelines(processing).length > 1) warnings.push({ title: "Different processing pipelines", explanation: "Reported pipeline versions differ. Processing or calibration differences may affect a brightness comparison." });
  if (frames.length >= 2 && processing.some(f => !/l2b(?:_retry)?-v\d+/.test(f.obs.processing_version ?? ""))) unknown.push("Processing compatibility undetermined: pipeline metadata is missing or unrecognized. Data releases are not a substitute for processing versions.");
  if (spectral.state === "incompatible" || spectral.state === "estimated") warnings.push({ title: spectral.state === "estimated" ? "Estimated spectral compatibility" : "Spectral incompatibility", explanation: spectral.explanation });
  if (spectral.state === "undetermined") unknown.push(spectral.explanation);
  return { warnings, unknown, spectral };
}
