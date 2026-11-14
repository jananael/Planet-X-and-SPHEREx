# Supplied SKYTRACE homepage

Imported from `NASA.zip`, folder `NASA/dist/`.

`frontend/next.config.mjs` serves this standalone design at `/` through a rewrite.
The Explorer remains the current Next.js implementation at `/explore`.
Assets in the HTML use absolute paths; **Start Exploring** links to `/explore`.
Home links in the Explorer use standard navigation because this homepage is a
standalone HTML document, not a React Server Component.

The ZIP's older `team-repository/` copy was not imported. The original React
homepage files remain available in the source tree but are bypassed by the rewrite.

Run the project from `frontend/` with `npm run dev`, then open
http://localhost:3000. The optional mock API starts with `npm run mock:api`.
