# Evidence Story — Follow the Evidence

## Experience

Evidence Story is mounted once, immediately below the existing image/video viewer
on `/observations`. The homepage, navigation and viewer controls were not redesigned.
The investigation desk pairs an actual loaded observation (and an actual reference
when available) with a large state-derived scientific statement and one main action.
No candidate marker is drawn without an accurate pixel/WCS mapping.

Four connected keyboard-accessible tabs — Image Quality, Alignment, Spectral
Compatibility and Uncertainty — update one shared explanation area. Candidate
selection updates the lens, references, measurements, flags and next-step guidance.
Unknown checks remain unknown; metadata overlap is not certified compatibility.
Missing bandwidth is visibly estimated. TRANSIENT zero remains zero, missing is
Unknown. Uncertainty is paired with a value only with a reported unit and a valid,
nonnegative error. Mock results remain explicitly synthetic.

Candidate dossiers have actual supporting previews where already loaded, IDs,
coordinates, time, status, classification, an example reported flux (not an invented
measurement), reliability labels and the View Evidence in Images action. Full
existing metadata, science values, errors, flags and limitations are retained under
Advanced Scientific Details, reusing the original CandidateCard and provenance.

## Evidence-to-viewer integration

The existing candidate client still uses `GET /api/candidates?ra&dec&radius=0.5`.
It is a regional query, not an analysis of the user's selected dates or comparison.
Execution metadata and errors remain distinct from measurement/candidate validity.

View Evidence in Images resolves exactly the candidate's `observation_ids`. Known
search metadata is reused; missing metadata is requested through the existing
`GET /api/observations/{id}` client. Every reference must resolve and match before
the selection is changed; missing/invalid/cancelled references never substitute
unrelated images. After metadata succeeds the existing image loader selects those
observations, resets to Images mode and scrolls/focuses the viewer. Comparison
stays off until the user chooses it: multi-band candidates are not automatically
presented as scientifically compatible. Actual image load/coverage failures appear
through the existing viewer error and retry interface.

Changing candidates cancels an outstanding evidence request. Location/source and
manual selection changes also cancel it. Lens previews are filtered by exact IDs.
The explicit candidate-to-viewer handoff can retain the regional result for its
exact supporting selection; ordinary manual selection edits still invalidate old
analysis. Candidate/source/location changes never reuse another candidate's image.

## Scientific states and dependencies

State-derived headlines cover not analyzed, requesting, queued, processing,
completed with/without candidates, insufficient evidence, failed, unavailable,
network failures and no coverage. Candidate labels retain pending validation,
known object, artifact and rejection. No contract field supports a certified
validated detection or verified measurement, so neither is inferred.

The local Node preview returns `501 NOT_IMPLEMENTED` for candidates; the real
scientific engine remains a backend dependency. Evidence Story does not create
another synthetic candidate API. Existing Python contract fixtures are used only
by automated tests. WCS validity, precise candidate image coordinates, calibration
certification, statistical/systematic error classification and confidence levels
are not supplied and are disclosed as missing. PNG previews are not flux data.

## Files

- New `frontend/components/evidence-story.tsx`: lens, verdict, strip, dossiers,
  contextual guidance, advanced-details container.
- New `frontend/components/evidence-story.css`: responsive editorial layout,
  focus/selection states and reduced-motion handling.
- New `frontend/lib/evidence-story.ts`: verdicts, evidence dimensions, exact frame
  association and all-or-nothing supporting metadata resolver.
- `frontend/components/scientific-evidence.tsx`: reused API/state controller and
  original technical details, candidate-to-selection handoff.
- `frontend/components/explorer.tsx`: real viewer callback, cancellation and
  current/reference frame connection.
- New `frontend/tests/evidence-story.test.ts` and updated
  `frontend/tests/scientific-render.test.ts`.
- This report.

## Actual verification — 2026-11-14

`npm run typecheck` passed. `npm run test`: 56 passed, zero failed. Tests cover
execution/candidate states, no inferred confirmation, missing result versus empty
completion, exact candidate image association, unknown quality/WCS versus zero
TRANSIENT, metadata reuse, ID mismatch/missing metadata/cancellation rejection,
SSR tab/panel structure and empty-state/provenance rendering, plus existing API,
viewer loading, uncertainty and selection regressions. `npm run build` passed.
`git diff --check` was run. There is no configured lint script.

Actual HTTP: `/observations?ra=210.4&dec=-11.85` returned 200 with Evidence Story
and all four dimensions. Local API health reported mock/node-ui-preview;
candidate request returned 501, correctly indicating the absent analysis engine.

The browser host is unavailable. Desktop/mobile visual QA, keyboard interaction,
real-time tab changes and complete candidate-to-viewer click-through have not
been browser-tested. Unit/API/SSR checks do not establish that interactive QA.
No real scientific candidate success or screen recording is claimed.

Upload integration check: incorporated Jana's newer explanation/sky-story features,
preserved their unmount cleanup, and made evidence navigation return to the actual
image view when an explanation is open. The merged frontend suite passed all 71
tests; TypeScript and production build also passed.

For manual review, search a location and load images in `/observations`. Inspect
the lens and switch evidence tabs; request analysis to see the honest unavailable
state in Node preview. With FastAPI mock or a connected real engine, select a
returned dossier and View Evidence in Images. Verify selected IDs, metadata and
viewer errors; try missing coverage, keyboard arrows/Home/End, narrow widths and
reduced motion. Synthetic measurements must remain visibly labeled.
