# Task & Context
- Integrate the mobile client with the elastic voice-slot workflow so audio generation reflects new backend statuses, queue metadata, and persistence/telemetry expectations.

## Current State (codebase scan)
- `services/voiceService.js` drives story generation via `POST /voices/{id}/stories/{id}/audio` followed by HEAD polling; it treats everything as a generic “processing” step, does not read response headers, and only remembers downloaded audio/local URIs.
- `services/config.js` exposes storage keys and stores a single voice identifier (typically the ElevenLabs ID) with no slot metadata cache.
- `screens/SynthesisScreen.js` invokes `voiceService.getAudio`, shows a simple two-phase progress modal, and tracks in-flight generations in-memory without surviving app backgrounding.
- `components/Modals/ProgressModal.js` renders static copy and a percent bar—no support for the queued/allocating/processing messaging or queue position.
- `components/StoryItem.js` only toggles a spinner via `isGenerating`; users never see detailed status transitions in the list.
- Test coverage for voice flows is absent (`services/__tests__` only covers credits).

## Proposed Changes (files & functions)
- `services/config.js`: add storage keys for active generation metadata (status, queue metrics, timestamps).
- `services/voiceService.js`: return headers from `apiRequest`, normalize numeric/string voice identifiers, parse `AudioSynthesisResponse`, persist status snapshots, capture queue headers, and refactor `generateStoryAudio`/`getAudio`/polling to honor the new enum states and remote voice IDs.
- `screens/SynthesisScreen.js`: consume richer status callbacks, manage per-story generation state (including restoring persisted progress on mount), surface queue copy (“Miejsce w kolejce: X/Y”), and reset when ready/errors occur.
- `components/Modals/ProgressModal.js` (plus any supporting component): accept structured status info, render the four localized messages, queue counters, and context-specific progress indicators/cancel actions.
- `components/StoryItem.js`: accept optional status badges or text so queued/allocating items communicate their state outside the modal.
- New Jest coverage (`services/__tests__/voiceService.elastic.test.js` or similar) for status parsing, persistence, and queue header handling; add utilities/mocks as needed.
- Optional helper (`hooks/useVoiceGenerationStatus` or utility module) to encapsulate persistence + telemetry logic if it grows complex.

## Step-by-Step Plan
1. Service groundwork: update `apiRequest` to surface headers and cope with numeric IDs, introduce persistence helpers (`saveGenerationState`, `loadGenerationState`, `clearGenerationState`) and telemetry stubs for status transitions.
2. Generation workflow: refactor `generateStoryAudio` to loop on POST responses, map backend status/headers to user-facing payloads, persist each transition, and fall back to HEAD/GET polling only once `processing`/`ready` states are reached; adjust `getAudio` to forward structured callbacks and clear stored state when finished.
3. UI integration: rework `SynthesisScreen` to manage per-story status objects (hydrated from persistence on mount), update modal state via the new callback signature, show queue position/length, and ensure cancel/timeout/error flows reconcile with stored metadata and credit refreshes.
4. Component refresh: enhance `ProgressModal` (and `StoryItem` or a new banner) to display localized copy for each status, queue info, and appropriate progress visuals; ensure layout adapts gracefully on small screens.
5. Validation: add Jest tests for service parsing/persistence, update or add UI tests/mocks if feasible, and document manual test passes covering queued/allocating/processing/ready, 402/503 errors, resume-after-background, and telemetry capture.

## Risks & Assumptions
- Relying on repeated POSTs for polling assumes backend idempotency as described; if a GET endpoint exists it must be confirmed.
- Need clarity on whether queue headers are zero- or one-based for user display; may require adjustment.
- Persisting multiple concurrent generations must avoid race conditions or stale status writes.
- Long-lived polling could interact poorly with the existing 30s request timeout; may need tunables per status.
- Telemetry destination (Sentry vs new service) is unspecified and could change scope.

## Validation & Done Criteria
- Users see the four specified Polish status messages with queue data when available, and playback triggers automatically once `ready`.
- Numeric voice IDs are stored/preferred without breaking legacy ElevenLabs IDs or existing cloning flows.
- In-flight generation state survives app backgrounding and resumes polling until completion or failure.
- Queue metrics and status transitions are logged/telemetry-friendly for latency monitoring.
- New unit tests for voice service status handling pass alongside the existing suite (`npm test`).

## Open Questions
- Which endpoint should the client poll between POST attempts—repeat POST, a dedicated status GET, or both?

  Use the existing POST loop—you can safely re-issue the same POST /voices/{voice_id}/stories/{story_id}/audio every 15‑20 s
  until it returns processing or ready. The controller is idempotent (credits are already held, the queued job persists), so
  you don’t need an extra status endpoint. If you want a lighter call while the job is “processing”, you can fall back to the
  existing GET /voices/{voice_id}/stories/{story_id}/audio (200 = ready, 404 = not yet stored).


- Should queue position be converted to one-based for the UI even if headers are zero-based?
  Yes, convert to one-based before showing it. The backend reports zero-based to keep math simple (X-Voice-Queue-Position and
  voice.queue_position). Display queue_position + 1 and the overall size from queue_length.

- Where should telemetry events be emitted (Sentry breadcrumbs, a new analytics service, or temporary logging)?
  Keep it simple short-term:

  - Drop a breadcrumb in Sentry whenever you receive queued_for_slot, allocating_voice, processing, and ready (include queue
    info so support can inspect a user’s journey).
  - We don’t have any other analytics wired yet, so also log them locally (console/network inspector) while dogfooding, then move to my analytics service for production.
