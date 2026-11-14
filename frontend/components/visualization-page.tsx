"use client";
// /visualization: the educational Learning lab (illustrative data), in the Explorer's header, footer and palette.
import { VisualizationWorkspace } from "./visualization-workspace";
import { WorkspaceNavigation } from "./workspace-navigation";
import "../app/explore/explorer.css";
import "./visualization-theme.css";

const Logo = () => <a href="/" className="explorer-logo" aria-label="SKYTRACE home"><img src="/skytrace/satellite-logo.png" alt="SKYTRACE satellite logo" width="1774" height="887" /></a>;

export function VisualizationPage() {
  return <div className="explorer-page viz-themed">
    <header className="site-header"><Logo /><WorkspaceNavigation coordinates={null} options={{}} targetId={null} /><div className="source-badge mock"><span />ILLUSTRATIVE DEMO</div></header>
    <VisualizationWorkspace />
    <footer className="site-footer"><Logo /><p>Data: NASA SPHEREx via NASA/IPAC IRSA · NASA Space Apps Challenge 2026 project, not an official NASA product.</p><WorkspaceNavigation coordinates={null} options={{}} targetId={null} footer /></footer>
  </div>;
}
