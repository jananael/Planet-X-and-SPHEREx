import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiFailure, errorMessage, getCandidateAnalysis, loadBlink, loadFrame, setUpstreamRetryDelay, waitForImage } from "../lib/api.ts";
import type { Observation } from "../lib/types.ts";

const observation = (id: string): Observation => ({ id, target_id: null, obs_time: "2025-08-14T02:10:00Z", mjd: 60901, band: "D3", release: "QR2", source_file: `${id}.fits`, wavelength_um: null, image_url: `/api/observations/${id}/image` });
const settings = { ra: 210.4, dec: -11.85, size: 300, stretch: "asinh" as const };

// Minimal browser Image: fires onload asynchronously once src is set.
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_: string) { setTimeout(() => this.onload?.(), 0); }
}

test("image loader preserves zero counts and treats absent, invalid and infinite scientific headers as unknown", async () => {
  const originalFetch = globalThis.fetch, originalImage = globalThis.Image;
  globalThis.Image = FakeImage as unknown as typeof Image;
  try {
    for (const [header, expected] of [[null, null], ["", null], ["bad", null], ["-1", null], ["0", 0], ["7", 7]] as const) {
      globalThis.fetch = async () => {
        const headers = new Headers({ "X-Stretch-Vmin": "0", "X-Stretch-Vmax": "1", "X-Wavelength-Um": "Infinity", "X-Bandwidth-Um": "Infinity" });
        if (header !== null) headers.set("X-Transient-Pixels", header);
        return new Response(new Blob(["PNG"]), { headers });
      };
      const frame = await loadFrame(observation("zero-or-missing"), settings, new AbortController().signal);
      assert.equal(frame.transientPixels, expected);
      assert.equal(frame.wavelengthUm, null);
      assert.equal(frame.bandwidthUm, null);
      assert.equal(frame.repairedPixels, null);
      URL.revokeObjectURL(frame.url);
    }
  } finally { globalThis.fetch = originalFetch; globalThis.Image = originalImage; }
});

test("candidate client uses the actual endpoint and preserves completed-empty versus unsupported and failed requests", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async input => {
      const url = new URL(String(input));
      assert.equal(url.pathname, "/api/candidates"); assert.equal(url.searchParams.get("ra"), "10"); assert.equal(url.searchParams.get("radius"), "0.25");
      assert.equal(url.searchParams.get("band"), "D1"); assert.equal(url.searchParams.get("pipeline"), "v27");
      return Response.json({ candidates: [], count: 0, analysis: { state: "completed", data_source: "real", scope: "sky_region" } });
    };
    const result = await getCandidateAnalysis(10, 20, "D1", "v27", new AbortController().signal);
    assert.equal(result.analysis?.state, "completed"); assert.equal(result.count, 0);
    for (const [status, code] of [[501, "NOT_IMPLEMENTED"], [500, "INTERNAL_ERROR"], [404, "NO_COVERAGE"]] as const) {
      globalThis.fetch = async () => Response.json({ error: { code, message: "backend test failure" } }, { status });
      await assert.rejects(getCandidateAnalysis(10, 20, "D1", "v27", new AbortController().signal), (error: unknown) => error instanceof ApiFailure && error.code === code);
    }
    globalThis.fetch = async () => Response.json({ candidates: [], count: 5 });
    await assert.rejects(getCandidateAnalysis(10, 20, "D1", "v27", new AbortController().signal), (error: unknown) => error instanceof ApiFailure && error.code === "INVALID_RESPONSE");
  } finally { globalThis.fetch = originalFetch; }
});

test("blank and nondecimal image stretch headers never become measured zero", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const minimum of ["", "   ", "0x00", "Infinity", "NaN"]) {
      globalThis.fetch = async () => new Response(new Blob(["PNG"]), { headers: { "X-Stretch-Vmin": minimum, "X-Stretch-Vmax": "1" } });
      await assert.rejects(loadFrame(observation("invalid-limits"), settings, new AbortController().signal), (error: unknown) => error instanceof ApiFailure && error.code === "INVALID_IMAGE");
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("candidate requests can be cancelled when the observation selection changes", async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  try {
    globalThis.fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
      const signal = init!.signal!;
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      queueMicrotask(() => controller.abort());
    });
    await assert.rejects(getCandidateAnalysis(10, 20, "D1", "v27", controller.signal));
    assert.equal(controller.signal.aborted, true);
  } finally { globalThis.fetch = originalFetch; }
});

test("waitForImage does not hang when the image never loads (e.g. hidden tab)", async () => {
  const originalImage = globalThis.Image;
  globalThis.Image = class { onload = null; onerror = null; set src(_: string) {} } as unknown as typeof Image;
  try {
    await assert.rejects(waitForImage("blob:x", new AbortController().signal, 20), (e: unknown) => e instanceof ApiFailure && e.code === "INVALID_IMAGE");
  } finally { globalThis.Image = originalImage; }
});

