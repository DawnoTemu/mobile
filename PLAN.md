# Task & Context
Design and implement a local playback queue for generated stories, including swipe-to-queue gestures, new queue management UI, autoplay sequencing, and loop controls similar to Spotify.

## Current State (codebase scan)
- `screens/SynthesisScreen.js` manages story selection/generation, audio loading (`loadStoryAudio`), and playback persistence; no concept of a playback queue yet.
- `components/AudioControls.js` renders the player UI with play/pause and seek controls but no next/previous buttons or loop toggles.
- `components/StoryItem.js` lists stories within the synthesis screen; currently only reacts to tap selection.
- `components/AppMenu.js` opens the side menu without queue navigation options.
- `hooks/useAudioPlayer.js` wraps Expo Audio playback but exposes no queue integration hooks; playback completion is handled in `SynthesisScreen`.
- `styles/colors.js`, `services/voiceService.js`, and configuration files have no queue-related helpers or storage keys.

## Proposed Changes (files & functions)
- Add a queue state manager (new `context/PlaybackQueueProvider.js` plus hook) using AsyncStorage for persistence (`STORAGE_KEYS.PLAYBACK_QUEUE`).
- Extend `SynthesisScreen` to interact with the queue: enqueue stories, auto-fill with generated items, consume queue order when loading audio, and respect loop modes.
- Update `StoryItem` to support swipe gestures (via `react-native-gesture-handler` `Swipeable`) for “play next”/“add to queue” actions.
- Update `AudioControls` to show next/previous buttons, queue indicators, and loop toggle; wire callbacks supplied by queue context.
- Add a dedicated `QueueScreen` listing queued stories, drag-to-reorder (if feasible) or reorder/remove controls, auto-fill button, and loop mode selector; link from `AppMenu`.
- Introduce loop/lock settings (off, repeat-one, repeat-queue) stored locally and reflected in playback behaviour.

## Step-by-Step Plan
1. **Queue Infrastructure**
   - Define storage key in `services/config.js`.
   - Implement `context/PlaybackQueueProvider` maintaining queue array, active index, loop mode, and helpers (enqueue, enqueueNext, dequeue, clear, advance, retreat, autoFill, setLoopMode).
   - Expose hook for screens/components; ensure persistence with AsyncStorage and hydration.
2. **Navigation & Menu**
   - Create `screens/QueueScreen.js` to display queue list with controls (remove, clear, auto-fill, loop toggles).
   - Register screen in `navigation/AppNavigator.js` and add entry in `components/AppMenu.js` to navigate there.
3. **Story Interaction Updates**
   - Enhance `components/StoryItem` with swipe gestures (left/right) to trigger queue actions (e.g., “Play next”, “Add to queue”), considering visual affordances.
   - Update `SynthesisScreen` list rendering to pass queue callbacks and show subtle indicators when a story is queued or currently playing.
   - Add buttons (e.g., overflow menu or header) to enqueue currently selected story or auto-fill from generated stories directly.
4. **Playback Integration**
   - Modify `SynthesisScreen` playback logic to consume queue state: when playback ends, advance according to queue and loop settings; handle manual next/previous actions from audio controls.
   - Update `AudioControls` props/API to include next/prev callbacks, queue position display, and loop toggle; style icons accordingly.
   - Ensure queue respects stories requiring generation (skip or handle gracefully).
5. **Auto-Fill & Lock Behaviour**
   - Implement auto-fill to populate queue with all `hasAudio` stories (optionally shuffle? clarify) and allow locking (loop-one, loop-all, no loop).
   - Persist loop mode and currently locked story if applicable.
6. **Polish & Testing**
   - Verify queue persistence across app restarts, swipe gestures on both platforms, and playback continuity.
   - Run `npm run lint`; perform manual tests for enqueueing, advancing, loop modes, and queue screen interactions.

## Risks & Assumptions
- Swipe gestures may conflict with list scrolling; need careful threshold tuning.
- Queue auto-fill must avoid stories without audio; ensure generation state doesn’t block playback.
- Managing state between Synthesis screen and queue screen requires shared context; race conditions during hydration must be handled.
- Reordering queue might require additional library support; if complex, consider alternative (move up/down buttons).

## Validation & Done Criteria
- Users can swipe a story to add it next/upcoming without disrupting current playback.
- The queue screen lists queued stories, supports removal/clear, auto-fill, and loop mode selection.
- Audio player displays next/previous buttons and loop status; tapping advances/rewinds through the queue correctly.
- When a story finishes, the next queued story plays automatically respecting loop settings; loop-one and loop-queue behave as expected.
- Queue state persists locally (closing/reopening app retains queue and loop mode).
- `npm run lint` passes (ignoring pre-existing warnings); manual playback tests demonstrate reliable sequencing.

## Open Questions
- Should auto-fill append to existing queue or replace it entirely?
Append
- Do we need drag-and-drop reordering, or are simple “move up/down” controls sufficient?
we need drag-and-drop reorderinm and remove from queue button