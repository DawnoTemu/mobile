Epic: docs/roadmap/epics/EPIC-002-elastic-voice-slots.md

# TASK-033 Synthesis screen status integration

## Description
Wire the enriched generation callbacks into `SynthesisScreen` so users see localized status copy, queue metrics, and resilient progress states that survive navigation or backgrounding.

## Plan
- Load persisted generation metadata on mount and merge it with freshly fetched story data.
- Track per-story status objects that feed both list badges and the progress modal, updating them as service callbacks arrive.
- Restore polling when the app returns to foreground if any story is mid-generation, respecting retry intervals.
- Surface additional metadata (e.g., service provider, allocation timestamps) when useful for debugging/support without overwhelming users.
- Ensure cancel, retry, and credit refresh flows reconcile with the new status model.

## Definition of Done
- Synthesis screen displays the four localized Polish status messages and queue position/length when provided.
- Resuming the app mid-generation continues polling without duplicate charges or stale UI.
- Queue metrics, provider hints, and status text remain in sync across list items, modals, and toast notifications.
- Credit refresh and error handling behaviours remain intact with updated flow.
