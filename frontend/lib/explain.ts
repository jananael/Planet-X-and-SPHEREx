import { spectralMismatch } from "./observations.ts";
// "Explain it simply": turns the facts from /api/explain into short scenes played over the REAL frames.
// Every number in a caption comes from the facts; nothing is invented. Text is plain English for
// students with no astronomy background. Wording to be reviewed by the science team (Yazan).

export type StoryKind = "moves" | "creeps" | "brightness" | "no_known_object";

export interface ExplainFrameFacts {
  observation_id: string; obs_time: string; band: string; release: string;
  x: number | null; y: number | null; inside: boolean;
}
export interface ExplainFacts {
  kind: StoryKind;
  object: { id: string; name: string; type: string; description: string; validation_status: string; position_source: string } | null;
  frames: ExplainFrameFacts[];
  image_size_arcsec: number; pixel_scale_arcsec: number;
  elapsed_hours: number | null; displacement_arcsec: number | null; displacement_pixels: number | null;
  direction: string | null; notes: string[]; is_mock: boolean;
}
export interface Scene {
  /** Index into the facts' frames (same order as the frames shown). */
  frame: number;
  caption: string;
  /** Draw a circle where the object is predicted in this frame. */
  circle: boolean;
  /** Also draw faded circles at its earlier predicted positions (a trail). */
  trail: boolean;
  ms: number;
}

const TYPE_WORDS: Record<string, string> = {
  asteroid: "an asteroid, a rocky body orbiting the Sun",
  comet: "a comet, an icy body travelling through the Solar System",
  star: "a star, far beyond our Solar System",
  brown_dwarf: "a brown dwarf, a cold object between a planet and a star",
  variable: "a star whose brightness changes over time",
};

export function formatDuration(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} minutes`;
  if (hours < 48) { const h = Math.round(hours * 10) / 10; return `${h} hour${h === 1 ? "" : "s"}`; }
  const days = hours / 24;
  if (days < 60) return `${Math.round(days)} days`;
  const months = Math.round(days / 30.44);
  return months < 18 ? `${months} months` : `${(days / 365.25).toFixed(1)} years`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function buildScenes(facts: ExplainFacts): Scene[] {
  const n = facts.frames.length;
  if (!n) return [];
  const last = n - 1;
  const name = facts.object?.name ?? "this patch of sky";
  const scenes: Scene[] = [];
  const add = (frame: number, caption: string, circle = false, trail = false, ms = 4500) =>
    scenes.push({ frame, caption, circle, trail, ms });

  add(0, `These are real pictures taken by NASA's SPHEREx space telescope, which maps the whole sky in infrared light. ` +
    `Each picture covers a small square of sky about ${Math.round(facts.image_size_arcsec / 60 * 10) / 10} arcminutes wide.`);

  if (facts.kind === "no_known_object" || !facts.object) {
    add(0, `We have ${plural(n, "picture")} of this spot${facts.elapsed_hours ? `, taken over ${formatDuration(facts.elapsed_hours)}` : ""}. ` +
      `Each bright dot is a star or a distant galaxy.`);
    if (n > 1) add(last, "Flip between the pictures: if a dot jumps or changes brightness, something changed. Most dots stay exactly where they are.");
    add(last, "No known object is expected here, so we cannot say what a change would be. Scientists would check many more pictures first.");
    return scenes;
  }

  const kindWords = TYPE_WORDS[facts.object.type] ?? facts.object.type;
  add(0, `In this picture is ${name}: ${kindWords}. The circle shows where it is expected to be.`, true);

  if (facts.kind === "brightness") {
    if (n > 1) add(last, `${facts.elapsed_hours ? `${formatDuration(facts.elapsed_hours)} later` : "Later"}, it is in the same place, ` +
      "but look at its glow: its brightness has changed.", true);
    add(last, "It does not move: it changes how much light it gives. Some stars swell and shrink like a slow heartbeat.", true);
  } else if (facts.kind === "moves" && n > 1) {
    const px = facts.displacement_pixels ?? 0;
    add(last, `${facts.elapsed_hours ? `${formatDuration(facts.elapsed_hours)} later` : "Later"}, ${name} has moved ` +
      `${facts.direction ? `towards the ${facts.direction} ` : ""}by about ${plural(Math.round(px), "pixel")} ` +
      `(${Math.round(facts.displacement_arcsec ?? 0)} arcseconds), while the stars behind it stayed still.`, true, true, 5500);
    add(last, facts.object.type === "asteroid" || facts.object.type === "comet"
      ? "Objects inside our Solar System are close, so they visibly move in hours. Far-away stars barely move in a lifetime."
      : "Even a star can drift across the sky, but only because it is one of our nearest neighbours.", true, true);
  } else if (n > 1) {
    const px = facts.displacement_pixels ?? 0;
    add(last, `${facts.elapsed_hours ? `${formatDuration(facts.elapsed_hours)} later` : "Later"}, ${name} has crept ` +
      `${facts.direction ? `${facts.direction} ` : ""}by only ${px < 1 ? "a fraction of a pixel" : `about ${plural(Math.round(px * 10) / 10, "pixel")}`}. ` +
      "Can you see it? Almost not.", true, true, 5500);
    add(last, "Movements this small are hidden in a simple flip. Scientists subtract one picture from another to reveal them.", true);
  }

  add(last, "This is not a discovery: we are looking at a known object. To claim something new, scientists need many pictures, " +
    "careful checks and confirmation from other telescopes.");
  return scenes;
}

