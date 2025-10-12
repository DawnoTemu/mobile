Epic: docs/roadmap/epics/EPIC-002-elastic-voice-slots.md

# TASK-035 Voice slot QA and telemetry

## Description
Add automated coverage and manual QA guidance for the elastic voice-slot flow, and wire telemetry so status transitions and queue metrics are observable in production.

## Plan
- Create Jest tests for service helpers covering status parsing, header extraction, `VoiceSlotMetadata` fields, persistence TTLs, and error branches.
- Mock polling flows (including `/audio/{audio_id}/status`) to verify retries, timeout behaviour, and resume-after-background scenarios.
- Implement telemetry hooks (Sentry breadcrumbs, analytics events, or agreed destination) for each status transition and queue observation; capture them through the shared `setVoiceGenerationTelemetryHandler` surface so tests can assert emission.
- Document manual validation steps: long queue scenarios, 402 payment required, backend 503 failures, admin slot dashboards, and successful ready playback.

## Definition of Done
- New Jest suites pass locally (`npm test`) and assert the critical logic paths for elastic voice slots.
- Telemetry emits structured events ready for downstream monitoring with minimal overhead.
- Manual QA checklist is published alongside the epic outlining required staging verification.
- Regression risk is reduced via documented and repeatable test coverage.

## Manual QA Checklist (draft)
- Generate audio while remaining within the queue to observe each status message and verify queue counters update.
- Trigger a 402 response on generation to ensure the UI surfaces the top-up guidance and telemetry logs the failure event.
- Simulate a 503/timeout by cancelling network and verifying the resume flow continues polling once reconnected.
- Force close the app mid-generation, reopen, and confirm the status modal resumes polling and completes automatically.
- Review Sentry (or chosen analytics sink) for the emitted `voice_generation` events, confirming phases progress as expected.
