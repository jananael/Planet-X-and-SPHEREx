import type { Metadata } from "next";
import { Explorer } from "../../components/explorer";

export const metadata: Metadata = {
  title: "Explorer | SKYTRACE",
  description: "Explore SPHEREx observations across time. Compare motion and brightness in the infrared sky.",
};

export default function ExplorePage() { return <Explorer />; }
