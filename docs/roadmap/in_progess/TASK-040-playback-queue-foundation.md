Epic: docs/roadmap/epics/EPIC-003-playback-queue.md

# TASK-040 Playback queue foundation

## Description
Introduce a shared playback queue context that persists locally, exposing helpers to enqueue stories, insert the next item, clear the queue, and manage loop modes (`NONE`, `REPEAT_ONE`, `REPEAT_ALL`). Hydrate the queue from AsyncStorage on launch and make it available throughout the app.

## Plan
- Add `STORAGE_KEYS.PLAYBACK_QUEUE` (and loop mode) to `services/config.js`.
- Implement `context/PlaybackQueueProvider` with internal reducer/state for `queue`, `activeIndex`, `loopMode`, `lockedStoryId`, plus AsyncStorage hydration & persistence.
- Export hooks (`usePlaybackQueue`, `usePlaybackQueueDispatch`) that surface enqueue/insert/remove/clear/advance/retreat/setLoopMode helpers with sensible batching/debouncing.
- Wrap the root tree in `app/index.js` with the new provider and ensure context hydration happens before dependent components render.
- Add Jest coverage for queue reducer helpers (enqueue, insert-next, advance with loop modes, persistence serialization).

## Definition of Done
- Queue provider and hooks exist with unit tests covering core mutations and loop logic.
- Queue state rehydrates after app restart (verified via manual test or debug logs).
- No existing views break when provider wraps the app; lint/test suites pass.
