import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  // Absolute base for the share image URL; set NEXT_PUBLIC_SITE_URL to the deployed address.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "SKYTRACE",
  description: "Explore the changing sky through NASA SPHEREx observations with SKYTRACE.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
