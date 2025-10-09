Epic: docs/roadmap/epics/EPIC-001-mobile-story-points-integration.md

# TASK-019 Mobile API response refactor

## Description
Update the shared `authService` and `voiceService` request utilities so that mobile code can detect HTTP status codes (especially 402 Payment Required), differentiate timeout/offline errors, and surface backend-provided credit snapshots when present.

## Plan
- Audit current usages of `apiRequest` helpers to catalog returned shapes and error handling.
- Refactor helpers to return `{ success, data, status, code, error }` without breaking existing consumers.
- Update services/screens that consume these helpers to handle the richer object, addressing any TypeScript/Flow annotations if present.
- Verify 401 refresh logic and timeout handling still behave correctly after refactor.

## Definition of Done
- All API helper consumers compile/run without runtime regressions.
- Manual smoke tests (login, voice list, story list, synthesis happy path) succeed.
- 402 responses from mocked backend are distinct and can be handled upstream.
