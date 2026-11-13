SKYTRACE Sky Navigator astronomical data

Source: https://github.com/ofrohn/d3-celestial
Pinned revision: 7e720a3de062059d4c5400a379146a601d9010e0
License: BSD-3-Clause; see LICENSE-d3-celestial.txt in this folder.

constellations.bounds.json: J2000 constellation boundary polygons.
constellations.lines.json: traditional figure lines. These are not region borders.
constellations.json: constellation names and label metadata.
named-stars.json: joined named stars from stars.6.json (Hipparcos-based positions)
and starnames.json, preserving the source values; only stars with proper names
are included. These are an orientation aid, not a complete source catalog.

All RA values are degrees, normalized to [0, 360). Dec values are degrees.
Boundary identification uses the supplied J2000 polygons. Avoid treating a
label near a border as a precise boundary measurement.

Atlas: Aladin Lite (CDS), pinned existing browser library v3.8.2.
Documentation: https://cds-astro.github.io/aladin-lite/
Survey: DSS optical color, official ESA mirror:
https://cdn.skies.esac.esa.int/DSSColor
Astronomical object resolution: CDS Sesame through Aladin's gotoObject API.

The DSS survey is NOT SPHEREx imagery or observation coverage. No SPHEREx
coverage is supplied until a caller passes actual, provenance-bearing
CoverageMetadata into the map component. Bookmarks are local user choices,
not discoveries. Storage schema: skytrace.discovery-passport.locations.v1,
{ version: 1, locations: [{ id, name, ra, dec, createdAt, kind: "bookmark" }] }.
