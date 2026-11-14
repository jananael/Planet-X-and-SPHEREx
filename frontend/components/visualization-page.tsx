"use client";
// /visualization: the real-data dashboard first; the coordinate sky map and educational views are one click away.
import { useEffect, useState } from "react";
import { DataDashboard, type DashboardPlace } from "./data-dashboard";
import { VisualizationWorkspace } from "./visualization-workspace";

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
  if (!lab) return <DataDashboard onLearningLab={openLab} />;
  return <>
    <div className="dash-back-bar"><button type="button" onClick={() => { const url = new URL(window.location.href); url.searchParams.delete("view"); window.history.replaceState({}, "", url); setLab(false); window.scrollTo(0, 0); }}>← Back to the real-data dashboard</button></div>
    <VisualizationWorkspace />
  </>;
}
