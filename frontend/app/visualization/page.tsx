import type { Metadata } from "next";
import { VisualizationWorkspace } from "../../components/visualization-workspace";

export const metadata: Metadata = {
  title: "Visualization | SKYTRACE",
  description: "Explore interactive, educational astronomical visualizations with clearly labeled illustrative data.",
};

export default function VisualizationPage() {
  return <VisualizationWorkspace />;
}
