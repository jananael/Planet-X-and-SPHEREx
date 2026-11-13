import type { BlinkFrame, FrameFailure, ImageSettings, Observation } from "./types.ts";

export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");
export class ApiFailure extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}
export function errorMessage(error: unknown): string {
  if (error instanceof ApiFailure) {
    switch (error.code) {
      case "BAD_REQUEST": return error.message;
      case "NOT_FOUND": return "This observation is no longer available. Search again.";
      case "NO_COVERAGE": return "This image does not cover the selected position.";
      case "UPSTREAM_ERROR": return "NASA’s archive is slow or unavailable. Please retry.";
      case "NOT_IMPLEMENTED": return "This feature is unavailable for the current data source.";
      case "TIMEOUT": return "The request took too long. Please retry.";
      case "INVALID_IMAGE": return "The image response could not be read. Please retry.";
      default: return "Something went wrong while loading data. Please retry.";
    }
  }
  return "Cannot reach the backend. Check that it is running on port 8000, then retry.";
}

async function request(path: string, signal: AbortSignal, timeout = 60_000): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  if (signal.aborted) abort();
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(new ApiFailure("TIMEOUT", "Request timed out")), timeout);
  try {
    const res = await fetch(`${API_BASE}${path}`, { signal: controller.signal });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new ApiFailure(body?.error?.code ?? "INTERNAL_ERROR", body?.error?.message ?? "Request failed");
    }
    // Consume the body within the timeout, not just the response headers.
    const blob = await res.blob();
    return new Response(blob, { status: res.status, headers: res.headers });
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    throw error;
  } finally { clearTimeout(timer); signal.removeEventListener("abort", abort); }
}

export async function getJson<T>(path: string, signal: AbortSignal): Promise<T> {
  return (await request(path, signal)).json() as Promise<T>;
}

export async function loadFrame(obs: Observation, settings: ImageSettings, signal: AbortSignal, limits?: { vmin: number; vmax: number }): Promise<BlinkFrame> {
  const q = new URLSearchParams({ ra: String(settings.ra), dec: String(settings.dec), size: String(settings.size), stretch: settings.stretch });
  if (limits) { q.set("vmin", String(limits.vmin)); q.set("vmax", String(limits.vmax)); }
  // Real archive images can take 5–30 s, and the backend retries IRSA for up to ~170 s.
  const res = await request(`${obs.image_url}?${q}`, signal, IMAGE_TIMEOUT_MS);
  const min = res.headers.get("X-Stretch-Vmin"), max = res.headers.get("X-Stretch-Vmax");
  const vmin = Number(min), vmax = Number(max);
  if (!min || !max || !Number.isFinite(vmin) || !Number.isFinite(vmax) || vmax <= vmin) throw new ApiFailure("INVALID_IMAGE", "Missing brightness limits");
  const wl = res.headers.get("X-Wavelength-Um");
  const wavelengthUm = wl?.trim() && Number.isFinite(Number(wl)) ? Number(wl) : null;
  const bw = res.headers.get("X-Bandwidth-Um");
  const bandwidthUm = bw?.trim() && Number(bw) > 0 ? Number(bw) : null;
  // Cosmic-ray (TRANSIENT) pixels are not repaired by the backend; we only warn about them.
  const transientPixels = Math.max(0, Number(res.headers.get("X-Transient-Pixels")) || 0);
  const url = URL.createObjectURL(await res.blob());
  try {
    await waitForImage(url, signal);
    signal.throwIfAborted();
    return { obs, url, wavelengthUm, bandwidthUm, vmin, vmax, transientPixels };
  } catch (error) { URL.revokeObjectURL(url); throw error; }
}

// Wait for the browser to load the PNG. Uses the load event, not img.decode(): decode() can stay
// pending while the tab is hidden (no rendering), which froze loading until the user came back.
export function waitForImage(url: string, signal: AbortSignal, timeout = 15_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const done = (error?: unknown) => {
      clearTimeout(timer); signal.removeEventListener("abort", onAbort);
      img.onload = img.onerror = null;
      if (error) reject(error); else resolve();
    };
    const onAbort = () => done(signal.reason);
    const timer = setTimeout(() => done(new ApiFailure("INVALID_IMAGE", "Image took too long to load")), timeout);
    signal.addEventListener("abort", onAbort, { once: true });
    img.onload = () => done();
    img.onerror = () => done(new ApiFailure("INVALID_IMAGE", "Image could not be read"));
    img.src = url;
  });
}

export const IMAGE_TIMEOUT_MS = 180_000;
export let UPSTREAM_RETRY_DELAY_MS = 2_000;
export function setUpstreamRetryDelay(ms: number) { UPSTREAM_RETRY_DELAY_MS = ms; } // for tests

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); reject(signal.reason); };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

// Establish brightness limits with the first successful image, then use three workers.
export async function loadBlink(list: Observation[], settings: ImageSettings, signal: AbortSignal, progress: (ready: number, completed: number) => void) {
  const frames = new Map<string, BlinkFrame>();
  const failures: FrameFailure[] = [];
  let completed = 0, cursor = 0;
  let reference: BlinkFrame | undefined;
  async function load(obs: Observation, limits?: BlinkFrame) {
    try {
      let frame: BlinkFrame;
      try { frame = await loadFrame(obs, settings, signal, limits); }
      catch (error) {
        // NASA's archive fails now and then and works a moment later: retry those once by ourselves.
        if (signal.aborted || !(error instanceof ApiFailure) || error.code !== "UPSTREAM_ERROR") throw error;
        await sleep(UPSTREAM_RETRY_DELAY_MS, signal);
        frame = await loadFrame(obs, settings, signal, limits);
      }
      frames.set(obs.id, frame); return frame;
    } catch (error) {
      if (signal.aborted) throw error;
      failures.push({ observation: obs, message: errorMessage(error), code: error instanceof ApiFailure ? error.code : "NETWORK" });
    } finally { completed++; if (!signal.aborted) progress(frames.size, completed); }
  }
  try {
    while (cursor < list.length && !reference) reference = await load(list[cursor++]);
    if (reference) {
      const worker = async () => { while (cursor < list.length) { signal.throwIfAborted(); const obs = list[cursor++]; await load(obs, reference); } };
      const outcomes = await Promise.allSettled(Array.from({ length: Math.min(3, list.length - cursor) }, worker));
      signal.throwIfAborted();
      const rejected = outcomes.find(r => r.status === "rejected");
      if (rejected?.status === "rejected") throw rejected.reason;
    }
    signal.throwIfAborted();
    return { frames: list.flatMap(o => frames.has(o.id) ? [frames.get(o.id)!] : []), failures };
  } catch (error) { for (const frame of frames.values()) URL.revokeObjectURL(frame.url); throw error; }
}
