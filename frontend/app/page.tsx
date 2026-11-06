import type { Metadata } from "next";
import { HomePage } from "../components/home-page";
import "./home.css";

export const metadata: Metadata = {
  title: "SKYTRACE — The Sky Is Never Still",
  description: "Beyond what the eye can see, the universe is always changing. Explore its hidden story through NASA SPHEREx.",
};

// Home page designed and built by Batool (see components/home-page.tsx).
export default function Home() {
  return <HomePage />;
}
