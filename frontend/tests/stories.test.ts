import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STORIES, storyById } from "../lib/stories.ts";

const targets: { id: string }[] = JSON.parse(
  readFileSync(new URL("../../backend/app/mock_data/targets.v0.json", import.meta.url), "utf-8"),
).targets;

test("every story points at a real demo target and has steps", () => {
  const ids = new Set(targets.map(t => t.id));
  assert.equal(new Set(STORIES.map(s => s.id)).size, STORIES.length, "story ids are unique");
  for (const story of STORIES) {
    assert.ok(ids.has(story.targetId), `${story.id}: unknown target ${story.targetId}`);
    assert.ok(story.steps.length >= 2, `${story.id}: needs at least two steps`);
    assert.equal(storyById(story.id), story);
  }
});

test("story text never claims a discovery", () => {
  for (const story of STORIES) {
    for (const step of story.steps) {
      assert.doesNotMatch(step.text, /\b(we|you) (found|discovered)\b|discovered planet x|planet x (found|detected)/i, `${story.id}: ${step.text}`);
    }
  }
});
