# Epic: Mobile Playback Queue & Looping

## Overview
- **Goal:** Deliver a Spotify-style playback queue so families can line up generated stories, control the upcoming order, and loop favourites without leaving the mobile app.
- **Background:** The synthesis screen today only supports one-off playback; there is no notion of “play next,” queue history, or auto-fill. Parents have asked for a calmer bedtime flow where stories just continue, plus a quick way to replay favourites.
- **Scope:** Local queue management (enqueue, enqueue-next, remove, clear), auto-fill with generated stories, loop controls (off / repeat-one / repeat-all), and next/previous navigation in the audio player. All logic stays on-device; no backend changes required.
- **Non-goals:** Cloud sync of queues, collaborative playlists, or recommending new stories beyond the existing catalogue.

## Current State
- `SynthesisScreen` treats each story selection as the only playback target; when audio ends, playback simply stops.
- `AudioControls` lacks next/previous buttons and has no affordances for loop modes or queue position.
- Story list items respond only to taps; there is no swipe gesture for “play next” or “add to queue.”
- The menu does not surface any queue management view, so users cannot reorder or prune upcoming stories.
- Playback persistence only stores resume points per story; there is no stored queue or loop mode.

## Drivers & Rationale
- Bedtime routines benefit from uninterrupted playback; parents want to queue multiple stories without constant interaction.
- Kids often want to hear a favourite story repeatedly; loop-one provides that without manual seeking.
- Auto-fill lets parents quickly line up everything already generated, matching the “downloaded episodes” flows seen in podcast apps.
- A dedicated queue view gives transparency and avoids surprises (“why did that story start?”).

## Requirements & Constraints
- **Local Only:** Queue state must persist in AsyncStorage but never hit the API; app should hydrate on launch.
- **Gestures:** Swipe actions on story cards (or an alternative affordance if gestures conflict) to enqueue next / add to end.
- **Navigation:** Add “Queue” entry to the in-app menu leading to a queue management screen.
- **Controls:** Audio player shows next/previous buttons, loop toggle, and queue position (e.g., “2 of 5”).
- **Auto-Fill:** One-tap button to populate queue with every story that has `hasAudio || hasLocalAudio`; warn if nothing is available.
- **Loop Modes:** Support `NONE`, `REPEAT_ONE`, `REPEAT_ALL` with clear iconography and persisted selection.
- **Skip Logic:** Automatically skip stories missing audio (e.g., deleted server files) and notify the user.
- **Accessibility:** All queue actions need accessible labels and work with screen readers.

## Deliverables
1. Queue state manager (context + AsyncStorage) with helpers to enqueue, insert-next, remove, clear, and advance/retreat respecting loop mode.
2. Updated synthesis list items with swipe/tap affordances to add stories to the queue and visual markers for queued/current items.
3. Enhanced audio controls with queue navigation buttons, loop toggle, and queue position display.
4. New queue management screen reachable from the main menu (view, reorder/remove, auto-fill, loop selector).
5. Documentation + QA checklist covering queue persistence, looping behaviour, and edge cases (empty queue, missing audio, story regeneration).

## High-Level Approach
1. Implement `PlaybackQueueProvider` context with AsyncStorage persistence (`STORAGE_KEYS.PLAYBACK_QUEUE`) for queue array, active index, loop mode, and lock state.
2. Wire provider around the app root (`app/index.js`) and expose hooks for synthesis screen, audio controls, and queue screen.
3. Integrate queue actions into `SynthesisScreen` (auto-fill, enqueue, advance on completion) and `AudioControls` (next/prev, loop toggle).
4. Build `QueueScreen` with flat list, remove/clear buttons, optional reorder controls (drag or move up/down), and loop selection UI.
5. Polish UX (animations, toasts, badges) and add targeted Jest coverage for queue helpers; run lint + manual playback scenarios on both platforms.

## Risks & Mitigations
- **Gesture Conflicts:** Swipe gestures may interfere with list scrolling → test velocity thresholds and provide fallback buttons if necessary.
- **State Drift:** Queue could reference stories that lose audio (e.g., deleted files) → validate each item before playback and auto-prune invalid ones.
- **Persistence Bugs:** AsyncStorage writes must be throttled to avoid race conditions → batch updates and guard against stale hydrations.
- **Reordering Complexity:** Full drag-and-drop may be heavy; if time-constrained, fall back to move up/down buttons with clear UX copy.

## Open Questions
- Should auto-fill append to the existing queue or replace it entirely? (Default proposal: replace, with confirmation toast.)
- Do we need shuffle mode for the queue, or is sequential playback sufficient for v1?
- Should the queue remember stories freshly generated during the session automatically, or only when users explicitly enqueue them?
