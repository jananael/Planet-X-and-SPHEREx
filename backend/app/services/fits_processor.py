
"""SPHEREx FITS processing and preliminary quality masking (S2-T4)."""

from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS


# Preliminary quality policy. Requires science-team approval.
# SOURCE and FULLSAMPLE are intentionally not rejected.
BAD_FLAG_BITS = {
    "NONFUNC": 6,
    "MISSING_DATA": 9,
    "HOT": 10,
    "COLD": 11,
    "NONLINEAR": 15,
    "OUTLIER": 19,
}

BAD_FLAG_MASK = sum(1 << bit for bit in BAD_FLAG_BITS.values())


def read_flag_definitions(header):
    """Read quality flag names and bitmasks from the FITS header."""
    definitions = {}

    for key in header:
        if key.startswith("MSKN") and key[4:].isdigit():
            name = str(header[key]).strip()
            suffix = key[4:]
            mask_key = "MSKM" + suffix

            if mask_key in header:
                definitions[name] = int(header[mask_key])

    return definitions

def process_fits(file_path):
    """Read IMAGE, FLAGS, VARIANCE, WCS and build a quality mask.

    Returns a dictionary with image data, optional extensions,
    WCS, boolean quality masks and warnings.

    True in bad_pixels means excluded by the preliminary policy.
    """

    file_path = Path(file_path)

    with fits.open(file_path, memmap=False) as hdul:
        if "IMAGE" not in hdul or hdul["IMAGE"].data is None:
            raise ValueError("Required IMAGE extension is missing")

        image = np.array(hdul["IMAGE"].data, dtype=np.float32)

        if image.ndim != 2:
            raise ValueError("IMAGE must be a 2D array")


        flags = None
        flag_definitions = {}

        if "FLAGS" in hdul and hdul["FLAGS"].data is not None:
            flags = np.array(hdul["FLAGS"].data, dtype=np.int32)

            if flags.shape != image.shape:
                raise ValueError("FLAGS shape does not match IMAGE")

            flag_definitions = read_flag_definitions(
                hdul["FLAGS"].header
            )


        variance = None
        if "VARIANCE" in hdul and hdul["VARIANCE"].data is not None:
            variance = np.array(
                hdul["VARIANCE"].data, dtype=np.float32
            )
            if variance.shape != image.shape:
                raise ValueError("VARIANCE shape does not match IMAGE")

        try:
            wcs = WCS(hdul["IMAGE"].header, naxis=2)
            if not wcs.has_celestial:
                wcs = None
        except (ValueError, TypeError, KeyError):
            wcs = None

    bad_pixels = ~np.isfinite(image)

    if variance is not None:
        bad_pixels |= ~np.isfinite(variance) | (variance <= 0)


    if flags is not None:
        missing_flags = [
            name for name in BAD_FLAG_BITS
            if name not in flag_definitions
        ]

        if missing_flags:
            raise ValueError(
                f"Missing required FLAGS definitions: {missing_flags}"
            )

        mask_bits = sum(
            flag_definitions[name] for name in BAD_FLAG_BITS
        )

        bad_pixels |= (flags & mask_bits) != 0


    warnings = []
    if flags is None:
        warnings.append("FLAGS extension is missing")
    if variance is None:
        warnings.append("VARIANCE extension is missing")
    if wcs is None:
        warnings.append("WCS is missing or invalid")

    return {
        "image": image,
        "flags": flags,
        "variance": variance,
        "wcs": wcs,
        "bad_pixels": bad_pixels,
        "good_pixels": ~bad_pixels,
        "warnings": warnings,
    }
