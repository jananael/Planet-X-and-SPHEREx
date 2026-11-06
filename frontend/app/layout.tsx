import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Explorer | MARS",
  description: "Explore SPHEREx observations across time. Compare motion and brightness in the infrared sky.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
