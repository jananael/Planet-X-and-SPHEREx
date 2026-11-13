# Source detection and cross-matching (S2-Y2)

`DATA_SOURCE=real` exposes the experimental detector at `/api/candidates`. It reads cached SPHEREx level-2 FITS data. The endpoint returns empty candidates when the archive search finds no observations. For a real-data request, supply `band=D1..D6` and `pipeline=vNN` whenever the archive search contains more than one compatible group. Missing pipeline metadata, incompatible groups, invalid units, and invalid celestial WCS return an actionable 400; an unreadable or failed archive FITS returns 502. No observations found is a normal empty 200 response.

## FITS interpretation

- `IMAGE` is accepted only when its `BUNIT` is a recognized MJy/sr form. The SPHEREx Explanatory Supplement describes the calibrated spectral-image values in MJy/sr.
- `VARIANCE` is used only when its shape matches `IMAGE` and its header identifies squared MJy/sr units. IRSA describes it as the per-pixel variance / uncertainty estimate corresponding to the spectral image. Its square root is used as a *pixel-level* sigma at the peak pixel, not as a source-level uncertainty or calibrated detection significance.
- If the variance plane is absent, has incompatible units or shape, or has a non-positive/non-finite value at a candidate pixel, the engine falls back to `1.4826 × MAD` of finite unmasked pixels over the frame. A candidate's evidence reports the method used for its peak pixel. The fallback is global while the background is local, so strong spatially varying noise can still make the estimate wrong.
- `ZODI` is retained but not subtracted by the detector. It is a prediction/model plane; IRSA's spectrophotometry tool documents that it does not use ZODI. The detector instead estimates local background from the image annulus. Whether ZODI subtraction improves this peak finder remains unvalidated.
- The raw FITS science pixels are not repaired or interpolated. `FLAGS` is decoded by the file's `MSKN` / `MSKM` cards. `TRANSIENT`, `OVERFLOW`, `SUR_ERROR`, `NONFUNC`, `DICHROIC`, `MISSING_DATA`, `HOT`, `COLD`, `NONLINEAR`, `PERSIST`, `OUTLIER`, and the artifact planes `BLOOM`, `CROSSTALK`, `GHOST*`, `STREAK`, `SNOWBALL`, and `HALO` are excluded from peak/background calculations. `SOURCE` pixels remain eligible peaks but are excluded from the background estimate. A transient pixel within one pixel of a retained peak adds `near_transient_pixels`. When FLAGS is absent, the result's data quality remains `unknown`; unavailable flags are not treated as a clean-quality assertion.
- WCS is required and checked for a finite celestial transform. Invalid or missing WCS is an error, not an unlocated candidate.

Sources: [SPHEREx Explanatory Supplement v1.2.1](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/SPHEREx_Expsupp_QR_v1.2.1.pdf), [SPHEREx Explanatory Supplement v1.3 flag and anomaly tables](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/SPHEREx_Expsupp_QR.pdf), [IRSA Spectrophotometry Tool](https://irsa.ipac.caltech.edu/onlinehelp/spherex/spherex/sp.html), [IRSA Visualization HDU guide](https://irsa.ipac.caltech.edu/onlinehelp/spherex/spherex/visualization.html).

## Detection statistic

The detector searches for local maxima in a 3×3 neighborhood. It estimates local background from the median of a 5×5 annulus that excludes the 3×3 core, requiring at least eight usable annulus pixels. The peak-pixel difference from that median is divided by either the variance-derived pixel sigma or the frame-wide MAD sigma. `SNR >= 5` is configurable in code and remains a provisional engineering threshold. It is not an established survey-wide threshold, a PSF-fit significance, a flux measurement, or a false-alarm probability. PSF fitting, correlated-pixel effects, local noise models, completeness and false-positive calibration are not implemented. Flux and flux error remain null; candidate status remains `pending_validation`; score remains null.

Peak suppression keeps the strongest maximum within a one-pixel Chebyshev neighborhood. There is no 500-source cap: all qualifying, nonduplicate peaks are retained. Runtime and memory still depend on the number of peaks because suppression is currently performed in signal-strength order.

## Epoch selection, association and motion

- The API requires one explicit band/pipeline group if multiple groups are available. Unknown pipeline metadata is not inferred. Only the selected group's compatible records are considered.
- Up to three records are sampled as first, middle and last in time. This reduces synchronous API work but can miss transient behavior between sampled epochs; the API response evidence names the selection and input count.
- A frame set may not contain duplicate observation IDs or simultaneous timestamps. Multiple detectors at one mid-time are not independent temporal epochs.
- Detection association is a provisional one-to-one greedy match to the last position within 12.3 arcsec (two nominal 6.15 arcsec pixels). If two available tracks' distances differ by no more than 1 arcsec, the new detection is kept separate and tagged `association_ambiguous`; it is not forced into either track.
- The 12.3 arcsec gate does not scale with time gap, astrometric uncertainty, source density, or expected object motion. A source that moves farther between sampled exposures remains as separate single-epoch candidates. A positional association does not match a known object. Known-object matching remains a separate ephemeris/catalogue operation; the public real-data path currently supplies no ephemerides.
- Motion is considered only for an unambiguous association of at least three strictly increasing UTC observations. The first-to-last RA offset includes cos(Dec); a linear tangent-plane fit must have residuals no greater than one nominal pixel (6.15 arcsec). This is a provisional consistency gate, not an astrometric error model. Insufficient, non-UTC, simultaneous, or inconsistent tracks keep motion null. `uncertainty_arcsec` is never fabricated. The resulting motion label is still not evidence of a discovery.

## API/runtime limitations

`RealSource._candidate_results` is process-local memory. A candidate detail URL may fail after a restart or when a later request reaches another worker. Results are not persisted or shared between workers. This MVP has no distributed job or result store. FITS cutouts are cached on disk, but candidate objects are not.

## Evidence and open science questions

Automated synthetic FITS tests exercise units, variance fallback, masks, WCS failure, crowded detections, association and API error paths. They validate code behavior, not astronomical accuracy. Real-data observations and any visual/manual comparisons are recorded separately in [the Y2 validation report](science/source-detection-validation-2026-11-13.md). Until that report contains reproducible Vesta, 3I/ATLAS and Barnard's Star sample results, no scientific performance claim is made.

Open questions include the calibration of `SNR >= 5`, whether the per-pixel variance is an adequate denominator for peak detection given the image processing covariance, WCS/astrometric uncertainties in selected releases, the 12.3 arcsec association gate across actual time gaps and crowded fields, and completeness/false-positive rates. The peak detector does not deblend sources, perform calibrated photometry, model extended comae, fetch ephemerides, or establish object identity.
