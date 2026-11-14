import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { BlinkFrame } from "../lib/types.ts";

// Compile the actual TSX components for SSR checks; no DOM/browser behavior is mocked here.
function component(name: string) {
  const filename = fileURLToPath(new URL(`../components/${name}.tsx`, import.meta.url));
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const nativeRequire = createRequire(filename);
  const localRequire = (specifier: string) => {
    if (specifier.endsWith(".css")) return {};
    if (specifier.startsWith(".")) {
      const target = resolve(dirname(filename), specifier);
      if (existsSync(target + ".ts")) return nativeRequire(target + ".ts");
      if (existsSync(target + ".tsx")) return component(specifier.slice(2));
    }
    return nativeRequire(specifier);
  };
  const module = { exports: {} as Record<string, React.ComponentType<any>> };
  new Function("module", "exports", "require", compiled)(module, module.exports, localRequire);
  return module.exports;
}

test("Observation Details renders the visible observation ID, UTC, missing values, zero and independent reference provenance", () => {
  const { ObservationDetails } = component("observation-details");
  const frame: BlinkFrame = { obs: { id: "CURRENT-OBSERVATION-ID", target_id: null, obs_time: "2026-11-13T12:00:00+02:00", mjd: 0, band: "D3", release: "DR1", source_file: "current.fits", image_url: "/image", wavelength_um: null }, url: "blob:fixture", wavelengthUm: null, bandwidthUm: null, vmin: 0, vmax: 1, transientPixels: 0 };
  const reference = { ...frame, obs: { ...frame.obs, id: "REFERENCE-OBSERVATION-ID", source_file: "reference.fits" }, transientPixels: null };
  const html = renderToStaticMarkup(createElement(ObservationDetails, { frame, reference, observations: [frame.obs, reference.obs], frames: [frame, reference], source: "mock" }));
  assert.match(html, /Observation ID/); assert.match(html, /CURRENT-OBSERVATION-ID/); assert.match(html, /REFERENCE-OBSERVATION-ID/);
  assert.match(html, /2026-11-13 10:00:00 UTC/); assert.match(html, /current\.fits/); assert.match(html, /reference\.fits/);
  assert.match(html, /TRANSIENT-flagged pixels<\/dt><dd>0/);
  assert.match(html, /TRANSIENT-flagged pixels<\/dt><dd>Not available/);
  assert.match(html, /Synthetic demo data/); assert.match(html, /Wavelength: Not available/);
});

test("candidate cards show status, raw zero measurements and prominent photometry failures without confirmation claims", () => {
  const { CandidateCard } = component("scientific-evidence");
  const candidate = JSON.parse(readFileSync(new URL("../../docs/examples/candidate.example.json", import.meta.url), "utf8"));
  candidate.quality_flags.push("photometry_failed");
  candidate.detections[0].flux = 0;
  candidate.detections[0].flux_error = 0;
  const html = renderToStaticMarkup(createElement(CandidateCard, { candidate, selectedIds: candidate.observation_ids }));
  assert.match(html, /Matched to Known Object/); assert.match(html, /does not validate/);
  assert.match(html, /SYNTHETIC \/ EXAMPLE MEASUREMENTS/); assert.match(html, /No brightness-change conclusion/);
  assert.match(html, /0 uJy/); assert.match(html, /Associated Observation IDs/);
  assert.doesNotMatch(html, /Validated Detection/);
});

test("initial scientific summary reports Not analyzed instead of zero candidates or a verified result", () => {
  const { ScientificEvidence } = component("scientific-evidence");
  const html = renderToStaticMarkup(createElement(ScientificEvidence, { coordinates: null, observations: [], frames: [], source: null, searching: false, noCoverage: false, searchFailed: false, loadingImages: false }));
  assert.match(html, /Scientific Evidence Summary/); assert.match(html, /Not analyzed/); assert.match(html, /Quality checks unavailable/);
  assert.doesNotMatch(html, /Candidate records returned: 0/);
  assert.doesNotMatch(html, /Verified Measurement/);
});

