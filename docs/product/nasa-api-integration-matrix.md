# NASA and Astronomy API Integration Matrix

Research date: 2026-11-14. This is a discovery document only. No provider integration beyond the existing IRSA/SPHEREx application path was implemented by this research. Example requests are grounded in official documentation; request status is identified per service. No rate limit is reported where the reviewed official documentation publishes none.

## Services

| Provider / service | Official endpoint and data | Format / authentication | Query, download and visualization use | Limits, priority, test status |
|---|---|---|---|---|
| NASA/IPAC IRSA — SPHEREx SIA2 | `https://irsa.ipac.caltech.edu/SIA?`; DR1/QR3 spectral image MEFs and DR1 all-sky cube. Metadata includes `access_url`, `cloud_access`, collection and observation fields. | VO table / VOTable or HTML; public archive data, no API key described. | Sky `POS`, `BAND`, `TIME`, `COLLECTION`, `ID`, `INSTRUMENT`; access returned FITS through the row's `access_url`, or cloud location metadata. Use for calibrated SPHEREx image views and observation timeline with original product provenance. | SIA2 search can lag directory availability by about a day; calibration products are not served through SIA2; QR2 is no longer searchable according to the guide. Existing integration: **live-tested earlier** (Mira query and a real FITS cutout; full product transfer was not completed end-to-end). No published request quota found in the reviewed guide. **MVP priority 1.** [Docs](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-access/) |
| NASA/IPAC IRSA — TAP | `https://irsa.ipac.caltech.edu/TAP`; catalog/metadata tables exposed by IRSA. | VOTable, CSV and other TAP results; public tables as documented. | ADQL table discovery and catalog queries; useful for archive metadata and verified catalogs, not for FITS image cutouts by itself. Validate table/column names from service metadata before use. | A prior integration attempt using CAOM metadata timed out after 35 seconds; schema discovery is **not verified in this task**. Avoid committing unverified catalog table assumptions. No published global rate limit found. **MVP priority 2 after schema validation.** [IRSA TAP](https://irsa.ipac.caltech.edu/docs/program_interface/TAP.html) |
| STScI MAST — CAOM observations/products | Invoke API `https://mast.stsci.edu/api/v0/invoke`; direct products `https://mast.stsci.edu/api/v0.1/Download/file?uri=...`. Hubble and JWST archive observations, image and spectral products. | JSON request/response; product downloads are files such as FITS. Public data can be queried anonymously; proprietary data require an authenticated token. | Cone search, observation search, products by `obsid`, then download a product by `dataURI`. Useful for image/spectral visualization and multi-mission comparisons. | Large result requests may fail at roughly 500,000 rows; constrain requests. MAST uses long-polling for asynchronous jobs; replicate the request parameters. Exact quota not found in reviewed docs. **Phase 2. Not tested in this task.** [API](https://mast.stsci.edu/api/v0/) · [Services](https://mast.stsci.edu/api/v0/_services.html) · [Tutorial](https://mast.stsci.edu/api/v0/MastApiTutorial.html) |
| NASA Exoplanet Archive — TAP | `https://exoplanetarchive.ipac.caltech.edu/TAP`; tables include `ps`, `pscomppars`, `toi`, `stellarhosts`, `spectra` and others. | TAP supports VOTable, CSV, TSV, JSON; no API key required in the documented interface. | ADQL query on verified tables and fields for planet/system properties and host metadata. Visualize catalog values with their published units, uncertainties, solution and provenance. | Some archive tables have not moved to TAP and need the legacy API; table coverage is documented and changes over time. No published request quota found in reviewed pages. **Phase 2. Not tested in this task.** [TAP guide](https://exoplanetarchive.ipac.caltech.edu/docs/TAP/usingTAP.html) · [Interfaces](https://exoplanetarchive.ipac.caltech.edu/docs/program_interfaces.html) |
| JPL SSD — Horizons | `https://ssd.jpl.nasa.gov/api/horizons.api`; ephemerides and observable quantities for solar-system bodies. | JSON default or text; public GET API, no key noted. | Query object and observer/target geometry, coordinate epochs, times, quantities and step size; return ephemerides. Use for a time-aware solar-system position track, clearly distinguish Earth/geocenter from spacecraft observers. | Parameter combinations, target identifiers, time scale and observer center must be exact; API data formats have a `version`; JPL says APIs are best effort. No quota found. **Optional/Phase 2. Not tested in this task.** [Docs and example](https://ssd-api.jpl.nasa.gov/doc/horizons.html) |
| JPL SSD — SBDB / SBDB Query | `https://ssd.jpl.nasa.gov/api/sbdb.api`; query service `https://ssd-api.jpl.nasa.gov/sbdb_query.api`. Object identity, orbit and selected physical/close-approach information. | JSON; public GET API, no key noted. | Resolve a known designation/SPK ID and return orbit/metadata; SBDB Query supports filtered object searches. Use to label known small bodies and provide catalog-linked context, not to infer identity solely from proximity. | Orbital covariance/uncertainty fields may be missing; honor `version` and orbit validity. No quota found. **Optional/Phase 2. Not tested.** [SBDB](https://ssd-api.jpl.nasa.gov/doc/sbdb.html) · [SBDB Query](https://ssd-api.jpl.nasa.gov/doc/sbdb_query.html) |
| NASA Image and Video Library | `https://images-api.nasa.gov/search`, `/asset/{nasa_id}`, `/metadata/{nasa_id}`, `/captions/{nasa_id}`. Educational images, video and accompanying media metadata. | JSON; documentation describes public unauthenticated requests. | Keyword/media type search, then asset manifest for downloadable media; add NASA media in educational context with credit and source URLs. Not a scientific FITS archive. | Media/API is not an astronomical observation catalog and imagery is not interchangeable with calibrated measurements. No quota found. **Optional education enhancement. Not tested.** [API docs](https://images.nasa.gov/docs/images.nasa.gov_api_docs.pdf) |
| NASA GIBS | WMTS/WMS/TWMS/TMS services on `https://gibs.earthdata.nasa.gov/`; pre-rendered NASA Earth science visualization tiles. | Raster tiles/images; public service; some Earthdata assets may have authentication rules. | Layer/time/area/projection map imagery for Earth-science context. It is not a general sky map service. | Earth-observation layers are not arbitrary astrophysical images. Use only for a relevant Earth/mission-context panel. No general rate limit found. **Not a first-milestone dependency. Not tested.** [Access docs](https://nasa-gibs.github.io/gibs-api-docs/access-basics/) · [Catalog](https://nasa-gibs.github.io/gibs-api-docs/available-visualizations/) |
| NASA Eyes | NASA-hosted interactive educational experiences, e.g. Eyes on the Solar System. Embeddable URLs are documented by NASA education resources. | Hosted web application/iframe; no general data API contract identified in reviewed material. | Can add an optional “Explore the solar system in NASA Eyes” outbound/embed experience. It does not supply arbitrary user FITS or SPHEREx observations to SKYTRACE's renderer. | Controlled by NASA's app and data scope; embedding does not create a source-data integration. **Optional education link. Not tested.** [NASA Eyes for Museums](https://science.nasa.gov/eyes/museums/) |
| WorldWide Telescope (WWT) | WWT WebGL Engine, Research App, `pywwt` and web embedding/control documentation. | WebGL engine and documented JS/TS messaging; astronomical imagery/layers supported by WWT data ecosystem. | Potential future sky-view engine or embedded research view, subject to ensuring the target FITS/product format maps to WWT's supported layer/data formats. | Not a NASA archive API and not a plug-in SPHEREx FITS viewer by default. Custom overlays and data conversion need compatibility testing. **Evaluate after typed visualization data contract. Not tested.** [WWT docs](https://docs.worldwidetelescope.org/) · [Embed guide](https://docs.worldwidetelescope.org/research-app/latest/embedding/) |
| OpenSpace | OpenSpace JS/TS API for UIs connected to a running OpenSpace instance; Python API for scripting/data workflows. | Application APIs; deployment/runtime needed. | Useful as a desktop/immersive visualization reference or optional integration for 3D/planetarium experiences. | Not a NASA data service and not a turnkey browser widget for arbitrary observations. **Not a first-milestone dependency. Not tested.** [API docs](https://docs.openspaceproject.com/latest/building-content/api/index.html) |

## Reproducible example requests and response shapes

The following are documentation-backed request examples, not claims that every endpoint was live-tested on 2026-11-14.

### SPHEREx SIA2

```text
https://irsa.ipac.caltech.edu/SIA?COLLECTION=spherex_qr3&POS=circle+127.69444+-39.17760+0.01&RESPONSEFORMAT=HTML
```

Expected result is an SIA2 table with image rows. Important columns include `obs_id`/observation metadata, `access_url`, `cloud_access`, and collection/product fields. FITS is fetched using the returned `access_url`, not an invented separate endpoint. The earlier live app check also exercised band, date and collection query constraints against Mira.

### MAST

```json
{
  "service": "Mast.Caom.Cone",
  "params": {"ra": 254.28746, "dec": -4.09933, "radius": 0.2},
  "format": "json", "pagesize": 2000, "removenullcolumns": true, "timeout": 30
}
```

POST this request as `request=<JSON>` to `https://mast.stsci.edu/api/v0/invoke`. The response envelope includes `status`, `msg`, `data`, and metadata; product searches return fields such as `obsid`, `dataURI`, `productFilename`, and collection identifiers. Example product download is `https://mast.stsci.edu/api/v0.1/Download/file?uri=<dataURI>`.

### Exoplanet Archive TAP

```text
https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=select+pl_name,pl_masse,ra,dec+from+ps&format=json
```

Expected JSON response is tabular, with column descriptors and rows/objects for requested planet and coordinate fields. Real field names must be checked against TAP schema/data-column documentation before product code consumes them.

### JPL Horizons and SBDB

```text
https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND=%27499%27&MAKE_EPHEM=%27YES%27&EPHEM_TYPE=%27OBSERVER%27&CENTER=%27500%40399%27&START_TIME=%272026-01-01%27&STOP_TIME=%272026-01-03%27&STEP_SIZE=%271%20d%27&QUANTITIES=%271,9,20,23,24,29%27
https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=433
```

Horizons returns a JSON `result` text block plus `signature` metadata (including API version); parse the requested table with documented column/quantity definitions, and persist center/time-scale parameters. SBDB returns a JSON object with `object`, orbit and optional physical/uncertainty data. A missing sigma is not zero uncertainty.

### NASA Image and Video Library

```text
https://images-api.nasa.gov/search?q=Orion&media_type=image
https://images-api.nasa.gov/asset/<nasa_id>
```

Search responses use `collection.items[]`, with item `data[]` metadata and `links[]`; asset responses list media URLs. Preserve `nasa_id`, title, description/credit, media type and asset URL.

### GIBS WMS (Earth science context only)

```text
https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?service=WMS&request=GetMap&version=1.1.1&layers=MODIS_Terra_CorrectedReflectance_TrueColor&styles=&format=image/jpeg&time=2020-01-01&srs=EPSG:4326&bbox=-180,-90,180,90&width=512&height=256
```

The result is an image/map for the requested Earth-science layer, time, extent and projection. This is not an astronomical sky image.

## Visualization data contract fields

Every normalized plotted datum should carry `provider`, `dataset_id`, `source_url`, `record_id`, `record_type`, coordinate value plus frame/epoch, observation start and time scale, measurement name, original value and unit, uncertainty and uncertainty unit when supplied, quality flags, band/wavelength, processing version, and retrieval timestamp. Display conversions must retain original values/units and document conversion. Missing uncertainties remain missing. An illustrative fixture has a separate type/source label and cannot share a “real data” badge.

## Recommended first integration milestone

1. Keep the existing IRSA SIA2 path for SPHEREx image observations and provenance; it is already live-tested in SKYTRACE.
2. Build a provider-neutral visualization response for archive image cutouts and metadata before adding additional archives.
3. Add MAST image/spectrum browsing as the next independent archive, starting with public product discovery and download manifests.
4. Add Exoplanet Archive TAP as a separate catalog mode with schema discovery and units/uncertainties, not as image data.
5. Add Horizons/SBDB only for explicit solar-system context with observer and epoch tracking.
6. Keep NASA Image Library, GIBS, NASA Eyes, WWT and OpenSpace optional education/reference integrations until a specific product need and data-format mapping are confirmed.
