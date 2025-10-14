Epic: docs/roadmap/epics/EPIC-003-playback-queue.md

# TASK-041 Synthesis screen queue integration

## Description
Wire the playback queue into `SynthesisScreen` and the story list so users can enqueue content via swipe gestures or buttons, auto-fill the queue with generated stories, and see which stories are queued or currently playing.

## Plan
- Enhance `components/StoryItem` with swipe actions/wedges for “Play next” and “Add to queue,” using `react-native-gesture-handler` (`Swipeable`) or fallback buttons when gesture conflicts are detected.
- Inject queue context into `SynthesisScreen`; expose handlers to enqueue selected stories, enqueue-next, clear queue, and auto-fill with `hasAudio` stories (with toast feedback).
- Show visual indicators in the story list for items that are queued or currently active (icons, badges, or subtle color changes).
- Ensure auto-fill skips stories lacking audio; display toast if no eligible items exist.
- Add integration tests or component tests where practical; otherwise, document manual QA steps (enqueue, auto-fill, swipe interactions on iOS & Android).

## Definition of Done
- Users can add stories to the queue/next via swipe or equivalent controls in the synthesis list.
- Auto-fill button populates the queue with all playable stories and provides success/empty feedback.
- Story list displays which item is playing/queued without disrupting existing synthesis behaviour.
- Lint/test suites pass; manual QA confirms gestures work on both platforms.
