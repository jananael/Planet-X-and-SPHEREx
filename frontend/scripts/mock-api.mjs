// Local UI preview only. The production API remains backend/app (FastAPI).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";

const data = new URL("../../backend/app/mock_data/", import.meta.url);
const { targets } = JSON.parse(await readFile(new URL("targets.v0.json", data), "utf8"));
const { observations } = JSON.parse(await readFile(new URL("observations.v0.json", data), "utf8"));
const publicObservation = ({ mock_truth, ...observation }) => observation;
const radians = value => value * Math.PI / 180;
function separation(ra, dec, otherRa, otherDec) {
  const a = Math.sin(radians(dec - otherDec) / 2) ** 2
    + Math.cos(radians(dec)) * Math.cos(radians(otherDec)) * Math.sin(radians(ra - otherRa) / 2) ** 2;
  return 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a)))) * 180 / Math.PI;
}
function random(seed) {
  let state = createHash("sha256").update(seed).digest().readUInt32LE();
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
function number(params, name, fallback, min, max) {
  const value = params.has(name) ? Number(params.get(name)) : fallback;
  if (!Number.isFinite(value) || value < min || value > max || params.get(name) === "") {
    throw Object.assign(new Error(`Invalid ${name}. Expected ${min} to ${max}.`), { status: 400, code: "BAD_REQUEST" });
  }
  return value;
}
function fail(status, code, message) { throw Object.assign(new Error(message), { status, code }); }

async function image(observation, params) {
  const target = targets.find(t => t.id === observation.target_id);
  const fp = observation.footprint;
  const ra = number(params, "ra", target?.ra ?? fp.ra, 0, 359.999999999);
  const dec = number(params, "dec", target?.dec ?? fp.dec, -90, 90);
  if (separation(ra, dec, fp.ra, fp.dec) > fp.radius_deg) fail(404, "NO_COVERAGE", "This image does not cover the selected position.");
  const size = number(params, "size", 300, 30, 1800);
  const stretch = params.get("stretch") ?? "asinh";
  if (!["linear", "asinh", "zscale"].includes(stretch)) fail(400, "BAD_REQUEST", "Unknown display stretch.");
  const n = Math.max(8, Math.round(size / 6.15));
  const sky = random(`field:${observation.target_id}`);
  const noise = random(`noise:${observation.id}`);
  const pixels = Float64Array.from({ length: n * n }, () => .02 + (noise() - .5) * .025);
  const add = (starRa, starDec, flux, fwhm = 1.4) => {
    const x = (n - 1) / 2 - ((starRa - ra + 540) % 360 - 180) * Math.cos(radians(dec)) * 3600 / 6.15;
    const y = (n - 1) / 2 - (starDec - dec) * 3600 / 6.15;
    const sigma = fwhm / 2.355, radius = Math.ceil(4 * sigma);
    for (let row = Math.max(0, Math.floor(y - radius)); row <= Math.min(n - 1, Math.ceil(y + radius)); row++) {
      for (let col = Math.max(0, Math.floor(x - radius)); col <= Math.min(n - 1, Math.ceil(x + radius)); col++) {
        pixels[row * n + col] += flux * Math.exp(-((col - x) ** 2 + (row - y) ** 2) / (2 * sigma ** 2));
      }
    }
  };
  for (let i = 0; i < 1500; i++) {
    const r = .3 * Math.sqrt(sky()), theta = 2 * Math.PI * sky();
    add((target?.ra ?? fp.ra) + r * Math.cos(theta) / Math.cos(radians(target?.dec ?? fp.dec)),
      (target?.dec ?? fp.dec) + r * Math.sin(theta), Math.min(.4, .03 * (1 - sky()) ** (-1 / 1.6)));
  }
  const truth = observation.mock_truth;
  if (truth) add(truth.ra, truth.dec, truth.flux, truth.fwhm_px);
  const sorted = [...pixels].sort((a, b) => a - b);
  const min = number(params, "vmin", sorted[Math.floor(sorted.length * .005)], -1e6, 1e6);
  const max = number(params, "vmax", sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .995))], -1e6, 1e6);
  if (max <= min) fail(400, "BAD_REQUEST", "vmax must exceed vmin.");
  const raw = Buffer.from(Array.from(pixels, value => {
    const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
    return Math.round(255 * (stretch === "asinh" ? Math.asinh(10 * normalized) / Math.asinh(10) : normalized));
  }));
  return {
    png: await sharp(raw, { raw: { width: n, height: n, channels: 1 } }).resize(Math.max(256, n), Math.max(256, n), { kernel: "nearest" }).png().toBuffer(),
    headers: { "X-Source-File": observation.source_file, "X-Obs-Time": observation.obs_time,
      "X-Wavelength-Um": String(observation.wavelength_um), "X-Band": observation.band, "X-Release": observation.release,
      "X-Cutout-Ra": String(ra), "X-Cutout-Dec": String(dec), "X-Stretch-Vmin": String(min), "X-Stretch-Vmax": String(max) },
  };
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (["http://localhost:3000", "http://127.0.0.1:3000"].includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Expose-Headers", "X-Source-File,X-Obs-Time,X-Wavelength-Um,X-Band,X-Release,X-Cutout-Ra,X-Cutout-Dec,X-Stretch-Vmin,X-Stretch-Vmax");
  res.setHeader("Cache-Control", "no-store");
  const json = (status, value) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(value)); };
  try {
    if (req.method !== "GET") return json(405, { error: { code: "BAD_REQUEST", message: "Use GET." } });
    const url = new URL(req.url, "http://localhost:8000");
    if (url.pathname === "/api/health") return json(200, { status: "ok", data_source: "mock", version: "node-ui-preview" });
    if (url.pathname === "/api/targets") return json(200, { targets });
    if (url.pathname === "/api/search") {
      const ra = number(url.searchParams, "ra", NaN, 0, 359.999999999);
      const dec = number(url.searchParams, "dec", NaN, -90, 90);
      const radius = number(url.searchParams, "radius", 0, 0, 5);
      const hits = observations.filter(o => separation(ra, dec, o.footprint.ra, o.footprint.dec) <= o.footprint.radius_deg + radius).sort((a, b) => a.mjd - b.mjd);
      return json(200, { query: { ra, dec, radius }, observations: hits.map(publicObservation), count: hits.length });
    }
    const match = url.pathname.match(/^\/api\/observations\/([^/]+)(\/image)?$/);
    if (match) {
      const observation = observations.find(o => o.id === decodeURIComponent(match[1]));
      if (!observation) fail(404, "NOT_FOUND", "Unknown observation.");
      if (!match[2]) return json(200, publicObservation(observation));
      const { png, headers } = await image(observation, url.searchParams);
      res.writeHead(200, { ...headers, "Content-Type": "image/png" });
      return res.end(png);
    }
    // Optional sky-map background still needs internet access, as in FastAPI.
    const hips = url.pathname.match(/^\/api\/hips\/allwise\/(properties|Moc\.fits|Norder\d{1,2}\/Allsky\.(?:jpg|png)|Norder\d{1,2}\/Dir\d+\/Npix\d+\.(?:jpg|png))$/);
    if (hips) {
      const upstream = await fetch(`https://irsa.ipac.caltech.edu/data/hips/CDS/AllWISE/RGB-W4-W2-W1/${hips[1]}`, { signal: AbortSignal.timeout(30000) });
      if (!upstream.ok) fail(upstream.status === 404 ? 404 : 502, "UPSTREAM_ERROR", "Sky-map tile unavailable.");
      res.writeHead(200, { "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream" });
      return res.end(Buffer.from(await upstream.arrayBuffer()));
    }
    fail(404, "NOT_FOUND", "Unknown endpoint.");
  } catch (error) {
    json(error.status ?? 500, { error: { code: error.code ?? "INTERNAL_ERROR", message: error.message } });
  }
});
server.listen(8000, "127.0.0.1", () => console.log("Synthetic mock API: http://localhost:8000 — no real NASA measurements."));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
