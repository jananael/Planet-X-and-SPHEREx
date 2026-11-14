import Link from "next/link";
import { dataSourceLabel, numberValue } from "../lib/scientific-format";
import type { Coordinates } from "../lib/types";

export function MachineLearning({ coordinates, targetName, source, changeLocationHref }: {
  coordinates: Coordinates | null; targetName?: string; source: string | null; changeLocationHref: string;
}) {
  return <section className="panel ml-placeholder" aria-labelledby="ml-title">
    <p className="eyebrow">MACHINE LEARNING</p>
    <span className="alignment-badge">Model Integration in Progress</span>
    <h1 id="ml-title">Predicting the Sky of Tomorrow</h1>
    <p>From past observations to future possibilities.</p>
    <p>This future workspace will use astronomical observations and appropriate predictive models to investigate possible position or brightness changes over time. Predictions are not yet available.</p>
    <dl className="scientific-metadata">
      <div><dt>Selected location</dt><dd>{targetName || "No named object selected"}</dd></div>
      <div><dt>Right ascension</dt><dd>{numberValue(coordinates?.ra, "°")}</dd></div>
      <div><dt>Declination</dt><dd>{numberValue(coordinates?.dec, "°")}</dd></div>
      <div><dt>Observation source</dt><dd>{dataSourceLabel(source)} — not yet connected as model input</dd></div>
    </dl>
    <Link className="share-button" href={changeLocationHref}>{coordinates ? "Change Location" : "Choose Sky Coordinates"}</Link>
    <fieldset className="prediction-controls" disabled><legend>Future prediction</legend><label>Prediction date<input type="date" /></label><button className="primary-button" type="button">Generate prediction — coming soon</button></fieldset>
    <details className="explorer-options"><summary>Future prediction details</summary>
      <dl className="scientific-metadata">{["Predicted position / brightness", "Prediction uncertainty", "Model and version", "Model input data", "Validation / accuracy metrics", "Predicted versus observed comparison"].map(label => <div key={label}><dt>{label}</dt><dd>Not available — model not connected</dd></div>)}</dl>
    </details>
    <p className="scientific-limitation">Future predictions will need documented uncertainty and validation. They will not establish confirmed detections or discoveries.</p>
  </section>;
}