test("blink loader reuses first-image limits, reads header wavelength, and limits concurrency", async () => {
  const originalFetch = globalThis.fetch;
  const originalImage = globalThis.Image;
  globalThis.Image = FakeImage as unknown as typeof Image;
  let active = 0, peak = 0;
  const calls: URL[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input)); calls.push(url); active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 5)); active--;
    if (calls.length === 1) assert.equal(url.searchParams.has("vmin"), false);
    return new Response(new Blob(["PNG"]), { headers: { "X-Stretch-Vmin": "-0.5", "X-Stretch-Vmax": "12.5", "X-Wavelength-Um": "2.04" } });
  };
  try {
    const { frames, failures } = await loadBlink(Array.from({ length: 9 }, (_, i) => observation(String(i))), settings, new AbortController().signal, () => {});
    try {
      assert.equal(frames.length, 9); assert.equal(failures.length, 0); assert.equal(peak, 3);
      assert.deepEqual(frames.map(f => f.obs.id), Array.from({ length: 9 }, (_, i) => String(i)));
      for (const url of calls.slice(1)) {
        assert.equal(url.searchParams.get("vmin"), "-0.5"); assert.equal(url.searchParams.get("vmax"), "12.5");
        assert.equal(url.searchParams.get("ra"), "210.4"); assert.equal(url.searchParams.get("size"), "300");
      }
      assert.ok(frames.every(f => f.wavelengthUm === 2.04));
    } finally { frames.forEach(f => URL.revokeObjectURL(f.url)); }
  } finally { globalThis.fetch = originalFetch; globalThis.Image = originalImage; }
});

test("an uncovered first frame is reported and the next frame establishes the shared scale", async () => {
  const originalFetch = globalThis.fetch, originalImage = globalThis.Image;
  globalThis.Image = FakeImage as unknown as typeof Image;
  const calls: URL[] = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input)); calls.push(url);
    if (url.pathname.includes("/missing/")) return Response.json({ error: { code: "NO_COVERAGE", message: "outside" } }, { status: 404 });
    return new Response(new Blob(["PNG"]), { headers: { "X-Stretch-Vmin": "0", "X-Stretch-Vmax": "10", "X-Wavelength-Um": "" } });
  };
  try {
    const result = await loadBlink([observation("missing"), observation("reference"), observation("last")], settings, new AbortController().signal, () => {});
    try {
      assert.deepEqual(result.frames.map(f => f.obs.id), ["reference", "last"]);
      assert.equal(result.failures[0].code, "NO_COVERAGE");
      assert.equal(calls[1].searchParams.has("vmin"), false);
      assert.equal(calls[2].searchParams.get("vmax"), "10");
      assert.equal(result.frames[0].wavelengthUm, null);
    } finally { result.frames.forEach(f => URL.revokeObjectURL(f.url)); }
  } finally { globalThis.fetch = originalFetch; globalThis.Image = originalImage; }
});

test("cancelling a batch aborts requests and releases previously loaded image URLs", async () => {
  const originalFetch = globalThis.fetch, originalImage = globalThis.Image, originalRevoke = URL.revokeObjectURL;
  globalThis.Image = FakeImage as unknown as typeof Image;
  const controller = new AbortController(); const revoked: string[] = [];
  URL.revokeObjectURL = url => { revoked.push(url); originalRevoke(url); };
  globalThis.fetch = async (input, init) => {
    if (String(input).includes("/first/")) return new Response(new Blob(["PNG"]), { headers: { "X-Stretch-Vmin": "0", "X-Stretch-Vmax": "10" } });
    return new Promise<Response>((_resolve, reject) => {
      const signal = init!.signal!;
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      queueMicrotask(() => controller.abort());
    });
  };
  try {
    await assert.rejects(loadBlink([observation("first"), observation("pending")], settings, controller.signal, () => {}));
    assert.equal(revoked.length, 1);
  } finally { globalThis.fetch = originalFetch; globalThis.Image = originalImage; URL.revokeObjectURL = originalRevoke; }
});

test("errors are presented according to API codes", () => {
  assert.match(errorMessage(new ApiFailure("UPSTREAM_ERROR", "technical")), /NASA/);
  assert.match(errorMessage(new ApiFailure("NOT_FOUND", "technical")), /Search again/);
  assert.equal(errorMessage(new ApiFailure("BAD_REQUEST", "Invalid RA")), "Invalid RA");
});

test("a temporary NASA archive failure (UPSTREAM_ERROR) is retried once automatically", async () => {
  const originalFetch = globalThis.fetch, originalImage = globalThis.Image;
  globalThis.Image = FakeImage as unknown as typeof Image;
  setUpstreamRetryDelay(1);
  const attempts = new Map<string, number>();
  globalThis.fetch = async input => {
    const id = new URL(String(input)).pathname.split("/")[3];
    const n = (attempts.get(id) ?? 0) + 1; attempts.set(id, n);
    const upstream = () => new Response(JSON.stringify({ error: { code: "UPSTREAM_ERROR", message: "IRSA" } }), { status: 502 });
    if (id === "flaky" && n === 1) return upstream();   // fails once, then works
    if (id === "down") return upstream();               // keeps failing
    return new Response(new Blob(["PNG"]), { headers: { "X-Stretch-Vmin": "0", "X-Stretch-Vmax": "1" } });
  };
  try {
    const { frames, failures } = await loadBlink([observation("flaky"), observation("ok"), observation("down")], settings, new AbortController().signal, () => {});
    try {
      assert.deepEqual(frames.map(f => f.obs.id), ["flaky", "ok"]);
      assert.deepEqual(failures.map(f => [f.observation.id, f.code]), [["down", "UPSTREAM_ERROR"]]);
      assert.equal(attempts.get("flaky"), 2); assert.equal(attempts.get("down"), 2); assert.equal(attempts.get("ok"), 1);
    } finally { frames.forEach(f => URL.revokeObjectURL(f.url)); }
  } finally { globalThis.fetch = originalFetch; globalThis.Image = originalImage; setUpstreamRetryDelay(2_000); }
});
