# SKYTRACE frontend

Next.js App Router + TypeScript. The Explorer lives at `/explore` and follows
[`explorer-spec.md`](../docs/explorer-spec.md) and [`api-contract.md`](../docs/api-contract.md).
The dark background, purple accents, orbital brand, and pill controls follow Batool’s SKYTRACE design reference.
The Home page (`/`) is Batool’s design, ported from her Vite/React version: `components/home-page.tsx` + `app/home.css`. A small still SPHEREx telescope sits by the Earth; the large one fades in (framer-motion, once) when “See What Time Reveals” scrolls into view. Her images live in `public/skytrace/` (WebP). `/explorer` redirects to `/explore`.

## Run locally

Use Node.js 22.18+ (or a newer supported Node release). In one terminal, run the backend
using the setup in the root README. In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000/explore**. Use `localhost` in the browser, since that is the
origin allowed by the backend. The default API base is `http://localhost:8000`.
To override it, copy `.env.example` to `.env.local` and change `NEXT_PUBLIC_API_BASE_URL`.
Restart the frontend after changing environment variables.

## Where things live

- `app/explore/page.tsx`: Explorer route.
- `components/explorer.tsx`: target form, results, playback, loading and errors.
- `components/brand.tsx`: shared SKYTRACE wordmark in HTML/SVG (from Batool’s logo; font: Michroma), used by both pages.
- `app/globals.css`: shared theme and mobile layout.
- `lib/types.ts`: TypeScript data shapes corresponding to the API contract.
- `lib/api.ts`: API requests, 60-second image timeouts, first-image brightness limits,
  image decoding, and at most three concurrent image requests.
- `lib/observations.ts`: coordinate validation, visit grouping, and default selection.

Images are fetched as blobs so the frontend can read the wavelength and brightness headers.
Object URLs and obsolete requests are cleaned up when the selection changes.
Difference mode subtracts displayed PNGs from the first frame; it is a visual aid, not a flux measurement.

The font uses DM Sans when Google Fonts is available and falls back to Arial/sans-serif.
The decorative star field is CSS; no astronomical images are shown until received from the API.

## Checks

```powershell
npm run test
npm run typecheck
npm run build
```

For a manual check, select Vesta, then **Select all D3**: its three exposures are within one visit,
so the specified one-per-visit default initially selects only one. Play the comparison to see motion.
Repeat with Mira to see brightness changes. Confirm metadata and the MOCK DATA badge, try an uncovered
position, stop the backend to check error feedback, and check a 375px mobile viewport.

Implementation verification: seven automated tests, TypeScript, the production build, and HTTP checks
for `/` and `/explore` passed. Automated tests cover validation, visit selection, shared brightness
limits, request concurrency, missing coverage, and cancellation cleanup. Browser preview was unavailable
in the implementation session, so visual QA and a full comparison against the running Python backend
still need a local check.
