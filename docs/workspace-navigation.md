# SKYTRACE Workspace and Visualization

## Product routes

- `/`: supplied animated SKYTRACE homepage.
- `/explore`: sky location, coordinates, sky map, targets and guided stories.
- `/observations`: selected SPHEREx observations, image/video comparison and scientific evidence.
- `/visualization`: interactive educational visualization workspace with a clearly labeled local demo fixture.

The old `/machine-learning` address redirects to `/explore` for compatibility. No active ML dashboard, API, model output or candidate score is part of this workspace.

## Workspace navigation and state

The Explorer and Observations routes share one persistent layout containing the existing exploration controller. Workspace route links preserve the active coordinates and search options. Selecting observations, dates, bands, images, errors, playback, comparison and candidate-analysis state stays in the shared Explorer session. Playback and keyboard frame shortcuts remain scoped to the observations route.

The Visualization route is a separate page in the same Next.js app. It does not issue archive requests or consume Explorer results yet. Its six local modes are 3D space, sky map, spectrum, image, multi-band comparison and observation timeline. The fixture is labeled **“Illustrative Demo Data — Not Live NASA Data”** and is isolated from the real archive observation model.

## Scientific and data boundaries

The existing `/api/health`, `/api/targets`, `/api/search`, observation metadata/images, candidate analysis, explanation and journey routes remain intact. The Explorer keeps provenance, UTC timestamps, data-quality explanations, uncertainty formatting, explicit missing values and conservative candidate states. Y2 detection and validation reports remain unchanged and scientifically incomplete.

Visualization explanations state the displayed unit, usefulness, possible conclusion, limitations and source for each mode. Demo positions, pixel values, spectrum, illustrative error bars and time labels are not astronomical measurements. The renderer has no direct dependency on NASA service response shapes; provider adapters and real-data normalization are a later milestone.

## Checks

Automated frontend tests cover the visualization modes, fixture labeling and explanations. Production build and TypeScript checks verify the route and current application. Screenshot-based desktop/mobile review remains a manual step.
