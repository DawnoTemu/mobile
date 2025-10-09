Epic: docs/roadmap/epics/EPIC-001-mobile-story-points-integration.md

# TASK-023 Mobile synthesis screen credit integration

## Description
Enhance `SynthesisScreen`, `StoryItem`, and related components to surface per-story credit requirements, show affordability indicators, and block synthesis when the user lacks sufficient Story Points. Handle 402 responses with actionable messaging and automatic credit refresh.

## Plan
- Consume `useCredits` within `SynthesisScreen` to fetch balance on focus and refresh after synthesis attempts.
- Prefetch and cache per-story credit estimates (via `creditService`) when stories load; pass required credits + affordability flags into `StoryItem`.
- Update story action handlers to short-circuit when balance < required credits, showing guided toasts/dialogs.
- Adjust voiceService generation flow to interpret 402 responses, trigger credit refresh, and surface backend-provided messages.

## Definition of Done
- Story list visually indicates required credits and affordability; synthesis action disabled (or shows modal) when balance is insufficient.
- 402 responses produce user-facing toasts/modal with clear guidance and do not attempt redundant API calls.
- Credit balance refreshes after successful debit/refund flows, keeping UI in sync with backend.
