Epic: docs/roadmap/epics/EPIC-002-elastic-voice-slots.md

# TASK-032 Voice generation workflow refactor

## Description
Refactor `voiceService.generateStoryAudio` and related helpers to honor the multi-stage elastic workflow. Loop on POST responses, interpret `AudioSynthesisResponse`, capture queue headers, and clear persisted state once audio is ready or errors out.

## Plan
- Rework `generateStoryAudio` to repeat POSTs while status is `queued_for_slot`/`allocating_voice`, transitioning to HEAD/GET polling during `processing`.
- Map backend statuses to localized keys and propagate structured callbacks (status, queue position/length, message, progress hints) to callers.
- Persist each status transition with timestamps, remote voice IDs, `service_provider`, and queue metrics for resume-after-background scenarios.
- When an `id` is returned, fold `/audio/{audio_id}/status` polling into the resume flow so backgrounded sessions can query a lightweight endpoint.
- Handle HTTP edge cases (402, 503, timeouts) without double-charging credits, ensuring retries respect cached state.

## Definition of Done
- Service returns structured status updates covering the four enum values plus relevant headers.
- Persisted state survives app restarts and cleans up once synthesis succeeds or hard-fails.
- Queue metrics, remote voice IDs, and provider metadata are accessible to UI layers through service callbacks/results.
- Error paths (402, 503, timeout) are differentiated and tested.
