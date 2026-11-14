import type { Metadata } from "next";
import { VisualizationPage } from "../../components/visualization-page";

export const metadata: Metadata = {
  title: "Visualization | SKYTRACE",
  description: "A learning lab on real data for any sky location: Gaia stars in 3D, SPHEREx colours, images, detectors and visits.",
};

export default function Page() {
  return <VisualizationPage />;
}
