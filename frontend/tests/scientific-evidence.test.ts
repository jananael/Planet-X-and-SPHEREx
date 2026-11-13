import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aggregateEvidence, analysisError, analysisOutcome, analysisSelectionKey, candidateQuality, candidateStatus, evidenceForCandidate, evidenceLabels, explainFlag, imageReliability, matchingAnalysis, observationProvenance, parseCandidateResponse, qualityDescriptions } from "../lib/scientific-evidence.ts";
import { dataSourceLabel, emptyCoverageMessage, formatUtc, NOT_AVAILABLE, numberValue, numericHeader, measurementValue, uncertaintyValue } from "../lib/scientific-format.ts";
import { uncertaintyAvailability } from "../lib/scientific-evidence.ts";
import { spectralAssessment } from "../lib/observations.ts";
import type { Candidate, CandidateResponse } from "../lib/scientific-types.ts";
import type { BlinkFrame } from "../lib/types.ts";

// Test-only contract fixtures; these are never served as scientific results.
const candidate = (overrides: Partial<Candidate> = {}): Candidate => ({
  candidate_id: "test-candidate", observation_ids: ["observation-1"],
  detections: [{ observation_id: "observation-1", observation_time: "2026-11-13T10:00:00Z", ra_deg: 0, dec_deg: 0, flux: 0, flux_error: 0, flux_unit: "uJy", snr: 0, quality_flags: [] }],
  status: "pending_validation", is_mock: false, engine_version: "test-only",
  quality: { data_quality: "valid", insufficient_evidence: false }, quality_flags: [],
  classification: { candidate_type: "unclassified", method: "unit test", score: 0 }, ...overrides,
});

test("measurement formatting preserves reported numbers and distinguishes absent, invalid and zero uncertainty", () => {
  assert.equal(measurementValue(12.4, 0.8, "uJy"), "12.4 ± 0.8 uJy");
  assert.equal(measurementValue(0, 0, "uJy"), "0 ± 0 uJy");
  assert.equal(measurementValue(1e-9, null, "uJy"), "1e-9 uJy — Uncertainty not available");
  assert.equal(measurementValue(null, 2, "uJy"), "Not available");
  for (const invalid of [-1, NaN, Infinity, "", "2"]) {
    assert.match(measurementValue(3, invalid, "uJy"), /invalid uncertainty reported/);
    assert.match(uncertaintyValue(invalid), /not available/);
  }
  assert.equal(uncertaintyValue(null), "Uncertainty not available");
});

test("uncertainty summary counts genuine zero errors, warns for negative values and excludes synthetic results", () => {
  assert.match(uncertaintyAvailability([candidate()]), /1 of 1/);
  const result = candidate(); result.detections[0].flux_error = -1;
  assert.match(uncertaintyAvailability([result]), /0 of 1/);
  assert.match(uncertaintyAvailability([result]), /Invalid uncertainty reported/);
  assert.match(uncertaintyAvailability([candidate({ is_mock: true })]), /no associated real measurement/);
});
const frame = (overrides: Partial<BlinkFrame> = {}): BlinkFrame => ({
  obs: { id: "observation-1", target_id: null, obs_time: "2026-11-13T10:00:00Z", mjd: 0, band: "D3", release: "DR1", wavelength_um: null, source_file: "product.fits", image_url: "/api/observations/observation-1/image", processing_version: "l2b-v27-test" },
  url: "blob:test-only", wavelengthUm: 2, bandwidthUm: .1, vmin: 0, vmax: 1, transientPixels: 0, repairedPixels: 0, repairedFlags: [], ...overrides,
});

test("all candidate states are readable; known matches and unsupported confirmation never become validated", () => {
  for (const [value, expected] of [["pending_validation", "Possible Candidate — Awaiting Validation"], ["known_object", "Matched to Known Object"], ["artifact", "Likely Imaging or Processing Artifact"], ["rejected", "Rejected Candidate"]]) assert.equal(candidateStatus(value), expected);
  assert.equal(candidateStatus("confirmed"), "Validation status not available");
  assert.equal(candidateStatus("validated_detection"), "Validation status not available");
  assert.notEqual(evidenceForCandidate(candidate({ status: "known_object", known_match: "A known star" })).state, "verified");
  assert.notEqual(evidenceForCandidate(candidate({ detections: [{ ...candidate().detections[0], snr: 999 }] })).state, "verified");
  assert.equal(evidenceLabels.verified, "Verified Measurement"); // Label exists; the current contract cannot justify it.
});

