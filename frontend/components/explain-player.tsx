"use client";
// "Explain it simply" player: plays short scenes over the REAL frames already loaded in the viewer.
// The images are never redrawn or invented; we only add a circle at the predicted position and a caption.
import { useEffect, useMemo, useRef, useState } from "react";
import { buildScenes, type ExplainFacts } from "../lib/explain";
import "./explain-player.css";
import type { BlinkFrame } from "../lib/types";

const SIZE = 520; // canvas pixels (CSS scales it)

export function ExplainPlayer({ frames, facts, onClose }: { frames: BlinkFrame[]; facts: ExplainFacts; onClose: () => void }) {
  const scenes = useMemo(() => buildScenes(facts), [facts]);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const canvas = useRef<HTMLCanvasElement>(null);
  const images = useRef<Map<string, HTMLImageElement>>(new Map());
  const [loaded, setLoaded] = useState(0);
  const byId = useMemo(() => new Map(frames.map(f => [f.obs.id, f])), [frames]);
  const scene = scenes[Math.min(step, scenes.length - 1)];
  const done = step >= scenes.length - 1;

  // Load the frame images once (they are blob URLs already in memory).
  useEffect(() => {
    for (const f of frames) {
      if (images.current.has(f.obs.id)) continue;
      const img = new Image();
      img.onload = () => setLoaded(n => n + 1);
      img.src = f.url;
      images.current.set(f.obs.id, img);
    }
  }, [frames]);

  // Auto-advance.
  useEffect(() => {
    if (!playing || !scene || done) return;
    const timer = setTimeout(() => setStep(s => s + 1), scene.ms);
    return () => clearTimeout(timer);
  }, [playing, scene, done]);

  // Draw the current scene.
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx || !scene) return;
    const facts_frame = facts.frames[scene.frame];
    const img = facts_frame && images.current.get(facts_frame.observation_id);
    ctx.fillStyle = "#03040a"; ctx.fillRect(0, 0, SIZE, SIZE);
    if (img?.complete && img.naturalWidth) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, SIZE, SIZE);
    }
    const circleAt = (x: number, y: number, alpha: number, dashed: boolean) => {
      ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = "#ffd166"; ctx.lineWidth = 3;
      if (dashed) ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.arc(x * SIZE, y * SIZE, SIZE * 0.06, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    };
    if (scene.trail) {
      for (const f of facts.frames.slice(0, scene.frame)) if (f.inside && f.x !== null && f.y !== null) circleAt(f.x, f.y, 0.45, true);
    }
    if (scene.circle && facts_frame?.inside && facts_frame.x !== null && facts_frame.y !== null) circleAt(facts_frame.x, facts_frame.y, 1, false);
    // Time stamp of the frame, bottom-left, always visible.
    if (facts_frame) {
      ctx.fillStyle = "#03040acc"; ctx.fillRect(8, SIZE - 34, 250, 26);
      ctx.fillStyle = "#f3f2fb"; ctx.font = "14px 'DM Sans', Arial, sans-serif";
      ctx.fillText(`${facts_frame.obs_time.replace("T", " ").slice(0, 16)} UTC · ${facts_frame.band} · ${facts_frame.release}`, 16, SIZE - 16);
    }
  }, [scene, facts, loaded, byId]);

  if (!scenes.length) return null;
  return (
    <section className="explain-player" aria-label="Simple explanation of these images">
      <div className="explain-badge">{facts.is_mock ? "Synthetic demo images · simplified explanation" : "Real SPHEREx images · simplified explanation"}</div>
      <canvas ref={canvas} width={SIZE} height={SIZE} className="explain-canvas" role="img"
        aria-label={`Frame ${scene.frame + 1} of ${facts.frames.length}${scene.circle && facts.object ? `, circle on ${facts.object.name}` : ""}`} />
      <p className="explain-caption" aria-live="polite">{scene.caption}</p>
      <div className="explain-controls">
        <button type="button" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0} aria-label="Previous scene">◀</button>
        <button type="button" onClick={() => { if (done) { setStep(0); setPlaying(true); } else setPlaying(p => !p); }}>
          {done ? "Replay" : playing ? "Pause" : "Play"}
        </button>
        <button type="button" onClick={() => setStep(s => Math.min(scenes.length - 1, s + 1))} disabled={done} aria-label="Next scene">▶</button>
        <span className="explain-progress">{Math.min(step + 1, scenes.length)} / {scenes.length}</span>
        <button type="button" className="explain-close" onClick={onClose}>Back to scientific view</button>
      </div>
      <details className="explain-notes">
        <summary>What this explanation can and cannot tell you</summary>
        <ul>{facts.notes.map(note => <li key={note}>{note}</li>)}</ul>
        {facts.object && <p>Positions: {facts.object.position_source}.</p>}
      </details>
    </section>
  );
}
