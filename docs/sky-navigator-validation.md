# Sky Navigator implementation and verification

The existing Aladin Lite v3.8.2 map now uses the DSS optical survey directly
from the official ESA mirror. Atlas navigation, catalog labels, name resolution,
coordinate selection and bookmarks do not call the SPHEREx backend.
Only **Explore This Region** calls the existing observation search workflow.

## Implemented

- Pan/zoom, keyboard navigation, click/tap selection and a cyan selection marker.
- Two-way synchronization with valid manual RA/Dec values; RA wraps at 360 degrees.
- Named star, constellation figure/boundary, equatorial grid, survey and bookmark layers.
- CDS Sesame object resolution with M31/M42/M45 shortcuts, timeout and error feedback.
- Fullscreen plus an expanded-view fallback, responsive toolbar and collapsible layers.
- Versioned, validated browser bookmarks with duplicate prevention and removal.
  The project had no existing Discovery Passport storage. The documented v1 format
  is ready to reuse, and explicitly represents bookmarks rather than discoveries.
- Optional provenance-bearing `CoverageMetadata` prop. No coverage data is fabricated;
  the coverage control is disabled until real polygons are supplied.

## Automated verification

- TypeScript compilation.
- Existing observation/API tests plus new coordinate, bookmark and sky-region tests.
- All 19 automated tests passed; TypeScript and whitespace checks passed.
- Region tests include Andromeda, Orion, Taurus, RA wrap, Ursa Minor and Octans.
- Public catalog assets and Explorer route checked through the local server.

## External request evidence (13 November 2026)

`GET https://cdn.skies.esac.esa.int/DSSColor/properties` returned HTTP 200,
`Access-Control-Allow-Origin: *`, `obs_title = DSS colored`,
`hips_frame = equatorial`, `hips_order = 9`, `hips_tile_format = jpeg`.
The initially configured CDS DSS URL returned HTTP 404, so it was replaced.

The actual Aladin Sesame endpoint returned HTTP 200 and CORS `*` for:

| Request suffix at `https://cds.unistra.fr/cgi-bin/nph-sesame/-o/SVNI?` | `%J` result (RA, Dec degrees) |
| --- | --- |
| `M31` | `10.6847083 +41.2687500` |
| `M42` | `83.82010 -5.38760` |
| `M45` | `56.65833 +24.17806` |

These are service responses, not invented target coordinates or proof of SPHEREx coverage.

## Browser verification and remaining dependencies

Interactive browser QA remains separate from the automated checks. Verify open/close,
drag/pinch zoom, fullscreen, map clicks, manual-input synchronization, object lookup,
all layers, bookmark persistence/removal, mobile sizing and keyboard focus in a browser
with WebGL2. Do not treat HTTP responses or unit tests as proof of those visual behaviors.
The browser automation host was unavailable in this session, so those interactive
checks could not be completed or visually certified here.

The atlas library, survey imagery and name resolver require internet access. Stars and
constellation overlays are served from the local project with their BSD license and
source revision in `frontend/public/skytrace/catalogs/README.txt`.
The map cannot make SPHEREx searches succeed while that API is unavailable; normal
Explorer loading, error and no-coverage states are preserved.

Aladin v3.8.2 has no public disposal method. Component cleanup removes its callbacks,
aborts local requests, clears timers, disconnects the inspected library ResizeObserver
and stops its redraw scheduler. Revisit this compatibility cleanup when upgrading Aladin.
