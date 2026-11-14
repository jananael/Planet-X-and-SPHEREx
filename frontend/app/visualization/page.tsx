import type { Metadata } from "next";
import { VisualizationPage } from "../../components/visualization-page";

export const metadata: Metadata = {
  title: "Visualization | SKYTRACE",
  description: "A real SPHEREx dashboard and a coordinate-centered sky map with Gaia DR3 stars and known solar-system objects, plus illustrative learning views.",
};

export default function Page() {
  return <VisualizationPage />;
}
