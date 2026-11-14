// Export the current blink as an animated GIF (client-side, gifenc / MIT).
// Every frame carries its own date, band, wavelength and the data credit, so the GIF stays
// honest when it is shared on its own.
import { GIFEncoder, applyPalette, quantize } from "gifenc";
import type { BlinkFrame } from "./types";
import { dataSourceLabel, formatUtc } from "./scientific-format";

const SCALE = 2;          // nearest-neighbour upscale: keeps SPHEREx pixels crisp
const CAPTION = 64;       // px strip under the image

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img); img.onerror = () => reject(new Error("Frame could not be read"));
    img.src = src;
  });
}

const utc = formatUtc;

export async function makeBlinkGif(frames: BlinkFrame[], { delayMs, synthetic, dataSource }: { delayMs: number; synthetic: boolean; dataSource?: string | null }): Promise<Blob> {
  if (frames.length < 2) throw new Error("Need at least two frames");
  const images = await Promise.all(frames.map(f => loadImage(f.url)));
  const w = images[0].naturalWidth * SCALE, imageH = images[0].naturalHeight * SCALE, h = imageH + CAPTION;
  const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas not available");
  const font = (size: number, weight = 400) => `${weight} ${size}px 'DM Sans', Arial, sans-serif`;
  const gif = GIFEncoder();

  images.forEach((img, i) => {
    const f = frames[i];
    ctx.fillStyle = "#03040a"; ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, w, imageH);
    // crosshair + counter, like the viewer
    ctx.strokeStyle = "rgba(211,161,255,.75)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(w / 2 - 12, imageH / 2); ctx.lineTo(w / 2 + 12, imageH / 2);
    ctx.moveTo(w / 2, imageH / 2 - 12); ctx.lineTo(w / 2, imageH / 2 + 12); ctx.stroke();
    ctx.fillStyle = "rgba(8,8,19,.8)"; ctx.fillRect(w - 58, 10, 48, 22);
    ctx.fillStyle = "#e3d6ef"; ctx.font = font(12, 500); ctx.textAlign = "center";
    ctx.fillText(`${i + 1} / ${frames.length}`, w - 34, 26);
    // caption: what this frame is, and where it comes from
    ctx.textAlign = "left";
    ctx.fillStyle = "#f3f2fb"; ctx.font = font(15, 500);
    const wl = f.wavelengthUm === null ? "" : ` · ${f.wavelengthUm.toFixed(3)} µm`;
    ctx.fillText(`${utc(f.obs.obs_time)} · ${f.obs.band}${wl}`, 14, imageH + 26);
    ctx.fillStyle = "#c27af3"; ctx.font = font(12);
    ctx.fillText(`SKYTRACE · ${dataSourceLabel(synthetic ? "mock" : dataSource)}`, 14, imageH + 48);

    const { data } = ctx.getImageData(0, 0, w, h);
    const palette = quantize(data, 256);
    gif.writeFrame(applyPalette(data, palette), w, h, { palette, delay: delayMs, ...(i === 0 ? { repeat: 0 } : {}) });
  });
  gif.finish();
  return new Blob([gif.bytes() as Uint8Array<ArrayBuffer>], { type: "image/gif" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
