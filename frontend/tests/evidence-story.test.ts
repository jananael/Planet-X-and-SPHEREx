import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { candidateFrames, evidenceDimensions, resolveSupportingObservations, storyVerdict, supportingIds } from "../lib/evidence-story.ts";
import type { AnalysisResult, Candidate } from "../lib/scientific-types.ts";
import type { BlinkFrame, Observation } from "../lib/types.ts";

const fixture = (): Candidate => JSON.parse(readFileSync(new URL("../../docs/examples/candidate.example.json", import.meta.url), "utf8"));
const observation = (id: string, mjd = 1): Observation => ({ id, target_id: null, obs_time: "2026-01-01T00:00:00Z", mjd, wavelength_um: 2, band: "D3", release: "MOCK", source_file: `${id}.fits`, image_url: `/api/observations/${id}/image` });
const frame = (id: string, transientPixels: number | null = null): BlinkFrame => ({ obs: observation(id), url: `blob:${id}`, wavelengthUm: 2, bandwidthUm: null, vmin: 0, vmax: 1, transientPixels });
const outcome = (phase: AnalysisResult["phase"]): AnalysisResult => ({ phase, retry: false, message: "test" });

test("story verdicts distinguish all execution states without converting missing results into a zero result", () => {
  for (const [phase, text] of [["not_analyzed", /not been analyzed/], ["queued", /waiting/], ["processing", /in progress/], ["requesting", /Requesting/], ["completed_empty", /No candidates were reported/], ["failed", /could not be completed/], ["unavailable", /unavailable/], ["network_error", /unavailable/], ["no_coverage", /No image coverage/]] as const) assert.match(storyVerdict(outcome(phase)), text);
  assert.doesNotMatch(storyVerdict(outcome("completed")), /No candidates were reported/);
});

test("candidate verdicts preserve known matches, artifacts, rejection and insufficient evidence separately", () => {
  const candidate = fixture();
  for (const [status, text] of [["known_object", /still needs detection validation/], ["artifact", /imaging artifact/], ["rejected", /rejected/]] as const) {
    candidate.status = status; assert.match(storyVerdict(outcome("completed"), candidate), text);
  }
  candidate.status = "pending_validation"; candidate.quality = { data_quality: "valid", insufficient_evidence: true };
  assert.match(storyVerdict(outcome("completed"), candidate), /insufficient/);
  candidate.quality.insufficient_evidence = false;
  assert.match(storyVerdict(outcome("completed"), candidate), /requires further validation/);
});

test("candidate lens only uses its exact observation IDs and clears unrelated frames on candidate switches", () => {
  const candidate = fixture(); candidate.observation_ids = ["a"]; candidate.detections = [{ observation_id: "a" }];
  const frames = [frame("a"), frame("b")];
  assert.deepEqual(candidateFrames(frames, candidate).map(f => f.obs.id), ["a"]);
  candidate.observation_ids = ["missing"];
  assert.deepEqual(candidateFrames(frames, candidate), []);
  assert.deepEqual(candidateFrames([], candidate), []);
});

test("evidence dimensions never infer quality or WCS passed from empty flags or zero TRANSIENT pixels", () => {
  const candidate = fixture(); candidate.quality_flags = []; candidate.detections.forEach(d => { d.quality_flags = []; });
  const normal = evidenceDimensions([frame("a", 0)], candidate);
  assert.equal(normal[0].state, "Unknown"); assert.equal(normal[1].state, "Unknown");
  candidate.quality_flags = ["poor_wcs", "photometry_failed"];
  const warnings = evidenceDimensions([frame("a", null)], candidate);
  assert.equal(warnings[0].state, "Failed"); assert.equal(warnings[1].state, "Warning"); assert.equal(warnings[3].state, "Failed");
  assert.equal(evidenceDimensions([frame("a"), frame("b")])[2].state, "Warning");
});

test("supporting observations resolve all exact references, reuse existing metadata and sort by time", async () => {
  const candidate = fixture(); candidate.observation_ids = ["b", "a"]; candidate.detections = [{ observation_id: "b" }, { observation_id: "a" }];
  const loaded: string[] = [];
  const result = await resolveSupportingObservations(candidate, [observation("a", 1)], async id => { loaded.push(id); return observation(id, 2); }, new AbortController().signal);
  assert.deepEqual(loaded, ["b"]); assert.deepEqual(result.map(o => o.id), ["a", "b"]);
});

test("missing, mismatched or cancelled supporting images fail instead of selecting unrelated observations", async () => {
  const candidate = fixture(); candidate.observation_ids = ["a"]; candidate.detections = [{ observation_id: "a" }];
  const available = [observation("unrelated")];
  await assert.rejects(resolveSupportingObservations(candidate, available, async () => observation("wrong"), new AbortController().signal));
  await assert.rejects(resolveSupportingObservations(candidate, available, async () => { throw Error("NOT_FOUND"); }, new AbortController().signal));
  const controller = new AbortController();
  await assert.rejects(resolveSupportingObservations(candidate, available, async id => { controller.abort(); return observation(id); }, controller.signal));
  assert.deepEqual(available.map(o => o.id), ["unrelated"]);
  candidate.observation_ids = []; assert.throws(() => supportingIds(candidate));
});
