export type VisualizationMode = "space" | "spectrum" | "image" | "bands" | "time";
export type DemoSource = {
  id: string;
  name: string;
  raDeg: number;
  decDeg: number;
  distanceLy: number;
  color: string;
  radius: number;
  description: string;
  note: string;
};

// Illustrative values only. This fixture is deliberately separate from archive records.
export const DEMO_DATA_NOTICE = "Illustrative Demo Data — Not Live NASA Data";
export const DEMO_SOURCES: DemoSource[] = [
  { id: "demo-a", name: "Amber Beacon", raDeg: 18.4, decDeg: 12.2, distanceLy: 18, color: "#ffd18b", radius: 1.1, description: "A simulated warm point of light used to explore the scene.", note: "Its position and brightness are illustrative, not an observed object." },
  { id: "demo-b", name: "Blue Lantern", raDeg: 42.8, decDeg: -8.5, distanceLy: 42, color: "#99caff", radius: 1.5, description: "A simulated blue-white source placed farther back in the view.", note: "The scene does not encode a measured distance or stellar classification." },
  { id: "demo-c", name: "Violet Cloud", raDeg: 68.1, decDeg: 24.3, distanceLy: 76, color: "#d1a1ff", radius: 2.2, description: "A decorative nebula-like object for learning the 3D controls.", note: "It is not a SPHEREx detection or a scientifically modeled nebula." },
  { id: "demo-d", name: "Coral World", raDeg: 91.6, decDeg: -21.8, distanceLy: 108, color: "#ff9d91", radius: 2.8, description: "A simulated sphere that helps show depth and lighting.", note: "Its size, color, and location are chosen for the demo." },
  { id: "demo-e", name: "Quiet Point", raDeg: 126.2, decDeg: 4.1, distanceLy: 145, color: "#c4f2db", radius: 1.2, description: "A small illustrative point at the edge of this scene.", note: "No physical distance or object identity is implied." },
];

export const DEMO_SPECTRUM = [
  { wavelengthUm: 0.8, flux: 3.2, uncertainty: 0.5 }, { wavelengthUm: 1.1, flux: 4.1, uncertainty: 0.45 },
  { wavelengthUm: 1.5, flux: 6.2, uncertainty: 0.55 }, { wavelengthUm: 2.0, flux: 8.3, uncertainty: 0.65 },
  { wavelengthUm: 2.7, flux: 7.5, uncertainty: 0.6 }, { wavelengthUm: 3.5, flux: 5.1, uncertainty: 0.5 },
  { wavelengthUm: 4.5, flux: 4.4, uncertainty: 0.55 },
];

export const DEMO_OBSERVATIONS = [
  { id: "demo-obs-1", time: "Illustrative epoch 1", band: "D2 · 1.5 μm", value: 4.2, tone: "#79baff" },
  { id: "demo-obs-2", time: "Illustrative epoch 2", band: "D3 · 2.1 μm", value: 6.1, tone: "#c78cff" },
  { id: "demo-obs-3", time: "Illustrative epoch 3", band: "D4 · 2.8 μm", value: 5.3, tone: "#ffbd77" },
];

export const DEMO_IMAGE_PIXELS: number[][] = Array.from({ length: 48 }, (_, y) => Array.from({ length: 48 }, (_, x) => {
  const dx = x - 23.4; const dy = y - 24.8; const source = 28 * Math.exp(-(dx * dx + dy * dy) / 20);
  const texture = ((x * 37 + y * 19 + x * y * 3) % 17) / 17;
  return Number((1.5 + texture * 2 + source).toFixed(2));
}));

export const MODE_EXPLANATIONS: Record<VisualizationMode, { title: string; what: string; unit: string; use: string; conclude: string; not: string }> = {
  space: { title: "A navigable 3D illustration", what: "Colored spheres are simulated objects positioned in a small 3D scene.", unit: "Scene units; not physical distance units.", use: "Depth and camera movement help explain how a 3D view differs from a flat sky map.", conclude: "You can explore how perspective and layers change the view.", not: "This is not an observed star field, scale model, or NASA data product." },
  spectrum: { title: "Brightness across wavelength", what: "Points show illustrative flux measurements at several infrared wavelengths.", unit: "Wavelength: micrometers (μm). Flux: illustrative arbitrary units.", use: "A spectrum shows how measured brightness can vary with wavelength.", conclude: "The example curve rises and falls across its sampled wavelengths.", not: "Do not interpret the values as calibrated SPHEREx flux or a real object's spectrum." },
  image: { title: "An illustrative detector image", what: "Pixel colors are generated from a fixed demo matrix with a bright center and background texture.", unit: "Pixel value: illustrative arbitrary units.", use: "Image stretches change how bright and faint pixels are displayed.", conclude: "You can see how a display stretch reveals different contrast.", not: "The image is not a FITS file and pixel values are not measurements." },
  bands: { title: "Comparing wavelength bands", what: "Each panel represents a different illustrative infrared band and brightness value.", unit: "Band labels and arbitrary brightness units.", use: "Comparisons across bands can reveal color and spectral differences when measurements are available.", conclude: "The demo values differ between its three bands.", not: "The panels are not real exposures and do not imply a source changed." },
  time: { title: "Comparing observation times", what: "The timeline orders three illustrative snapshots with their demo band labels.", unit: "Illustrative order; no UTC timestamps are supplied.", use: "Real observation timestamps help compare what an instrument recorded at separate times.", conclude: "This only demonstrates timeline navigation.", not: "There is no measured time evolution or motion in this demo." },
};
