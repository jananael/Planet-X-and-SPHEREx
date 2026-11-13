# S2-Y2 source-detection validation — 2026-11-13

## Scope and method

This report evaluates the Y2 peak finder on five downloaded SPHEREx DR1 FITS cutouts (97–98 pixels per side), using the repository's object-position inventory as a frame-by-frame reference. It does not combine frames into tracks unless the archive pipeline metadata is known and compatible. The cutouts were retrieved from IRSA by observation ID and cover about 180 arcsec around each inventory position. The local FITS bytes and diagnostic PNGs used for this run are temporary and are not committed; `backend/scripts/validate_source_detection_samples.py` reproduces the retrieval and summary when IRSA is available.

All five FITS files carry `IMAGE` with `BUNIT='MJy / sr'`, `VARIANCE` with `BUNIT='MJy2 / sr2'`, and a `FLAGS` plane with named bit masks. The detector used the variance-derived pixel sigma for the reported peaks. `ZODI` was present but not subtracted. The center coordinates are rounded positions from the checked-in target inventories; separations below are positional comparisons, not associations with astrometric uncertainties.

## Results on real FITS data

| Object / observation | UTC mid-exposure | Band | Pipeline metadata | Peaks at SNR ≥ 5 | SNR min / median / p95 / max | Nearest peak to inventory position | Target-pixel inspection |
|---|---|---:|---|---:|---|---|---|
| Vesta `2026W29_1A_0138_4D2` | 2026-07-13 15:57:52.980Z | D2 | Missing in inventory | 15 | 6.64 / 9.01 / 51.86 / 92.24 | 25.41″, SNR 15.05 | Pixel has TRANSIENT, OVERFLOW, SUR_ERROR, OUTLIER, BLOOM flags |
| Vesta `2026W29_1A_0163_1D2` | 2026-07-13 19:07:09.637Z | D2 | Missing in inventory | 16 | 5.19 / 10.89 / 73.38 / 174.98 | 27.31″, SNR 14.84 | Center IMAGE and VARIANCE are NaN; pixel is OVERFLOW, SUR_ERROR, BLOOM flagged |
| 3I/ATLAS `2025W50_1A_0002_1D1` | 2025-12-08 00:07:26.147Z | D1 | Missing in inventory | 11 | 5.12 / 35.40 / 164.45 / 230.64 | 7.31″, SNR 35.40 | Closest peak is near the position; separate high-SNR peaks are transient-adjacent |
| 3I/ATLAS `2025W50_1A_0021_1D1` | 2025-12-08 01:45:53.940Z | D1 | Missing in inventory | 14 | 6.20 / 29.77 / 136.87 / 238.26 | 3.21″, SNR 78.73 | Closest peak is near the position; separate high-SNR peaks are transient-adjacent |
| Barnard's Star `2025W33_2C_0321_1D6` | 2025-08-15 20:46:08.896Z | D6 | `l2b-v27-2026-228` | 18 | 5.07 / 18.16 / 93.56 / 100.63 | 11.03″, SNR 77.56 | Inventory-position pixel is OVERFLOW, SOURCE, BLOOM flagged |

The five cached cutouts produced 74 peaks total. On repeated local runs, the detector took about 96–101 ms per frame (median of five runs; excludes IRSA search/download). This benchmark is for 97–98 pixel cutouts only, not full 2040×2040 detector images.

## What these observations show

