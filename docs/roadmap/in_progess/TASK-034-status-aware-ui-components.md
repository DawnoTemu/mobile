Epic: docs/roadmap/epics/EPIC-002-elastic-voice-slots.md

# TASK-034 Status-aware UI components

## Description
Refresh `ProgressModal`, `StoryItem`, and any supporting UI so they reflect queued/allocation/processing states, queue counters, and automatic playback triggers when audio becomes ready.

## Plan
- Expand `ProgressModal` props to accept structured status data, queue metrics, and customizable copy.
- Update modal layout to show status-specific messaging, queue position (converted to one-based for display), remote voice/provider hints, and context-aware controls.
- Add list-level badges or inline text within `StoryItem` to indicate queued/allocation states without overloading the spinner.
- Ensure accessibility and responsive design considerations (screen readers, small devices) are addressed in updated layouts.

## Definition of Done
- Progress modal renders the four Polish status strings, queue counts, and meaningful progress visuals without layout regressions.
- Story list communicates queued/allocation states even when the modal is dismissed.
- Automatic playback/download triggers on `ready` without double taps, and UI resets cleanly afterward.
- Basic accessibility checks (labels, roles) succeed for the new UI elements.
