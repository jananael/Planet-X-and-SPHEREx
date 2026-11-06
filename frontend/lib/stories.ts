// Guided stories for the Explorer. Each one picks a demo target, loads its frames, plays the
// blink and walks the viewer through what to look at. Wording to be reviewed by the science
// team (Yazan): keep it accurate and never claim a discovery.

export interface StoryStep {
  text: string;
  /** Turn Difference mode on for this step (moving/changing things stand out, still stars vanish). */
  difference?: boolean;
}

export interface Story {
  id: string;
  targetId: string;
  kicker: string;
  title: string;
  summary: string;
  steps: StoryStep[];
}

export const PIXEL_ARCSEC = 6.15; // SPHEREx pixel size

export const STORIES: Story[] = [
  {
    id: "moved",
    targetId: "vesta",
    kicker: "STORY 1 · MOTION",
    title: "Something moved",
    summary: "An asteroid crossing the stars within a few hours.",
    steps: [
      { text: "These are SPHEREx images of the same patch of sky, taken about 95 minutes apart. Every frame is aligned north-up and shown on the same brightness scale." },
      { text: "Watch the bright dot at the crosshair. The background stars stay put, but this one jumps from frame to frame: it is (4) Vesta, an asteroid orbiting the Sun." },
      { text: "Difference mode subtracts the first frame. Everything that stayed still disappears; what moved shows up as a light and dark pair.", difference: true },
      { text: "Asteroids move across the sky in hours. That is the signature SPHEREx's repeated visits let anyone spot." },
    ],
  },
  {
    id: "changed",
    targetId: "mira",
    kicker: "STORY 2 · BRIGHTNESS",
    title: "Something changed",
    summary: "A star that stays in place while its light swells and fades.",
    steps: [
      { text: "Mira is a pulsating red giant whose brightness rises and falls over about 11 months. These frames come from SPHEREx visits months apart." },
      { text: "Watch the star at the crosshair: it never moves, but its bright glow swells and shrinks from visit to visit. Here the change is brightness, not position." },
      { text: "Mira is so bright that its centre saturates the detector (pure white) in every frame, so judge the size of the glow, not the centre. All frames share one brightness scale; stretched one by one, the change would be hidden." },
      { text: "Check the wavelength under each frame: SPHEREx sees different infrared colours across its detector, so a fair comparison needs similar wavelengths." },
    ],
  },
  {
    id: "still",
    targetId: "barnards-star",
    kicker: "STORY 3 · LIMITS",
    title: "Smaller than a pixel",
    summary: "The fastest-moving star: invisible in a blink, revealed by subtraction.",
    steps: [
      { text: "Barnard's Star has the largest proper motion of any star: about 10.3 arcseconds per year, almost due north." },
      { text: `Between six-month visits it moves about 5″. One SPHEREx pixel covers ${PIXEL_ARCSEC}″, so the shift is smaller than a single pixel and in a plain blink the star seems to stand still.` },
      { text: "Now each frame has the first one subtracted. A light patch appears just north (up) of the crosshair and a dark one just south: the star has crept north by less than one pixel, matching its known motion. The later the visit, the stronger the pair.", difference: true },
      { text: "A distant Planet X would be very faint and would creep across the sky over months, not hours like an asteroid. Finding one takes many observations, careful comparison like this, and follow-up, not a single blink." },
    ],
  },
];

export function storyById(id: string): Story | undefined {
  return STORIES.find(s => s.id === id);
}
