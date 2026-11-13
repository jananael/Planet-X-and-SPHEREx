# Image credits — SKYTRACE

Every image the site shows, where it is used, and where it came from. Judges and NASA Space Apps
rules expect the source and licence of every third-party image.

**Status:** draft prepared 2026-11-13 from the git history. The **Source / licence** column must be
filled in by **Batool** (visual identity) and **Sadeel** (homepage import): only they know where each
image came from. Do not guess a source.

For each image, write one of:
- **Original** — made by the team (say who and with which tool).
- **AI-generated** — say which tool. Say so even if it was edited afterwards.
- **Third party** — exact source URL, author/credit line, and licence (e.g. "NASA/JPL-Caltech, public
  domain, credit required"). NASA images are usually free to use but need the credit line, and must not
  suggest NASA endorsement.

## Images in use

| File | Shown on | Added by (git) | Source / licence |
|---|---|---|---|
| `public/skytrace-homepage/assets/earth.png` | Homepage hero | Sadeel, from `NASA.zip` (b478580) | ⏳ to confirm |
| `public/skytrace-homepage/assets/nebula.png` | Homepage background | Sadeel, from `NASA.zip` (b478580) | ⏳ to confirm |
| `public/skytrace-homepage/assets/spherex.png` | Homepage telescope (hero + mission) | Sadeel, from `NASA.zip` (b478580) | ⏳ to confirm |
| `public/skytrace-homepage/assets/skytrace-logo.png` | Homepage logo | Sadeel, from `NASA.zip` (b478580) | ⏳ to confirm (team logo?) |
| `public/skytrace/satellite-logo.png` | Explorer header and footer (same file as `skytrace-logo.png`) | Sadeel (e26ed74) | ⏳ to confirm (team logo?) |
| `public/skytrace/milky-way.webp` | Explorer page background | Batool's design, ported by Jana (573c376) | ⏳ to confirm |

## Images no longer shown

The old React homepage (`components/home-page.tsx`) is bypassed by the `/` rewrite in `next.config.mjs`,
so these are not visible on the site any more. Credit them anyway if they stay in the repository:

| File | Added by (git) | Source / licence |
|---|---|---|
| `public/skytrace/earth.webp` | Batool's design, ported by Jana (573c376) | ⏳ to confirm |
| `public/skytrace/telescope.webp` | Batool's design, ported by Jana (573c376) | ⏳ to confirm |
| `public/skytrace/orbital-logo.png`, `orbital-logo-beige.png` | Sadeel (e26ed74) | ⏳ to confirm (not referenced in code) |

## Data and libraries already credited elsewhere

- **SPHEREx images** in the Explorer: "Data: NASA SPHEREx via NASA/IPAC IRSA" (credit line on every page).
- **Sky map:** Aladin Lite (CDS, Strasbourg, GPL-3, loaded at runtime), AllWISE (NASA/JPL-Caltech/UCLA via IRSA),
  DSS colour survey (via ESA ESASky), constellation and star catalogues from d3-celestial
  (`public/skytrace/catalogs/LICENSE-d3-celestial.txt`).
- **GIF export:** gifenc (MIT).
