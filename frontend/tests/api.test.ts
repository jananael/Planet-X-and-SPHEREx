import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiFailure, errorMessage, loadBlink } from "../lib/api.ts";
import type { Observation } from "../lib/types.ts";

const observation = (id: string): Observation => ({ id, target_id: null, obs_time: "2025-08-14T02:10:00Z", mjd: 60901, band: "D3", release: "QR2", source_file: `${id}.fits`, wavelength_um: null, image_url: `/api/observations/${id}/image` });
const settings = { ra: 210.4, dec: -11.85, size: 300, stretch: "asinh" as const };

test("blink loader reuses first-image limits, reads header wavelength, and limits concurrency", async () => {
  const originalFetch = globalThis.fetch;
  const originalImage = globalThis.Image;
  globalThis.Image = class { src = ""; async decode() {} } as unknown as typeof Image;
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
  globalThis.Image = class { src = ""; async decode() {} } as unknown as typeof Image;
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
  globalThis.Image = class { src = ""; async decode() {} } as unknown as typeof Image;
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
