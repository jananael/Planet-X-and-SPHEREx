import { test } from "node:test";
import assert from "node:assert/strict";
import { fadeStar, starProximity } from "../lib/starfield.ts";

test("cursor proximity is strongest at the center and smoothly reaches zero at the boundary", () => {
  assert.equal(starProximity(0, 150), 1);
  assert.equal(starProximity(150, 150), 0);
  assert.equal(starProximity(250, 150), 0);
  assert.ok(starProximity(30, 150) > starProximity(90, 150));
  assert.ok(starProximity(149, 150) < .001);
});

test("star fades are smooth, reversible, and independent of frame rate", () => {
  const fade = (from: number, target: number, step: number, duration: number) => {
    let value = from;
    for (let elapsed = 0; elapsed < duration; elapsed += step) value = fadeStar(value, target, step);
    return value;
  };
  assert.ok(fadeStar(0, 1, 16) > 0 && fadeStar(0, 1, 16) < .2);
  assert.ok(fade(0, 1, 16, 368) > .95);
  assert.ok(fade(1, 0, 16, 368) < .05);
  assert.ok(Math.abs(fade(0, 1, 8, 320) - fade(0, 1, 16, 320)) < .00001);
  assert.equal(fade(1, 0, 16, 1000), 0);
  assert.equal(fadeStar(0, 0, 16), 0);
});
