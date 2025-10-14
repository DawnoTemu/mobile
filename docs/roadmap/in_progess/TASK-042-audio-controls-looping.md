Epic: docs/roadmap/epics/EPIC-003-playback-queue.md

# TASK-042 Audio controls queue & loop UX

## Description
Update the audio player to display queue position, next/previous buttons, and loop toggle states, and to trigger queue navigation callbacks provided by the playback queue context.

## Plan
- Extend `components/AudioControls` props to accept `onNext`, `onPrevious`, `loopMode`, `onToggleLoop`, and queue position metadata.
- Add UI elements (icons/buttons) for next/previous and loop cycling, ensuring accessibility labels and pressed states follow design guidance.
- Integrate queue context in `SynthesisScreen` (or a dedicated controller) to supply these callbacks, advance the queue on playback completion, and honour loop-one / loop-all behaviour.
- Handle edge cases: disabled next/prev when queue has one item, loop-one preventing auto-advance, and queue exhaustion resetting to idle.
- Update unit/component tests (if present) or document manual QA steps covering loop toggling and sequential playback.

## Definition of Done
- Audio controls show queue-aware navigation and loop UI, reflecting the current mode.
- Playback completion advances or repeats according to loop settings without user interaction.
- Manual tests confirm next/prev buttons work and gracefully handle single-item queues.
- Lint/test suites pass.

## Manual QA Checklist (draft)
- Verify queue position label updates when advancing through the queue in both minimized and expanded players.
- Tap **Następna bajka** / **Poprzednia bajka** to ensure the correct stories play, including wrap-around in repeat-all mode.
- Toggle loop mode through all states and confirm toast messaging plus icon/badge feedback.
- Let a story finish naturally in each loop mode (none, repeat-all, repeat-one) to confirm auto-advance or restart behaviour.
- Confirm skip buttons disable when the queue is empty and re-enable once items are enqueued.
