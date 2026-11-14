"use client";
// /visualization: the real-data dashboard first; Yazan's interactive Learning lab (illustrative data) one click away.
import { useEffect, useState } from "react";
import { DataDashboard } from "./data-dashboard";
import { VisualizationWorkspace } from "./visualization-workspace";

export function VisualizationPage() {
  const [lab, setLab] = useState(false);
  useEffect(() => { setLab(new URLSearchParams(window.location.search).get("view") === "lab"); }, []);
  if (!lab) return <DataDashboard onLearningLab={() => { setLab(true); window.scrollTo(0, 0); }} />;
  return <>
    <div className="dash-back-bar"><button type="button" onClick={() => { setLab(false); window.scrollTo(0, 0); }}>← Back to the real-data dashboard</button></div>
    <VisualizationWorkspace />
  </>;
}
