
# S2-T4 — FITS Processing and Quality Integration

**Owner:** Taqwa  
**Project:** SKYTRACE  
**Date:** 2026-11-13  
**Status:** Implementation completed — integration and science review pending

## 1. Objective

Prepare SPHEREx FITS images for downstream scientific analysis and image alignment.

The processor reads the science image, quality flags, variance data, and celestial WCS information, then constructs a preliminary pixel-quality mask.

## 2. Implementation

**Main file:** `fits_processor.py`

Implemented features:

- Read the `IMAGE` extension as a 2D float32 array.
- Read optional `FLAGS` and `VARIANCE` extensions.
- Validate array dimensions and shapes.
- Extract celestial WCS from the IMAGE header.
- Generate `bad_pixels` and `good_pixels` boolean masks.
- Return warnings when optional extensions or valid WCS are unavailable.
- Reject files without a valid IMAGE extension.

The processor returns a dictionary containing:

`image`, `flags`, `variance`, `wcs`, `bad_pixels`, `good_pixels`, and `warnings`.

## 3. Preliminary Quality-Mask Policy

The following flag bits are currently treated as reasons to exclude pixels:

| Flag | Bit | Value |
|---|---:|---:|
| NONFUNC | 6 | 64 |
| MISSING_DATA | 9 | 512 |
| HOT | 10 | 1024 |
| COLD | 11 | 2048 |
| NONLINEAR | 15 | 32768 |
| OUTLIER | 19 | 524288 |

Pixels with non-finite IMAGE or VARIANCE values, or with non-positive VARIANCE, are also excluded.

`SOURCE` and `FULLSAMPLE` are intentionally not treated as rejection flags.

**Important:** This is a preliminary masking policy. Final scientific approval is pending.

## 4. Integration Tests

Two real SPHEREx FITS observations were processed successfully.

| Test | Observation 1 | Observation 2 |
|---|---:|---:|
| Image dimensions | 2040 × 2040 | 2040 × 2040 |
| IMAGE | Available | Available |
| FLAGS | Available | Available |
| VARIANCE | Available | Available |
| Celestial WCS | Valid | Valid |
| Excluded pixels | 75,670 | 69,837 |
| Remaining pixels | 4,085,930 | 4,091,763 |
| Warnings | None | None |

The image data uses float32, FLAGS uses int32, and the WCS uses TAN-SIP celestial coordinates.

## 5. Error Handling Tests

**Test file:** `test_fits_processor.py`

The following tests passed:

- Processing both real FITS observations.
- Handling missing optional FLAGS and VARIANCE extensions.
- Returning warnings for missing optional extensions.
- Rejecting FITS files without the required IMAGE extension.

Final test output:

`ALL TESTS PASSED`

## 6. Remaining Work

- Review and approve the final quality-mask policy with the science team.
- Integrate the processor into the shared SKYTRACE backend.
- Confirm the processor output contract with the image-alignment task owner (S2-T5).
- Optionally add further tests for invalid shapes and malformed WCS headers.

## 7. Conclusion

The core S2-T4 FITS processor has been implemented and validated on two real SPHEREx FITS observations.

The tested functionality is ready for team integration, subject to final scientific review of the quality-mask policy.
