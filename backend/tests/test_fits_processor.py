
"""Tests for SPHEREx FITS processing and quality masks."""

import os
from pathlib import Path

import numpy as np
import pytest
from astropy.io import fits
from astropy.wcs import WCS

from app.services.fits_processor import (
    BAD_FLAG_BITS,
    process_fits,
    read_flag_definitions,
)


def create_test_fits(
    path,
    include_image=True,
    include_flags=True,
    include_variance=True,
):
    """Generate a small synthetic FITS file for portable tests."""

    hdus = [fits.PrimaryHDU()]

    if include_image:
        image = np.ones((4, 4), dtype=np.float32)
        image[0, 0] = np.nan

        wcs = WCS(naxis=2)
        wcs.wcs.crpix = [2, 2]
        wcs.wcs.cdelt = [-0.001, 0.001]
        wcs.wcs.crval = [100, 20]
        wcs.wcs.ctype = ["RA---TAN", "DEC--TAN"]

        hdus.append(
            fits.ImageHDU(
                data=image,
                header=wcs.to_header(),
                name="IMAGE",
            )
        )

    if include_flags:
        flags = np.zeros((4, 4), dtype=np.int32)

        # HOT: excluded by preliminary scientific policy.
        flags[0, 1] = 1 << BAD_FLAG_BITS["HOT"]

        # SOURCE: not excluded by preliminary policy.
        flags[0, 2] = 1 << 21

        header = fits.Header()

        for name, bit in BAD_FLAG_BITS.items():
            suffix = f"{bit:04d}"
            header[f"MSKN{suffix}"] = name
            header[f"MSKM{suffix}"] = 1 << bit

        header["MSKN0021"] = "SOURCE"
        header["MSKM0021"] = 1 << 21

        hdus.append(
            fits.ImageHDU(
                data=flags,
                header=header,
                name="FLAGS",
            )
        )

    if include_variance:
        variance = np.ones((4, 4), dtype=np.float32)
        variance[1, 0] = 0

        hdus.append(
            fits.ImageHDU(data=variance, name="VARIANCE")
        )

    fits.HDUList(hdus).writeto(path, overwrite=True)
    return path


def test_synthetic_fits_processing(tmp_path):
    path = create_test_fits(tmp_path / "synthetic.fits")

    result = process_fits(path)

    assert result["image"].shape == (4, 4)
    assert result["flags"] is not None
    assert result["variance"] is not None
    assert result["wcs"] is not None

    assert result["bad_pixels"].dtype == np.bool_
    assert np.all(
        result["good_pixels"] == ~result["bad_pixels"]
    )

    # Invalid image pixel.
    assert result["bad_pixels"][0, 0]

    # HOT flag.
    assert result["bad_pixels"][0, 1]

    # SOURCE flag must remain allowed.
    assert result["good_pixels"][0, 2]

    # Invalid variance.
    assert result["bad_pixels"][1, 0]

    # Regular pixel.
    assert result["good_pixels"][2, 2]


def test_missing_optional_extensions(tmp_path):
    path = create_test_fits(
        tmp_path / "missing_extensions.fits",
        include_flags=False,
        include_variance=False,
    )

    result = process_fits(path)

    assert result["flags"] is None
    assert result["variance"] is None
    assert "FLAGS extension is missing" in result["warnings"]
    assert "VARIANCE extension is missing" in result["warnings"]


def test_missing_required_image(tmp_path):
    path = create_test_fits(
        tmp_path / "missing_image.fits",
        include_image=False,
    )

    with pytest.raises(ValueError, match="IMAGE"):
        process_fits(path)


def test_flag_definitions_from_header():
    header = fits.Header()

    header["MSKN0006"] = "NONFUNC"
    header["MSKM0006"] = 64

    header["MSKN0009"] = "MISSING_DATA"
    header["MSKM0009"] = 512

    header["MSKN0021"] = "SOURCE"
    header["MSKM0021"] = 2097152

    definitions = read_flag_definitions(header)

    assert definitions["NONFUNC"] == 64
    assert definitions["MISSING_DATA"] == 512
    assert definitions["SOURCE"] == 2097152


def test_missing_flag_definitions(tmp_path):
    path = create_test_fits(
        tmp_path / "missing_definitions.fits"
    )

    with fits.open(path, mode="update") as hdul:
        del hdul["FLAGS"].header["MSKN0010"]
        del hdul["FLAGS"].header["MSKM0010"]
        hdul.flush()

    with pytest.raises(
        ValueError, match="Missing required FLAGS definitions"
    ):
        process_fits(path)


@pytest.mark.parametrize(
    "filename",
    ["observation1.fits", "observation2.fits"],
)
def test_real_spherex_observation(filename):
    """Optional integration test with locally available DR1 files."""

    directory = Path(
        os.environ.get("SPHEREX_FITS_DIR", ".")
    )
    path = directory / filename

    if not path.is_file():
        pytest.skip(f"Real SPHEREx FITS file unavailable: {path}")

    result = process_fits(path)

    assert result["image"].shape == (2040, 2040)
    assert result["flags"] is not None
    assert result["variance"] is not None
    assert result["wcs"] is not None
    assert result["bad_pixels"].dtype == np.bool_
