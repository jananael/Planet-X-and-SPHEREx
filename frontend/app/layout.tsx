import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SKYTRACE",
  description: "Explore the changing sky through NASA SPHEREx observations with SKYTRACE.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
