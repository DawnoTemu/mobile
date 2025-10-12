# Epic: Elastic Voice Slot Integration

## Overview
- **Goal:** Align the Expo mobile client with the elastic voice-slot backend so synthesis requests surface new statuses, queue metadata, and telemetry while keeping local state resilient across sessions.
- **Background:** Backend changes introduced just-in-time voice slot allocation, richer `AudioSynthesisResponse` payloads, and queue insight headers. The current app still expects the legacy single-stage ElevenLabs flow.
- **Scope:** Update service calls, persistence, and UI flows to represent `queued_for_slot`, `allocating_voice`, `processing`, and `ready` states, including queue position/length and remote voice IDs. Ensure resume-after-background and telemetry capture for state transitions.
- **Non-goals:** Push notifications, deep admin tooling, or re-architecting offline storage beyond what is needed for voice generation continuity.

## Current State
- `services/voiceService.js` posts to `/voices/{id}/stories/{id}/audio` once, treats all in-flight work as “processing,” and ignores response headers and ElevenLabs allocation info.
- The service cache only stores downloaded audio URIs; there is no persistence for queue position, status history, or retry timestamps.
- `screens/SynthesisScreen.js` owns the generation UX with a simple two-phase progress modal and an in-memory `processingStories` map that is lost on app backgrounding.
- `components/Modals/ProgressModal.js` surfaces generic copy and a percent bar, with no notion of slot allocation text or queue counters.
- `components/StoryItem.js` can only display a spinner when `isGenerating`, offering no inline status hints like “queued” or “allocating.”
- No Jest coverage exists for voice generation behavior; only credit flows are tested today.

## Drivers & Rationale
- Users must understand why playback is delayed (slot queue, allocation) instead of seeing an indefinite spinner.
- Queue metadata needs to reach the frontend for transparency and support coordination with backend capacity monitoring.
- Persisting voice generation context allows resuming polling without double-charging or losing progress.
- Tracking status transitions provides the telemetry necessary to monitor latency and catch regressions.

## Requirements & Constraints
- **Status Enum:** Support `queued_for_slot`, `allocating_voice`, `processing`, and `ready`, mapping them to localized Polish copy supplied by product.
- **Headers:** Parse `X-Voice-Queue-Position`, `X-Voice-Queue-Length`, and `X-Voice-Remote-ID`; prefer numeric voice IDs when present and store both legacy and numeric identifiers.
- **Response Payload:** Consume `AudioSynthesisResponse` fields (`id`, `message`, `url`) and nested `VoiceSlotMetadata` (`service_provider`, `allocated_at`, `queued`, queue stats), tolerating nullable values.
- **Polling:** Repeat POST in queued/allocation states per backend guidance, then fall back to lightweight HEAD/GET polling for `processing` until `ready` is returned.
- **Persistence:** Cache active generation state (voice/story IDs, status, queue metrics, timestamps) so the app can resume after backgrounding.
- **Telemetry:** Emit structured events for each status transition and captured queue metrics (target destination TBD with product/ops).
- **UX:** Expose queue info in both the modal and list view without overwhelming users; auto-start playback once `ready` returns with a URL.
- **Status Endpoint:** Use `/audio/{audio_id}/status` (when `id` is provided) as a resumable polling option after backgrounding or long waits.

## Deliverables
1. Expanded `voiceService` that surfaces response headers, normalizes numeric/string IDs, persists in-flight generation state, and exposes structured status callbacks.
2. Updated `SynthesisScreen` wiring to hydrate/persist status per story, display localized messages and queue counters, and gracefully handle cancel, retry, 402, and 503 conditions.
3. Refreshed progress modal (and supporting components) with copy for each status, queue position display, and recovery affordances.
4. Story list affordances that hint at queued/allocating states outside the modal so users understand what is happening at a glance.
5. Jest tests covering status parsing, header handling, persistence helpers, and “ready” flow regressions.
6. Documentation updates for manual QA, including queue-heavy scenarios, insufficient credits, and server error handling.

## High-Level Plan
1. **Service Foundation:** Enhance `apiRequest` to return headers, add persistence helpers for generation state, and normalize voice identifiers.
2. **Workflow Refactor:** Rework `generateStoryAudio`/`getAudio` to loop on POST responses, interpret `AudioSynthesisResponse` (including returned `id` and metadata), optionally consult `/audio/{audio_id}/status`, persist transitions, and clear state on completion.
3. **UI Integration:** Update `SynthesisScreen` to consume structured callbacks, revive persisted progress on mount, and surface queue info in both modal and list contexts.
4. **Component Updates:** Extend `ProgressModal` (and any new status badges) with localized copy, queue metrics, and responsive layouts.
5. **Quality Gate:** Add Jest coverage for service logic, adjust existing tests, and document manual validation steps covering all status paths and key error codes.

## Dependencies
- Backend elastic slot endpoints and headers must be deployed in environments referenced by `services/config.js`.
- Product/design confirmation for final Polish copy and queue display formatting (especially zero-based header adjustments).
- Decision on telemetry sink (Sentry breadcrumbs, analytics service, etc.) to implement event emission.
- OpenAPI definitions for `AudioSynthesisResponse`, `VoiceSlotMetadata`, `/audio/{audio_id}/status`, and admin slot endpoints remain up to date for reference.

## Risks & Mitigations
- **Polling Load:** Frequent POST retries could stress the API; mitigate with exponential backoff or server-provided retry hints if needed.
- **State Drift:** Persisted metadata may become stale if the server clears jobs; implement TTLs and sanity checks when resuming polling.
- **Timeouts:** Long-running allocation could exceed current 30s timeouts; verify and adjust request timers per status.
- **UX Complexity:** Too much status noise could frustrate users; use concise copy and show queue info only when helpful.

## Open Items
- Confirm telemetry destination and payload schema for status transitions and queue metrics.
- Determine whether queue position should be displayed one-based even if the header is zero-based.
- Align on any push notification or background fetch follow-ups (tracked separately if prioritized later).

## Definition of Done
- Users see accurate status messaging and queue data during synthesis; playback starts automatically once the backend returns `ready`.
- Numeric voice IDs are persisted without breaking legacy ElevenLabs identifiers or existing clone flows.
- In-flight generation state recovers after app backgrounding and does not double-charge credits.
- Telemetry events fire for each status change, aiding latency monitoring.
- New unit tests pass alongside the existing suite (`npm test`), and manual QA confirms queued/allocating/processing/ready plus key error codes (402, 503).