test("empty responses need explicit completed metadata before saying analysis found no candidates", () => {
  assert.equal(analysisOutcome({ candidates: [], count: 0 }).phase, "unavailable");
  const completed: CandidateResponse = { candidates: [], count: 0, analysis: { state: "completed", data_source: "real", scope: "sky_region" } };
  assert.equal(analysisOutcome(completed).phase, "completed_empty");
  assert.match(analysisOutcome(completed).message, /does not establish/);
  assert.match(analysisOutcome({ ...completed, analysis: { ...completed.analysis!, data_source: "mock" } }).message, /Synthetic demo/);
  for (const state of ["not_analyzed", "queued", "processing", "failed", "unavailable"] as const) assert.equal(analysisOutcome({ ...completed, analysis: { ...completed.analysis!, state } }).phase, state);
});

test("candidate network, coverage, unsupported-engine and scientific failures stay distinct", () => {
  assert.equal(analysisError("NO_COVERAGE").phase, "no_coverage");
  assert.equal(analysisError("INTERNAL_ERROR").phase, "failed");
  assert.equal(analysisError("NOT_IMPLEMENTED").phase, "unavailable");
  assert.equal(analysisError("NOT_IMPLEMENTED").retry, false);
  assert.equal(analysisError("NOT_FOUND").phase, "unavailable");
  assert.equal(analysisError("INVALID_RESPONSE").phase, "failed");
  for (const code of ["NETWORK", "TIMEOUT", "UPSTREAM_ERROR", undefined]) assert.equal(analysisError(code).phase, "network_error");
});

test("missing TRANSIENT data is unknown, while measured zero and positive counts are preserved", () => {
  for (const value of [null, "", " ", "bad", "Infinity", "-1", "1.5", "0x10"]) assert.equal(numericHeader(value, { count: true }), null);
  assert.equal(numericHeader("0", { count: true }), 0);
  assert.equal(numericHeader("12", { count: true }), 12);
  assert.equal(numericHeader("1e2", { count: true }), 100);
  assert.equal(numericHeader("Infinity", { positive: true }), null);
  assert.equal(numberValue(0), "0");
  for (const value of [null, undefined, NaN, "0"]) assert.equal(numberValue(value), NOT_AVAILABLE);
});

test("timestamps convert explicit offsets to UTC and never assume missing timezones", () => {
  assert.equal(formatUtc("2026-11-13T12:30:00+02:00"), "2026-11-13 10:30:00 UTC");
  for (const value of [null, undefined, "", "2026-11-13T12:30:00", "brokenZ"]) assert.equal(formatUtc(value), NOT_AVAILABLE);
});

test("metadata exposes the observation ID, source and both known zero and unavailable values", () => {
  const known = frame();
  const rows = Object.fromEntries(observationProvenance(known.obs, "real", known));
  assert.equal(rows["Observation ID"], "observation-1");
  assert.equal(rows["Timestamp (UTC)"], "2026-11-13 10:00:00 UTC");
  assert.match(rows["Data source / archive"], /IRSA/);
  assert.equal(rows["TRANSIENT-flagged pixels"], "0");
  assert.equal(rows["Processing level"], NOT_AVAILABLE);
  const unknown = Object.fromEntries(observationProvenance({ ...known.obs, source_file: "", archive_id: null }, null, { ...known, transientPixels: null }));
  assert.equal(unknown["Original filename"], NOT_AVAILABLE);
  assert.equal(unknown["Archive product ID"], NOT_AVAILABLE);
  assert.equal(unknown["TRANSIENT-flagged pixels"], NOT_AVAILABLE);
});

test("missing spectral metadata causes explicit estimated or undetermined compatibility", () => {
  const f = (wavelengthUm: number | null, bandwidthUm: number | null) => ({ wavelengthUm, bandwidthUm });
  assert.equal(spectralAssessment([f(2, .1)]).state, "not_applicable");
  assert.equal(spectralAssessment([f(null, .1), f(2, .1)]).state, "undetermined");
  for (const delta of [.01, .1]) {
    const result = spectralAssessment([f(2, null), f(2 + delta, .1)]);
    assert.equal(result.state, "estimated");
    assert.match(result.explanation, /does not verify/);
  }
  assert.equal(spectralAssessment([f(2, .1), f(2.02, .1)]).state, "overlap");
  assert.equal(spectralAssessment([f(2, .01), f(2.1, .01)]).state, "incompatible");
});

test("every actual backend quality flag has an explanation, and absent flags never certify checks", () => {
  const python = readFileSync(new URL("../../backend/app/schemas/candidate.py", import.meta.url), "utf8");
  const list = python.match(/QualityFlag = Literal\[([\s\S]*?)\]/)![1];
  const names = [...list.matchAll(/^\s*"([a-z_]+)"/gm)].map(match => match[1]);
  for (const name of names) { assert.ok(qualityDescriptions[name], name); assert.ok(explainFlag(name).explanation.length > 40); }
  assert.match(explainFlag("future_flag").title, /Unrecognized/);
  assert.match(candidateQuality(candidate({ quality_flags: undefined, detections: [{ ...candidate().detections[0], quality_flags: undefined }] })), /unavailable/);
  assert.match(candidateQuality(candidate()), /not certified/);
  assert.match(candidateQuality(candidate({ quality_flags: ["low_snr"] })), /warnings detected/);
  assert.match(candidateQuality(candidate({ quality: { data_quality: "degraded", insufficient_evidence: false } })), /warnings detected/);
});

