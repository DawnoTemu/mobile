# Task & Context
- Sync the story text shown within the expanded audio controls with the currently playing audio, so the text automatically scrolls in step with playback and seeks.

## Current State (codebase scan)
- `components/AudioControls.js` renders the minimized/expanded player UI, including a ScrollView that displays `storyData.text` (currently fallback content) but no linkage to audio position.
- `SynthesisScreen.js` supplies `position`, `duration`, and the selected `story` object to `AudioControls`; it already tracks playback via `useAudioPlayer`.
- `hooks/useAudioPlayer.js` emits live playback status (seconds) to the screen; no direct changes needed but confirms position updates are available.
- Story objects fetched through `voiceService.getStories()` are normalized but may not yet expose a definitive text field (placeholder text is used when absent).

## Proposed Changes (files & functions)
- `components/AudioControls.js`: add refs/state to measure the story text ScrollView, watch audio `position`/`duration`, and programmatically scroll content. Introduce guards for short texts, expansion state, and user interactions (e.g., pausing auto-scroll while the user drags).
- (Optional) `voiceService.js` / `AudioControls` storyData helper: ensure we prefer a real story text field (e.g., `story.content`/`story.text`) before falling back to placeholder copy.
- (If necessary) minor adjustments in `SynthesisScreen.js` to pass the correct text field once confirmed.

## Step-by-Step Plan
1. Inspect a real story object as loaded in `SynthesisScreen` to confirm which property holds the full text; update the `storyData` helper in `AudioControls` to use it with sensible fallbacks.
2. In `AudioControls`, add refs for the ScrollView and store layout metrics (`contentHeight`, `containerHeight`), capturing them via `onContentSizeChange` and `onLayout`.
3. Implement an effect that reacts to changes in `position` (seconds) and `duration`, computing a target scroll offset (e.g., linear proportion) and calling `scrollTo` when the expanded view is visible and auto-scroll is allowed.
4. Add protections for user interaction: track when the user begins dragging the ScrollView or scrubber and temporarily suspend auto-scroll, resuming after the interaction ends or after a short delay.
5. Reset scroll position when a new story loads or when playback stops/rewinds to the start, ensuring a smooth restart.
6. Validate on simulator/device: play audio, watch the text follow playback, seek via slider, and confirm the ScrollView jumps to the corresponding section without jitter.

## Risks & Assumptions
- Assumes stories include a reliable full-text field; if not, syncing can only operate on placeholder text.
- Linear position-to-scroll mapping may drift if narration timing is uneven; this plan does not introduce per-sentence timestamps.
- Automated scrolling while users read could feel abrupt; may need easing or throttling to avoid jumpiness.

## Validation & Done Criteria
- When audio plays, the story text automatically scrolls forward, keeping the current passage in view while expanded.
- Seeking (via slider or skip buttons) scrolls the text to the corresponding location.
- Manual ScrollView interaction does not fight with auto-scroll; once the user stops interacting, auto-sync resumes.
- No regressions to audio playback controls or minimized player behavior.

## Open Questions
- Which property on the fetched story payload should represent the authoritative text? (Confirm before coding.)
content
- Should auto-scroll run while the player is minimized, or only when the expanded view is open?
only when the expanded view is open
