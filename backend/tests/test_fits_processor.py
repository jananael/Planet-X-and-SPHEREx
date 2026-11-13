
import numpy as np
from astropy.io import fits

from app.services.fits_processor import process_fits

def check_real_file(filename):
    result = process_fits(filename)

    assert result["image"].shape == (2040, 2040)
    assert result["flags"] is not None
    assert result["variance"] is not None
    assert result["wcs"] is not None
    assert result["bad_pixels"].dtype == np.bool_
    assert np.all(
        result["good_pixels"] == ~result["bad_pixels"]
    )

    print(f"\nPASS: {filename}")
    print("Bad pixels:", np.count_nonzero(result["bad_pixels"]))
    print("Warnings:", result["warnings"])


def check_missing_extensions():
    with fits.open("observation1.fits") as hdul:
        selected = [
            hdu.copy()
            for hdu in hdul
            if hdu.name not in ("FLAGS", "VARIANCE")
        ]
        fits.HDUList(selected).writeto(
            "test_missing.fits", overwrite=True
        )

    result = process_fits("test_missing.fits")
    assert result["flags"] is None
    assert result["variance"] is None
    assert len(result["warnings"]) == 2
    print("\nPASS: Missing optional extensions")


def check_missing_image():
    with fits.open("observation1.fits") as hdul:
        selected = [
            hdu.copy()
            for hdu in hdul
            if hdu.name != "IMAGE"
        ]
        fits.HDUList(selected).writeto(
            "test_no_image.fits", overwrite=True
        )

    try:
        process_fits("test_no_image.fits")
    except ValueError as error:
        assert "IMAGE" in str(error)
        print("PASS: Missing required IMAGE")
    else:
        raise AssertionError("Missing IMAGE was accepted")


if __name__ == "__main__":
    check_real_file("observation1.fits")
    check_real_file("observation2.fits")
    check_missing_extensions()
    check_missing_image()
    print("\nALL TESTS PASSED")
def test_real_observation_1():
    check_real_file("observation1.fits")


def test_real_observation_2():
    check_real_file("observation2.fits")


def test_missing_extensions():
    check_missing_extensions()


def test_missing_image():
    check_missing_image()