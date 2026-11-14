import type { Metadata } from "next";
import { VisualizationPage } from "../../components/visualization-page";

export const metadata: Metadata = {
  title: "Visualization | SKYTRACE",
  description: "An interactive learning lab for astronomical visualizations, with clearly labeled illustrative data.",
};

export default function Page() {
  return <VisualizationPage />;
}
