export type TargetType = "asteroid" | "comet" | "brown_dwarf" | "star" | "variable";
export type ValidationStatus = "verified" | "pending" | "challenging" | "not_supported";
export interface Target {
  id: string; name: string; type: TargetType; ra: number; dec: number; description: string;
  validation_status?: ValidationStatus; validation_note?: string | null; recommended_size_arcsec?: number;
  /** Moving objects (real data): only images in this UTC window contain the object here. */
  search_start?: string | null; search_end?: string | null; preferred_band?: string | null;
}
export interface SearchOptions { start?: string | null; end?: string | null; band?: string | null }
export interface Observation {
  id: string; target_id: string | null; obs_time: string; mjd: number;
  wavelength_um: number | null; wavelength_range_um?: [number, number] | null;
  band: string; release: string; source_file: string; image_url: string;
  footprint?: { ra: number; dec: number; radius_deg: number } | null;
}
export interface Coordinates { ra: number; dec: number }
export type Stretch = "asinh" | "zscale" | "linear";
export interface ImageSettings extends Coordinates { size: number; stretch: Stretch }
export interface BlinkFrame { obs: Observation; url: string; wavelengthUm: number | null; bandwidthUm: number | null; vmin: number; vmax: number }
export interface FrameFailure { observation: Observation; message: string; code: string }
