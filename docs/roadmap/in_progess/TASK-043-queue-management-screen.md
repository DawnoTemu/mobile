Epic: docs/roadmap/epics/EPIC-003-playback-queue.md

# TASK-043 Queue management screen

## Description
Create a dedicated queue management screen accessible from the main menu, letting users review upcoming stories, reorder or remove items, clear the queue, trigger auto-fill, and adjust loop mode.

## Plan
- Add a new `QueueScreen` with a `FlatList` of queued stories (title, author, duration, queued order).
- Provide controls per item (e.g., swipe actions or inline buttons) to remove or move up/down; include a “Clear queue” CTA with confirmation.
- Surface queue-level actions (auto-fill, shuffle if approved, loop selector) and show current loop mode.
- Register the screen in `navigation/AppNavigator.js` and add a menu entry in `components/AppMenu.js` linking to it.
- Ensure state stays in sync with the playback queue context; consider optimistic updates with fallback if persistence fails.
- Document QA checklist (reorder, delete, clear, auto-fill, loop toggles) and accessibility review.

## Definition of Done
- Queue screen is reachable from the menu and reflects the live queue state.
- Users can remove, reorder (or at least move up/down), clear, and auto-fill the queue with visual/app feedback.
- Loop mode adjustments from the queue screen update the shared queue context immediately.
- Lint/test suites pass; manual QA confirms actions persist across app restarts.
