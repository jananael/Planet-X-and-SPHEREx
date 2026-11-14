import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEMO_DATA_NOTICE, DEMO_IMAGE_PIXELS, DEMO_OBSERVATIONS, DEMO_SOURCES, DEMO_SPECTRUM, MODE_EXPLANATIONS } from "../lib/visualization-model.ts";

function workspaceComponent() {
  const filename = fileURLToPath(new URL("../components/visualization-workspace.tsx", import.meta.url));
  const output = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const nativeRequire = createRequire(filename);
  const localRequire = (specifier: string) => {
    if (specifier === "./brand") return { Brand: () => createElement("span", null, "SKYTRACE") };
    if (specifier.endsWith(".css")) return {};
    if (specifier.startsWith(".")) {
      const target = resolve(dirname(filename), specifier);
      if (existsSync(target + ".ts")) return nativeRequire(target + ".ts");
      if (existsSync(target + ".tsx")) return nativeRequire(target + ".tsx");
    }
    return nativeRequire(specifier);
  };
  const module = { exports: {} as Record<string, React.ComponentType> };
  new Function("module", "exports", "require", output)(module, module.exports, localRequire);
  return module.exports.VisualizationWorkspace;
}

test("visualization fixture is self-contained, labeled, typed, and internally bounded", () => {
  assert.equal(DEMO_DATA_NOTICE, "Illustrative Demo Data — Not Live NASA Data");
  assert.equal(DEMO_SOURCES.length, 5);
  assert.equal(new Set(DEMO_SOURCES.map(item => item.id)).size, DEMO_SOURCES.length);
  assert.ok(DEMO_SOURCES.every(item => item.raDeg >= 0 && item.raDeg <= 360 && item.decDeg >= -90 && item.decDeg <= 90));
  assert.equal(DEMO_SPECTRUM.length, 7);
  assert.ok(DEMO_SPECTRUM.every(point => point.wavelengthUm > 0 && point.flux > 0 && point.uncertainty > 0));
  assert.equal(DEMO_IMAGE_PIXELS.length, 48);
  assert.ok(DEMO_IMAGE_PIXELS.every(row => row.length === 48 && row.every(Number.isFinite)));
  assert.equal(DEMO_OBSERVATIONS.length, 3);
  assert.deepEqual(Object.keys(MODE_EXPLANATIONS).sort(), ["bands", "image", "sky", "space", "spectrum", "time"]);
});

test("Visualization page renders every mode, demo warning, learning and scientific limitations", () => {
  const Workspace = workspaceComponent();
  const html = renderToStaticMarkup(createElement(Workspace));
  for (const label of ["3D space", "Sky map", "Spectrum", "Image", "Bands", "Timeline"]) assert.match(html, new RegExp(label));
  assert.match(html, /Illustrative Demo Data — Not Live NASA Data/);
  assert.match(html, /No live astronomy products are loaded/);
  assert.match(html, /Turn on learning mode/);
  assert.match(html, /What can’t we conclude\?/);
  assert.match(html, /drag to rotate/);
  assert.match(html, /Start guided exploration/);
  assert.doesNotMatch(html, /Planet X discovery|validated moving object/i);
});

test("Visualization is the active product tab and the ML dashboard link is removed", () => {
  const home = readFileSync(new URL("../components/home-page.tsx", import.meta.url), "utf8");
  const explorer = readFileSync(new URL("../components/explorer.tsx", import.meta.url), "utf8");
  const staticHome = readFileSync(new URL("../public/skytrace-homepage/index.html", import.meta.url), "utf8");
  const workspaceNav = readFileSync(new URL("../components/workspace-navigation.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/visualization/page.tsx", import.meta.url), "utf8");
  assert.match(home, /href="\/visualization"/);
  assert.match(staticHome, /href="\/visualization"/);
  assert.match(workspaceNav, /\["\/visualization", "Visualization"\]/);
  assert.match(route, /VisualizationWorkspace/);
  assert.doesNotMatch(home + explorer, /\/machine-learning/);
});
