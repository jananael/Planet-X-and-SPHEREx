"use client";
// /visualization: the real-data dashboard first; the educational learning lab is one click away.
// Wrapped in the same header, footer and palette as the Explorer (explorer.css + visualization-theme.css).
import { useEffect, useState } from "react";
import { DataDashboard, type DashboardPlace } from "./data-dashboard";
import { VisualizationWorkspace } from "./visualization-workspace";
import { WorkspaceNavigation } from "./workspace-navigation";
import "../app/explore/explorer.css";
import "./visualization-theme.css";

const Logo = () => <a href="/" className="explorer-logo" aria-label="SKYTRACE home"><img src="/skytrace/satellite-logo.png" alt="SKYTRACE satellite logo" width="1774" height="887" /></a>;

export function VisualizationPage() {
  const [lab, setLab] = useState(false);
  useEffect(() => { setLab(new URLSearchParams(window.location.search).get("view") === "lab"); }, []);
  const openLab = (place: DashboardPlace | null) => {
    const url = new URL(window.location.href);
    if (place) {
      url.searchParams.set("ra", String(place.point.ra)); url.searchParams.set("dec", String(place.point.dec));
      if (place.targetId) url.searchParams.set("target", place.targetId); else url.searchParams.delete("target");
      if (place.start) url.searchParams.set("start", place.start); else url.searchParams.delete("start");
      if (place.end) url.searchParams.set("end", place.end); else url.searchParams.delete("end");
    }
    url.searchParams.set("view", "lab"); window.history.replaceState({}, "", url); setLab(true); window.scrollTo(0, 0);
  };
  const closeLab = () => { const url = new URL(window.location.href); url.searchParams.delete("view"); window.history.replaceState({}, "", url); setLab(false); window.scrollTo(0, 0); };
  return <div className="explorer-page viz-themed">
    <header className="site-header"><Logo /><WorkspaceNavigation coordinates={null} options={{}} targetId={null} /><div className={`source-badge ${lab ? "mock" : ""}`}><span />{lab ? "ILLUSTRATIVE DEMO" : "LIVE ARCHIVE"}</div></header>
    {lab && <div className="dash-back-bar"><button type="button" onClick={closeLab}>← Back to the real-data dashboard</button></div>}
    {lab ? <VisualizationWorkspace /> : <DataDashboard onLearningLab={openLab} />}
    <footer className="site-footer"><Logo /><p>Data: NASA SPHEREx via NASA/IPAC IRSA · NASA Space Apps Challenge 2026 project, not an official NASA product.</p><WorkspaceNavigation coordinates={null} options={{}} targetId={null} footer /></footer>
  </div>;
}