export function explainUrl(ra: number, dec: number, size: number, ids: string[]): string {
  const q = new URLSearchParams({ ra: String(ra), dec: String(dec), size: String(size), ids: ids.join(",") });
  return `/api/explain?${q}`;
}

export interface SummaryLine { label: string; text: string }
const fmtDate = (iso: string) => new Date(iso).toISOString().replace("T", " ").slice(0, 16) + " UTC";

/**
 * Always-visible plain-language summary under the images: what, when, which light, and what changed.
 * Same rule as the scenes: every number comes from the facts or the loaded frames; no change is claimed
 * for an unknown patch (nothing is measured there yet) and nothing is called a discovery.
 */
export function summarize(facts: ExplainFacts | null, frames: { obs: { obs_time: string; band: string }; wavelengthUm: number | null; bandwidthUm?: number | null }[]): SummaryLine[] {
  if (!frames.length) return [];
  const n = frames.length, name = facts?.object?.name ?? null;
  const times = frames.map(f => f.obs.obs_time).sort();
  const hours = (Date.parse(times[n - 1]) - Date.parse(times[0])) / 3.6e6;
  const lines: SummaryLine[] = [];
  lines.push({ label: "What", text: `${plural(n, "real picture")} from NASA's SPHEREx space telescope of ${name ? `${name}, ${TYPE_WORDS[facts!.object!.type] ?? facts!.object!.type}` : "this patch of sky"}. Same place, same brightness scale, north up.` });
  lines.push({ label: "When", text: n === 1 ? `Taken on ${fmtDate(times[0])}.` : `From ${fmtDate(times[0])} to ${fmtDate(times[n - 1])}: ${formatDuration(Math.max(hours, 1 / 60))} apart.` });
  const wl = frames.map(f => f.wavelengthUm).filter((w): w is number => w !== null);
  const bands = [...new Set(frames.map(f => f.obs.band))].join(", ");
  if (wl.length) {
    const lo = Math.min(...wl), hi = Math.max(...wl);
    lines.push({ label: "Light", text: `Infrared, ${hi - lo < 0.01 ? `${lo.toFixed(2)}` : `${lo.toFixed(2)}–${hi.toFixed(2)}`} micrometres (detector ${bands}). Our eyes only see up to about 0.7.${
      spectralMismatch(frames.map(f => ({ wavelengthUm: f.wavelengthUm, bandwidthUm: f.bandwidthUm ?? null })))
        ? " Careful: these pictures were taken in different infrared colours, so a brightness difference can come from that, not from a real change." : ""}` });
  }
  let change: string;
  if (n < 2) change = "Only one picture: choose at least two moments to compare.";
  else if (!facts || facts.kind === "no_known_object" || !facts.object)
    change = "No known moving or changing object is expected here, and SKYTRACE does not measure changes automatically yet. Play the pictures or use Difference: what stayed the same disappears, anything that changed remains.";
  else if (facts.kind === "brightness")
    change = `${name} stays in the same place; what changes is its brightness. Compare the size of its glow between pictures.`;
  else if (facts.kind === "moves")
    change = `${name} moved about ${plural(Math.round(facts.displacement_pixels ?? 0), "pixel")} (${Math.round(facts.displacement_arcsec ?? 0)}″)${facts.direction ? ` towards the ${facts.direction}` : ""} in ${formatDuration(facts.elapsed_hours ?? hours)}, while the stars stayed still. This matches its known path (${facts.object.position_source}).`;
  else {
    const px = facts.displacement_pixels ?? 0;
    change = `${name} moved only ${px < 1 ? "a fraction of a pixel" : `about ${plural(Math.round(px * 10) / 10, "pixel")}`} (${(facts.displacement_arcsec ?? 0).toFixed(1)}″) in ${formatDuration(facts.elapsed_hours ?? hours)}: too small to see in a flip. Turn on Difference to reveal it.`;
  }
  lines.push({ label: "Change", text: change });
  lines.push({ label: "Remember", text: facts?.object ? "This is a known object, not a discovery." : "A change seen here is a clue, not a discovery: it needs more pictures and checks." });
  return lines;
}