- **A useful positive check:** in both 3I/ATLAS images, the nearest thresholded peak lies within 7.31″ and 3.21″ of the checked-in predicted position. This is compatible with a possible positional match, but no per-frame astrometric uncertainty or independent photometric validation is available.
- **A concrete missed-source case:** Vesta's expected central pixel is unusable in both selected frames: one is affected by transient/overflow/error/outlier/bloom flags, and the other has non-finite IMAGE and VARIANCE values with overflow/error/bloom flags. The nearest retained peaks are 25–27″ away. The detector therefore does **not** return a usable Vesta detection in these frames; the surrounding peaks must not be presented as Vesta.
- **A provisional-threshold warning:** unrelated or artifact-adjacent peaks also pass SNR 5. For example, 3I/ATLAS frame `2025W50_1A_0002_1D1` has a peak at pixel (67, 60) with SNR 230.64 and `near_transient_pixels`. This is an artifact-suspect example, not a confirmed false positive without image-level truth labels. The other transient-adjacent peaks are listed in the JSON output from the validation script.
- **A matching limitation:** the two 3I inventory positions are 264.81″ apart over about 98 minutes, far outside the provisional 12.3″ gate. The per-frame positions are close to the respective inventory coordinates, but they cannot be linked by this positional matcher. Vesta's two inventory positions differ by 124.02″ over about 3.15 hours, also beyond the gate; in this case, saturation/flags prevent a valid track anyway.
- Barnard's nearest retained peak is within the provisional gate, but its center pixel is overflow/bloom flagged. One exposure cannot establish a track or proper motion.

The report does not call every unflagged peak a false positive. There is no labeled reference catalog for all 74 peaks in these cutouts, and 3I/ATLAS's extended appearance can itself produce multiple peaks. Confirmed false-positive and completeness rates remain unmeasured. The candidate-count and SNR distributions are descriptive output of this specific thresholded method, not a validated performance estimate.

## Synthetic and API test results

From `backend/`, the full command was:

```text
PYTHONPATH=app /private/tmp/skytrace-y2-venv/bin/python -m pytest -q
83 passed, 1 skipped
```

The synthetic FITS tests cover empty frames, isolated and nearby sources, >500 detections, missing/incompatible variance and MAD fallback, invalid BUNIT/WCS, OVERFLOW and TRANSIENT flags, SOURCE background masking, high background, incompatible/missing pipeline metadata, duplicate IDs and simultaneous epochs, ambiguous matching, movement outside the gate, three-epoch motion gating, and Candidate contract validation. API integration tests cover real-mode FITS candidates, empty searches and empty detections, required band/pipeline selection, unsupported pipeline metadata, failed download, corrupt FITS, response validation, and repeated requests/detail lookup. The skipped test is the opt-in network check; real FITS samples were examined separately as above.

## Verified documentation vs assumptions

- **Verified from IRSA documentation and these headers:** `IMAGE` is in MJy/sr; the variance extension is the per-pixel variance/uncertainty estimate for the spectral image and uses squared image units in these files; FITS `FLAGS` names and masks can be read from `MSKN` / `MSKM`; TRANSIENT may indicate cosmic rays or blooming, and overflow is a saturation-related flag. IRSA's spectrophotometry tool does not use the ZODI plane.
- **Implemented as a conservative rule:** only variance maps with compatible units and shape are used; non-finite/non-positive per-pixel variance falls back to frame MAD when available. `ZODI` is not subtracted. Pixels marked with detector defects, transients, overflow or named artifact flags are excluded from local peak calculations; flagged TRANSIENT adjacency is retained as a warning.
- **Still unvalidated:** that peak-pixel `sqrt(VARIANCE)` divided into local peak-minus-annulus background is a statistically calibrated source SNR; the universal validity of threshold 5; the effect of spatially varying noise and pixel covariance; completeness and false-positive rates; astrometric error for the selected DR1 images; and the 12.3″ association gate across time gaps, motion, density, and confusion.
- Vesta and 3I/ATLAS have blank `processing_version` values in the checked-in inventories. No version was inferred from release labels. The two frames per target were checked independently, not cross-matched as a track. Only one Barnard's Star exposure was retrieved in this run.

## Remaining work and recommendation

Y2 has reproducible synthetic/API coverage and useful real-data evidence, but the real-data run also demonstrates a known-object miss and shows thresholded peaks adjacent to transients. Association remains a short-gate heuristic without time-dependent motion or astrometric uncertainty. Keep Y2 **In Progress** and PR #2 open. Before calling it complete, obtain pipeline metadata for Vesta and 3I/ATLAS, retrieve the second Barnard's Star exposure, review real-image source/artefact labels with the science team, and validate association and detection thresholds against those labels. Do not claim discovery or quantitative completeness.