test("photometry failure cannot be treated as a usable brightness result", () => {
  const result = candidate({ quality_flags: ["photometry_failed"], motion: null });
  assert.equal(evidenceForCandidate(result).state, "insufficient");
  assert.match(explainFlag("photometry_failed").explanation, /No brightness-change conclusion/);
});

test("evidence states remain conservative for synthetic, unknown, rejected and unvalidated real results", () => {
  assert.equal(evidenceForCandidate(candidate({ is_mock: true })).state, "not_evaluated");
  assert.equal(evidenceForCandidate(candidate({ quality: undefined })).state, "not_evaluated");
  assert.equal(evidenceForCandidate(candidate({ quality: { data_quality: "unknown", insufficient_evidence: false } })).state, "not_evaluated");
  assert.equal(evidenceForCandidate(candidate({ quality: { data_quality: "degraded", insufficient_evidence: true } })).state, "insufficient");
  for (const status of ["artifact", "rejected"]) assert.equal(evidenceForCandidate(candidate({ status })).state, "insufficient");
  assert.equal(evidenceForCandidate(candidate()).state, "uncertain");
  assert.equal(aggregateEvidence([], false).state, "not_evaluated");
  assert.equal(aggregateEvidence([candidate()], true).state, "uncertain");
  assert.equal(aggregateEvidence([candidate({ status: "rejected" })], false).state, "insufficient");
});

test("image reliability distinguishes missing flags, zero counts and reported problems", () => {
  assert.equal(imageReliability([frame()]).warnings.length, 0);
  assert.ok(imageReliability([frame({ transientPixels: null, repairedPixels: null })]).unknown.length >= 2);
  assert.match(imageReliability([frame({ transientPixels: 2 })]).warnings[0].title, /TRANSIENT/);
  assert.match(imageReliability([frame({ repairedPixels: 2 })]).warnings[0].title, /repaired/);
  const unknownVersion = frame({ obs: { ...frame().obs, release: "QR3", processing_version: null } });
  assert.ok(imageReliability([frame(), unknownVersion]).unknown.some(item => item.includes("Processing compatibility undetermined")));
});

test("real, mock and unknown data sources are never interchanged", () => {
  assert.match(dataSourceLabel("mock"), /not NASA measurements/);
  assert.match(dataSourceLabel("real"), /NASA SPHEREx/);
  assert.match(dataSourceLabel(null), /not available/);
  assert.match(emptyCoverageMessage("mock"), /does not establish real SPHEREx coverage/);
  assert.match(emptyCoverageMessage("real"), /filters/);
  assert.match(emptyCoverageMessage(null), /not been established/);
  const example = JSON.parse(readFileSync(new URL("../../docs/examples/candidate.example.json", import.meta.url), "utf8"));
  assert.equal(parseCandidateResponse({ candidates: [example], count: 1 }).candidates[0].is_mock, true);
  assert.equal(evidenceForCandidate(example).state, "not_evaluated");
});

test("malformed candidate counts and invalid measurements are not accepted as successful results", () => {
  assert.throws(() => parseCandidateResponse({ candidates: [] }));
  assert.throws(() => parseCandidateResponse({ candidates: [], count: 1 }));
  assert.throws(() => parseCandidateResponse({ candidates: [candidate({ is_mock: undefined as unknown as boolean })], count: 1 }));
  assert.throws(() => parseCandidateResponse({ candidates: [candidate({ motion: { angular_displacement_arcsec: NaN } })], count: 1 }));
  assert.throws(() => parseCandidateResponse({ candidates: [candidate()], count: 1, analysis: { state: "completed", data_source: "mock", scope: "sky_region" } }));
  assert.equal(parseCandidateResponse({ candidates: [candidate()], count: 1 }).count, 1);
});

test("changing coordinates, selected observations or data source immediately hides stale analysis", () => {
  const point = { ra: 10, dec: 20 };
  const key = analysisSelectionKey(point, ["a", "b"], "real");
  const stored = { key, response: { candidates: [candidate()], count: 1 } };
  assert.equal(matchingAnalysis(stored, key, false), stored);
  assert.equal(matchingAnalysis(stored, analysisSelectionKey(point, ["b", "a"], "real"), false), stored);
  assert.equal(matchingAnalysis(stored, analysisSelectionKey({ ...point, ra: 11 }, ["a", "b"], "real"), false), null);
  assert.equal(matchingAnalysis(stored, analysisSelectionKey(point, ["a"], "real"), false), null);
  assert.equal(matchingAnalysis(stored, analysisSelectionKey(point, ["a", "b"], "mock"), false), null);
  assert.equal(matchingAnalysis(stored, key, true), null);
});
