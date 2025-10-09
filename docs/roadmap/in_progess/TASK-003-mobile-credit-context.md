Epic: docs/roadmap/epics/EPIC-001-mobile-story-points-integration.md

# TASK-021 Mobile credit context & hook

## Description
Build a shared credit provider/hook (`useCredits`) that consumes `creditService`, stores balance/unit/lot/transaction state, exposes refresh and optimistic mutation helpers, and delivers stale-state messaging to UI consumers.

## Plan
- Define context provider wrapping the app (likely in `app/index.js` or a new provider module) with initial state sourced from `creditService`.
- Implement hook functions (`useCredits`, `useCreditActions`) returning balance data, loading/error flags, refresh method, and optimistic debit/refund helpers.
- Ensure provider reacts to focus/app lifecycle events to refresh when appropriate while avoiding excessive network calls.
- Add unit tests covering reducer/state transitions, optimistic updates, and error handling.

## Definition of Done
- Provider integrated at app root and accessible to screens/components without prop drilling.
- Hook returns up-to-date balance/unit label and exposes `refreshCredits` with loading/error indicators.
- Tests validate context initialization, refresh success/error paths, and optimistic update rollback.
