"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { workspaceHref } from "../lib/workspace-navigation";
import type { Coordinates, SearchOptions } from "../lib/types";
export function WorkspaceNavigation({ coordinates, options, targetId, footer = false }: {
  coordinates: Coordinates | null; options: SearchOptions; targetId: string | null; footer?: boolean;
}) {
  const pathname = usePathname();
  return <nav className="workspace-navigation" aria-label={footer ? "Footer navigation" : "Main navigation"}>
    <a href="/">Home</a>
    {[["/explore", "Explorer"], ["/observations", "Observations & Results"]].map(([path, label]) =>
      <Link key={path} href={workspaceHref(path, coordinates, options, targetId)} aria-current={pathname === path ? "page" : undefined}>{label}</Link>)}
  </nav>;
}
