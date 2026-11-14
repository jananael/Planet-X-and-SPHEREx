# Y2 PR #2 Contract Reconciliation

**Date:** 2026-11-13

**Scope:** Reconcile `codex/y2-source-detection` with current `main` and Measurement Contract `0.2-draft`. PR #2 was not merged to `main`, approved, or pushed.

## A. Initial repository state

- **Branch:** `codex/y2-source-detection`
- **Initial HEAD:** `51be56acb3a64f48f452af150fa4330ffafe7c51` (`fix: treat SPHEREx SOURCE flags as informational`)
- **Current base before integration:** fetched `origin/main` at `a18b0eae29b9639d39a4a1fad6e1a75f08ad27e2`.
- **Relationship:** `origin/main` had 7 commits not in the PR branch; the PR branch had 3 commits not in `origin/main`. They diverged from `51336d3`; GitHub had reported the PR as not mergeable.
- **Existing worktree changes preserved:** edits to `docs/science/source-detection-validation-2026-11-13.md` and `docs/source-detection.md`; Y2 validation scripts, manifests, science reports/templates, and files already under `docs/project/`. None were reset, cleaned, or overwritten.
- `5c12c0f` is included in fetched main. Its schema requires `release` and `processing_version` for non-mock detections, summarizes releases from detections, and uses `model_fields_set` to distinguish omitted `observation_ids` from an explicitly empty list.

## B. Changes implemented

- Integrated current `origin/main` into the PR branch locally, preserving both sides' history. The only textual merge conflict was `backend/app/routers/candidates.py`; the resolved route retains PR band/pipeline filtering and main's `CandidateAnalysis` execution metadata. This integration is local only; no remote branch or PR state was changed.
- Added `source_file` and `archive_id` to `EngineFrame`. `RealSource.candidates()` fills them from the same `SiaRecord` used to fetch each frame (`source_file` and `publisher_did`). No values are guessed or copied from another frame.
- `SourceDetectionEngine` now copies that frame's `release`, `processing_version`, `source_file`, and `archive_id` into every corresponding Detection. Existing `EngineRequest` behavior rejects unknown/unsupported pipeline metadata; the current Candidate contract rejects real results missing release or processing version.
- Removed first-frame release selection from engine Candidate construction. The current Candidate validator derives `data_release` from the set of all detection releases (including mixed `DR1+QR3`) and rejects a conflicting explicit summary.
- Removed first-observation release selection from mock Candidate construction; the validator derives the summary across its detections. Mock results remain marked `is_mock=True` and retain their synthetic flux behavior.
- Preserved main's observation ID semantics: omitted IDs derive from detections; explicit empty, duplicate, and mismatched IDs are rejected.
- Added test assertions for per-frame provenance values, real API provenance from its source records, and mixed-release summaries. No SNR, mask, background, matching, astrometry, photometry, or motion behavior was changed.

## C. Tests and validation

| Command | Result | Passed | Failed | Skipped | Notes |
|---|---:|---:|---:|---:|---|
| `PYTHONPATH=app /private/tmp/skytrace-y2-venv/bin/python -m pytest -q tests/test_candidate_contract.py tests/test_source_detection.py tests/test_real_source.py tests/test_api.py` (from `backend/`) | Passed | 100 | 0 | 3 | One Starlette/httpx deprecation warning. |
| `PYTHONPATH=app /private/tmp/skytrace-y2-venv/bin/python -m pytest -q -rs` (from `backend/`) | Passed | 100 | 0 | 3 | Full backend suite. Skips are 2 live IRSA tests and 1 live cutout test requiring `RUN_NETWORK_TESTS=1`. |
| `/private/tmp/skytrace-y2-venv/bin/python -m py_compile ...` on modified backend Python modules/tests | Passed | — | — | — | All listed modules compiled. |
| `git diff --check` and `git diff --cached --check` | Passed | — | — | — | No whitespace errors. |
| `npm run typecheck` (from `frontend/`) | Not run successfully | — | — | — | Tool invocation failed: `tsc: command not found` (exit 127); this is not a TypeScript pass. |

## D. Remaining issues

- TypeScript validation remains unverified because this environment lacks `tsc`/frontend dependencies. Backend/API tests do pass against the merged main response contract.
- Live IRSA retrieval tests remain opt-in and were skipped; the deterministic real-source tests use stubbed archive responses and FITS fixtures.
- This change does not address scientific validation or unrelated engineering follow-ups such as persistence, cutout coverage, independent astrometry, source association, motion analysis, or ML.

## E. Final decision

**READY FOR REVIEW**

The branch now contains current main's Measurement Contract and API response changes, the real-data path carries each frame's own provenance to its Detection, and the full backend suite passes. Review should note that frontend TypeScript validation and live IRSA tests were unavailable in this run. No scientific algorithm behavior was changed.

## F. Recommended next step

Run the frontend typecheck in an environment with the repository's locked frontend dependencies installed, then review the local branch diff before deciding whether to update PR #2.
