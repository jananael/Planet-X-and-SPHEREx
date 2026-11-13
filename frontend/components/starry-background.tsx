"use client";

import { useEffect, useRef } from "react";
import { fadeStar, starProximity } from "../lib/starfield";

type Star = { u: number; v: number; radius: number; color: string; light: number };

/** Transparent, decorative viewport layer; page surfaces retain their own colors. */
export function StarryBackground({ topOnly = false }: { topOnly?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const surface = canvas.current;
    const context = surface?.getContext("2d", { alpha: true });
    if (!surface || !context) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const hover = window.matchMedia("(any-hover: hover) and (any-pointer: fine)");
    let width = 0, height = 0, frame = 0, previous = 0;
    let pointer: { x: number; y: number } | null = null;
    let stars: Star[] = [];
    let disposed = false;

    function paint(now: number) {
      frame = 0;
      const elapsed = previous ? Math.min(64, now - previous) : 16;
      previous = now;
      context!.clearRect(0, 0, width, height);
      let fading = false;
      const radius = Math.min(210, Math.max(140, width * .16));
      for (const star of stars) {
        context!.globalAlpha = 1;
        const x = star.u * width, y = star.v * height;
        const target = pointer ? starProximity(Math.hypot(x - pointer.x, y - pointer.y), radius) : 0;
        star.light = reduced.matches ? 0 : fadeStar(star.light, target, elapsed);
        if (star.light !== target && !reduced.matches) fading = true;
        if (star.light > .015) {
          const haloRadius = 7 + star.radius * 8;
          const glow = context!.createRadialGradient(x, y, 0, x, y, haloRadius);
          glow.addColorStop(0, `rgba(225,247,255,${star.light * .48})`);
          glow.addColorStop(.3, `rgba(137,219,244,${star.light * .24})`);
          glow.addColorStop(.65, `rgba(91,192,222,${star.light * .07})`);
          glow.addColorStop(1, "rgba(91,192,222,0)");
          context!.fillStyle = glow;
          context!.fillRect(x - haloRadius, y - haloRadius, haloRadius * 2, haloRadius * 2);
        }
        context!.globalAlpha = topOnly ? .6 + star.light * .4 : .58 + star.light * .42;
        context!.fillStyle = star.light > .02 ? star.color : "#d3e8f5";
        context!.beginPath();
        context!.arc(x, y, star.radius + star.light * .4, 0, Math.PI * 2);
        context!.fill();
      }
      context!.globalAlpha = 1;
      if (fading) requestPaint();
      else previous = 0; // No perpetual loop, twinkle, or motion at rest.
    }
    function requestPaint() {
      if (!disposed && !frame && !document.hidden) frame = requestAnimationFrame(paint);
    }
    function resize() {
      width = surface!.clientWidth;
      height = surface!.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      surface!.width = Math.round(width * dpr);
      surface!.height = Math.round(height * dpr);
      context!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.max(150, Math.min(950, Math.round(width * height / (topOnly ? 1800 : 2300))));
      // Retain normalized positions on resize; random sampling happens only here.
      stars = stars.slice(0, count);
      while (stars.length < count) {
        stars.push({ u: Math.random(), v: Math.random(), radius: (topOnly ? .7 : .65) + Math.random() ** 3 * 1.1,
          color: ["#ffffff", "#5bc0de", "#c6e7f4", "#f4d6b0"][Math.floor(Math.random() * 4)], light: 0 });
      }
      requestPaint();
    }
    function move(event: PointerEvent) {
      if (event.pointerType !== "mouse" || !hover.matches || reduced.matches) return;
      const bounds = surface!.getBoundingClientRect();
      pointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      requestPaint();
    }
    function leave() { pointer = null; requestPaint(); }
    function touch(event: PointerEvent) { if (event.pointerType !== "mouse") leave(); }
    function preferenceChange() {
      pointer = null;
      if (reduced.matches || !hover.matches) stars.forEach(star => { star.light = 0; });
      requestPaint();
    }
    function visibilityChange() {
      pointer = null;
      stars.forEach(star => { star.light = 0; });
      cancelAnimationFrame(frame);
      frame = 0;
      previous = 0;
      requestPaint();
    }
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", touch, { passive: true });
    window.addEventListener("blur", leave);
    if (topOnly) window.addEventListener("scroll", leave, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    document.addEventListener("visibilitychange", visibilityChange);
    reduced.addEventListener("change", preferenceChange);
    hover.addEventListener("change", preferenceChange);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("blur", leave);
      if (topOnly) window.removeEventListener("scroll", leave);
      document.documentElement.removeEventListener("pointerleave", leave);
      document.removeEventListener("visibilitychange", visibilityChange);
      reduced.removeEventListener("change", preferenceChange);
      hover.removeEventListener("change", preferenceChange);
    };
  }, [topOnly]);

  return <canvas ref={canvas} className={`starfield-canvas${topOnly ? " starfield-top" : ""}`} aria-hidden="true" />;
}
