import type { AnalysisResult, Candidate } from "./scientific-types.ts";
import type { BlinkFrame, Observation } from "./types.ts";
import { candidateFlags, imageReliability } from "./scientific-evidence.ts";
import { finiteNumber } from "./scientific-format.ts";

export function storyVerdict(outcome: AnalysisResult, candidate?: Candidate): string {
  if (outcome.phase === "not_analyzed") return "This region has not been analyzed yet.";
  if (outcome.phase === "requesting") return "Requesting the region's scientific analysis.";
  if (outcome.phase === "queued") return "The analysis is waiting to begin.";
  if (outcome.phase === "processing") return "The scientific analysis is in progress.";
  if (outcome.phase === "completed_empty") return "No candidates were reported by the completed analysis.";
  if (outcome.phase === "failed") return "The analysis could not be completed.";
  if (outcome.phase === "no_coverage") return "No image coverage was reported for this region.";
  if (["unavailable", "network_error"].includes(outcome.phase)) return "Scientific results are currently unavailable.";
  if (!candidate) return "No associated candidate is available to inspect.";
  if (candidate.status === "artifact") return "The reported result is likely an imaging artifact.";
  if (candidate.status === "rejected") return "This candidate was rejected for further interpretation.";
  if (candidate.status === "known_object") return "A known-object match still needs detection validation.";
  if (candidate.quality?.insufficient_evidence) return "The available evidence is insufficient for a reliable conclusion.";
  return "A possible candidate requires further validation.";
}

export function candidateFrames(frames: BlinkFrame[], candidate?: Candidate): BlinkFrame[] {
  return candidate ? frames.filter(f => candidate.observation_ids.includes(f.obs.id)) : frames;
}

export function evidenceDimensions(frames: BlinkFrame[], candidate?: Candidate) {
  const flags = candidate ? candidateFlags(candidate) : [];
  const quality = imageReliability(frames);
  const photometryFailed = flags.includes("photometry_failed");
  const uncertaintyMissing = candidate?.detections.some(d => finiteNumber(d.flux) && (!finiteNumber(d.flux_error) || d.flux_error < 0 || !d.flux_unit));
  return [
    { id: "quality", label: "Image Quality", state: photometryFailed ? "Failed" : flags.length || quality.warnings.some(w => /pixels|pipeline/i.test(w.title)) || candidate?.quality?.data_quality === "degraded" ? "Warning" : "Unknown" },
    { id: "alignment", label: "Alignment", state: flags.includes("poor_wcs") ? "Warning" : "Unknown" },
    { id: "spectral", label: "Spectral Compatibility", state: ["incompatible", "estimated"].includes(quality.spectral.state) ? "Warning" : quality.spectral.state === "overlap" ? "Not Evaluated" : "Unknown" },
    { id: "uncertainty", label: "Uncertainty", state: photometryFailed ? "Failed" : candidate?.is_mock ? "Not Evaluated" : uncertaintyMissing ? "Warning" : "Unknown" },
  ];
}

export function supportingIds(candidate: Candidate): string[] {
  const ids = [...new Set(candidate.observation_ids)];
  if (!ids.length || ids.some(id => !id.trim() || !candidate.detections.some(d => d.observation_id === id))) throw Error("Supporting observation references are unavailable or inconsistent.");
  return ids;
}

/** Resolve every referenced observation before changing the viewer. Never substitute another ID. */
export async function resolveSupportingObservations(candidate: Candidate, available: Observation[], load: (id: string) => Promise<Observation>, signal: AbortSignal): Promise<Observation[]> {
  signal.throwIfAborted();
  const records = await Promise.all(supportingIds(candidate).map(async id => {
    const observation = available.find(o => o.id === id) ?? await load(id);
    if (!observation || observation.id !== id || typeof observation.image_url !== "string" || !observation.image_url.startsWith("/api/observations/") || !Number.isFinite(observation.mjd)) throw Error(`Supporting observation ${id} is missing or invalid`);
    return observation;
  }));
  signal.throwIfAborted();
  return records.sort((a, b) => a.mjd - b.mjd);
}
