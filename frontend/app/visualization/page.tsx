import type { Metadata } from "next";
import { VisualizationPage } from "../../components/visualization-page";

export const metadata: Metadata = {
  title: "Visualization | SKYTRACE",
  description: "A dashboard of the real NASA SPHEREx data for a sky location, plus an interactive learning lab with clearly labeled illustrative data.",
};

export default function Page() {
  return <VisualizationPage />;
}
