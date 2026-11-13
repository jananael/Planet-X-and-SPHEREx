// Mirrors backend/app/schemas/candidate.py; optional metadata stays unknown when absent.
export interface Detection {
  observation_id: string; observation_time?: string | null;
  band?: string | null; wavelength_um?: number | null; bandwidth_um?: number | null;
  ra_deg?: number | null; dec_deg?: number | null; snr?: number | null;
  flux?: number | null; flux_error?: number | null; flux_unit?: string | null;
  quality_flags?: string[] | null;
}
export interface Candidate {
  candidate_id: string; observation_ids: string[]; detections: Detection[];
  status: string; known_match?: string | null; data_release?: string | null;
  engine_version?: string | null; is_mock: boolean;
  classification?: { candidate_type?: string | null; method?: string | null; score?: number | null } | null;
  quality?: { data_quality?: "valid" | "degraded" | "unknown"; insufficient_evidence?: boolean } | null;
  quality_flags?: string[] | null; median_snr?: number | null; min_snr?: number | null;
  motion?: { delta_ra_arcsec?: number | null; delta_dec_arcsec?: number | null; angular_displacement_arcsec?: number | null; angular_speed_arcsec_per_day?: number | null; position_angle_deg?: number | null; uncertainty_arcsec?: number | null } | null;
  brightness?: { band?: string | null; delta_flux?: number | null; delta_mag?: number | null; variability_status?: string | null } | null;
  evidence?: Record<string, unknown> | null;
}
export type AnalysisPhase = "not_analyzed" | "requesting" | "queued" | "processing" | "completed" | "completed_empty" | "failed" | "unavailable" | "network_error" | "no_coverage";
export interface CandidateResponse {
  candidates: Candidate[]; count: number;
  analysis?: { state: "not_analyzed" | "queued" | "processing" | "completed" | "failed" | "unavailable"; data_source: "mock" | "real"; scope: "sky_region" };
}
export interface AnalysisResult { phase: AnalysisPhase; message: string; retry: boolean }
export type EvidenceState = "verified" | "uncertain" | "insufficient" | "not_evaluated";
