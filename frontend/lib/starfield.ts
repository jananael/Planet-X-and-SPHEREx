export function starProximity(distance: number, radius: number): number {
  const t = Math.max(0, 1 - distance / radius);
  return t * t * (3 - 2 * t);
}

/** Frame-rate-independent easing: about 95% of a fade completes in 360 ms. */
export function fadeStar(current: number, target: number, elapsed: number): number {
  const next = current + (target - current) * (1 - Math.exp(-elapsed / 120));
  return Math.abs(next - target) < 0.002 ? target : next;
}
