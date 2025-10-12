Epic: docs/roadmap/epics/EPIC-002-elastic-voice-slots.md

# TASK-031 Elastic slot API foundation

## Description
Update the networking layer so `voiceService` can interpret the elastic voice-slot responses. Expose response headers, normalize numeric versus legacy voice identifiers, and add persistence primitives for in-flight generation state.

## Plan
- Extend `services/config.js` with storage keys for active generation metadata (status, queue metrics, timestamps).
- Teach `apiRequest` to surface response headers and tolerate stringified numeric voice IDs without breaking existing callers.
- Introduce small persistence helpers (save/load/clear) for per-voice/story generation state in `AsyncStorage`, including TTL handling.
- Define JS/TypeScript shapes (or validation helpers) that mirror the OpenAPI `AudioSynthesisResponse`/`VoiceSlotMetadata` contract, capturing fields like `service_provider`, `queued`, and `allocated_at`.
- Document the new response shape and storage contract for downstream consumers.

## Definition of Done
- `apiRequest` returns headers alongside body data, and existing consumers continue to function.
- New storage helpers persist and retrieve generation metadata with tests or usage examples.
- Numeric voice IDs are parsed/stored without regressing ElevenLabs ID handling.
- PLAN.md/epic requirements are reflected in inline comments or docs so other tasks can build on the foundation.