test("Evidence Story renders one shared evidence panel, honest empty lens and preserved advanced details", () => {
  const { EvidenceStory } = component("evidence-story");
  const html = renderToStaticMarkup(createElement(EvidenceStory, { outcome: { phase: "unavailable", retry: false, message: "Scientific engine unavailable" }, candidates: [], frames: [], source: "mock", loading: false, canAnalyze: true, onAnalyze: () => {}, advanced: createElement("p", null, "Scientific provenance retained") }));
  assert.match(html, /Evidence Story/); assert.match(html, /Follow the Evidence/);
  assert.match(html, /Scientific results are currently unavailable/);
  assert.match(html, /No image available/);
  assert.equal((html.match(/role="tabpanel"/g) ?? []).length, 1);
  assert.equal((html.match(/role="tab"/g) ?? []).length, 4);
  assert.match(html, /Advanced Scientific Details/); assert.match(html, /Scientific provenance retained/);
  assert.match(html, /Synthetic demo data/);
  assert.doesNotMatch(html, /<img/);
});

test("machine learning renders without a location or backend and disables prediction actions", () => {
  const { MachineLearning } = component("machine-learning");
  const html = renderToStaticMarkup(createElement(MachineLearning, { coordinates: null, source: null, changeLocationHref: "/explore" }));
  assert.match(html, /Predicting the Sky of Tomorrow/);
  assert.match(html, /Predictions are not yet available/);
  assert.match(html, /fieldset[^>]*disabled/);
  assert.match(html, /Choose Sky Coordinates/);
  assert.match(html, /Not available/);
  const located = renderToStaticMarkup(createElement(MachineLearning, { coordinates: { ra: 180, dec: 0 }, source: "mock", changeLocationHref: "/explore?ra=180&dec=0" }));
  assert.match(located, /180 °/);
  assert.match(located, /0 °/);
  assert.match(located, /Synthetic demo data/);
  assert.match(located, /not yet connected as model input/);
});

test("real candidate renders uncertainty with units and an explicit unconfirmed label", () => {
  const { CandidateCard } = component("scientific-evidence");
  const candidate = JSON.parse(readFileSync(new URL("../../docs/examples/candidate.example.json", import.meta.url), "utf8"));
  candidate.is_mock = false;
  candidate.detections[0].flux = 12.4;
  candidate.detections[0].flux_error = 0.8;
  candidate.detections[0].flux_unit = "uJy";
  let html = renderToStaticMarkup(createElement(CandidateCard, { candidate, selectedIds: candidate.observation_ids }));
  assert.match(html, /Unconfirmed candidate/);
  assert.match(html, /12.4 ± 0.8 uJy/);
  assert.match(html, /Statistical versus systematic errors and confidence levels are not specified/);
  candidate.detections[0].flux_error = null;
  html = renderToStaticMarkup(createElement(CandidateCard, { candidate, selectedIds: candidate.observation_ids }));
  assert.match(html, /12.4 uJy — Uncertainty not available/);
  candidate.detections[0].flux_error = -2;
  html = renderToStaticMarkup(createElement(CandidateCard, { candidate, selectedIds: candidate.observation_ids }));
  assert.match(html, /invalid uncertainty reported/);
  assert.doesNotMatch(html, /± -2/);
});

test("empty observation search and search failure are not presented as completed scientific analysis", () => {
  const { ScientificEvidence } = component("scientific-evidence");
  const props = { coordinates: { ra: 10, dec: 20 }, observations: [], frames: [], source: "real", searching: false, noCoverage: true, searchFailed: false, loadingImages: false };
  const empty = renderToStaticMarkup(createElement(ScientificEvidence, props));
  assert.match(empty, /Not analyzed/); assert.match(empty, /Scientific candidate analysis was not performed/);
  assert.doesNotMatch(empty, /Analysis completed/);
  const failed = renderToStaticMarkup(createElement(ScientificEvidence, { ...props, noCoverage: false, searchFailed: true }));
  assert.match(failed, /Analysis unavailable/); assert.match(failed, /Observation search failed/);
  assert.doesNotMatch(failed, /Candidate records returned: 0/);
});
