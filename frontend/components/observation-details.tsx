import type { BlinkFrame, Observation } from "../lib/types";
import { dataSourceLabel, formatUtc, numberValue, textValue } from "../lib/scientific-format";
import { observationProvenance } from "../lib/scientific-evidence";

function Provenance({ observation, source, frame }: { observation: Observation; source: string | null; frame?: BlinkFrame }) {
  return <dl className="scientific-metadata">{observationProvenance(observation, source, frame).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

export function ObservationDetails({ frame, reference, observations, frames, source }: {
  frame?: BlinkFrame; reference?: BlinkFrame; observations: Observation[]; frames: BlinkFrame[]; source: string | null;
}) {
  return <div className="metadata scientific-provenance">
    <div className="metadata-title"><span className="eyebrow">OBSERVATION DETAILS &amp; PROVENANCE</span><span>{frame ? "Displayed observation" : "No image loaded"}</span></div>
    {frame ? <>
      <p className="observation-time">{formatUtc(frame.obs.obs_time)}</p>
      <p className="scientific-id"><strong>Observation ID:</strong> {textValue(frame.obs.id)}</p>
      <div className="metadata-tags"><span>{textValue(frame.obs.band)}</span><span>Wavelength: {numberValue(frame.wavelengthUm, "µm")}</span><span>Release: {textValue(frame.obs.release)}</span></div>
      <p className="source-file">{textValue(frame.obs.source_file)}</p>
      <details className="scientific-details"><summary>Full provenance and image quality metadata</summary><Provenance observation={frame.obs} source={source} frame={frame} /></details>
    </> : <p className="muted">Time, identifiers, and image quality information appear as observations are loaded. Search metadata is available below for selected observations.</p>}
    <p className="data-credit">{dataSourceLabel(source)}</p>
    {reference && reference.obs.id !== frame?.obs.id && <details className="scientific-details"><summary>Reference image provenance — {textValue(reference.obs.id)}</summary><Provenance observation={reference.obs} source={source} frame={reference} /></details>}
    {observations.length > 0 && <details className="scientific-details"><summary>Provenance for all {observations.length} selected observations</summary>{observations.map(observation => <details className="scientific-details" key={observation.id}><summary>{textValue(observation.id)} · {formatUtc(observation.obs_time)}</summary><Provenance observation={observation} source={source} frame={frames.find(item => item.obs.id === observation.id)} /></details>)}</details>}
  </div>;
}
