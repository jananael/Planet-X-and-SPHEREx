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
  const res = await request(`${obs.image_url}?${q}`, signal);
  const min = res.headers.get("X-Stretch-Vmin"), max = res.headers.get("X-Stretch-Vmax");
  const vmin = Number(min), vmax = Number(max);
  if (!min || !max || !Number.isFinite(vmin) || !Number.isFinite(vmax) || vmax <= vmin) throw new ApiFailure("INVALID_IMAGE", "Missing brightness limits");
  const wl = res.headers.get("X-Wavelength-Um");
  const wavelengthUm = wl?.trim() && Number.isFinite(Number(wl)) ? Number(wl) : null;
  const url = URL.createObjectURL(await res.blob());
  try {
    const img = new Image(); img.src = url; await img.decode();
    signal.throwIfAborted();
    return { obs, url, wavelengthUm, vmin, vmax };
  } catch (error) { URL.revokeObjectURL(url); throw error; }
}

// Establish brightness limits with the first successful image, then use three workers.
export async function loadBlink(list: Observation[], settings: ImageSettings, signal: AbortSignal, progress: (ready: number, completed: number) => void) {
  const frames = new Map<string, BlinkFrame>();
  const failures: FrameFailure[] = [];
  let completed = 0, cursor = 0;
  let reference: BlinkFrame | undefined;
  async function load(obs: Observation, limits?: BlinkFrame) {
    try {
      const frame = await loadFrame(obs, settings, signal, limits);
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
