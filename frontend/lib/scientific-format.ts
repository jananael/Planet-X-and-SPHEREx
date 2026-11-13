export const NOT_AVAILABLE = "Not available";
export function finiteNumber(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
export function textValue(value: unknown): string { return typeof value === "string" && value.trim() ? value : NOT_AVAILABLE; }
export function numberValue(value: unknown, unit = ""): string {
  return finiteNumber(value) ? `${value}${unit ? ` ${unit}` : ""}` : NOT_AVAILABLE;
}
/** An error bar is not a confidence interval; the contract supplies no confidence level. */
export function uncertaintyValue(value: unknown, unit = ""): string {
  if (value == null) return "Uncertainty not available";
  return finiteNumber(value) && value >= 0 ? numberValue(value, unit) : "Uncertainty not available — invalid uncertainty reported";
}
export function measurementValue(value: unknown, uncertainty: unknown, unit = ""): string {
  if (!finiteNumber(value)) return NOT_AVAILABLE;
  if (!finiteNumber(uncertainty) || uncertainty < 0) return `${numberValue(value, unit)} — ${uncertaintyValue(uncertainty, unit)}`;
  return `${value} ± ${uncertainty}${unit ? ` ${unit}` : ""}`;
}
/** Never guess a timezone for an unqualified time or convert missing values to epoch zero. */
export function formatUtc(value: unknown): string {
  if (typeof value !== "string" || !/(Z|[+-]\d{2}:\d{2})$/i.test(value)) return NOT_AVAILABLE;
  const time = new Date(value);
  return Number.isFinite(time.getTime()) ? time.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC") : NOT_AVAILABLE;
}
/** Strict headers: a missing count is unknown, not a measured zero. */
export function numericHeader(value: string | null, { count = false, positive = false } = {}): number | null {
  if (value === null || !value.trim()) return null;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return null;
  const result = Number(value);
  if (!Number.isFinite(result) || (count && (!Number.isSafeInteger(result) || result < 0)) || (positive && result <= 0)) return null;
  return result;
}
export function dataSourceLabel(source: unknown): string {
  return source === "mock" ? "Synthetic demo data — not NASA measurements" : source === "real" ? "NASA SPHEREx / NASA-IPAC IRSA" : "Data source not available";
}
export function emptyCoverageMessage(source: unknown): string {
  return source === "mock" ? "No synthetic demo images cover this position. This does not establish real SPHEREx coverage."
    : source === "real" ? "No observations were returned for this search and its filters. This does not rule out changes or coverage in other dates or releases."
    : "No images were returned. The data source is unavailable, so real archive coverage has not been established.";
}
