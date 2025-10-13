# Task & Context
Add "resume playback" support so each story restarts from the last listened position, regardless of whether audio is cached locally or streamed/redownloaded.

## Current State (codebase scan)
- `screens/SynthesisScreen.js` orchestrates story selection, audio loading via `voiceService.getAudio`, and renders `AudioControls`.
- `hooks/useAudioPlayer.js` wraps Expo Audio, tracks `position`, `duration`, autoplay, and exposes playback controls plus `loadAudio`, `unloadAudio`, etc.
- `components/AudioControls.js` shows the player UI; slider changes call `onSeek`.
- `services/voiceService.js` persists local audio metadata and cached downloads to AsyncStorage (`STORAGE_KEYS.DOWNLOADED_AUDIO`).
- No persistence exists for playback position; when a story loads, playback always starts at time `0`.

## Proposed Changes (files & functions)
- `services/voiceService.js` or a new util: define a new AsyncStorage key (e.g. `STORAGE_KEYS.PLAYBACK_PROGRESS`) with helpers to read/write per-story progress.
- `hooks/useAudioPlayer.js`: expose a way to notify listeners of position updates (e.g. callback or event) and accept an initial seek position when loading audio without breaking autoplay.
- `screens/SynthesisScreen.js`: integrate progress persistence—on periodic updates or pause/unload, store `{ storyId, position, duration, updatedAt, localUri }`; when loading a story, restore last position if valid. Handle both cached (`localAudioUri`) and freshly downloaded URIs.
- `components/AudioControls.js`: ensure seek slider interactions trigger saves (e.g. on release).
- Optional: `utils/audioUtils.js` if shared helpers are needed (e.g. sanitizing URIs).

## Step-by-Step Plan
1. Define storage helpers:
   - Introduce new storage key (`voice_service_playback_progress`).
   - Create helper functions (get/save/clear) for story playback state keyed by `voiceId` + `storyId`.
2. Update `useAudioPlayer`:
   - Allow `loadAudio` to accept an optional `startPosition` (seconds) and seek automatically before autoplay.
   - Add a subscription/callback (e.g. `onStatus` or expose status via ref) so consumers can persist progress periodically (e.g. every 2–3 seconds or on pause).
3. Wire persistence in `SynthesisScreen`:
   - When loading a story, fetch saved progress and pass `startPosition` to `loadStoryAudio`.
   - On playback progress (using callback from hook) update AsyncStorage (throttle/debounce writes).
   - On completion (position close to duration) clear stored progress so next play starts from 0.
   - Ensure state updates work for locally cached files, server URIs, and downloads (possibly normalized via story IDs and voice IDs).
4. Handle seek & pause events:
   - When user seeks or pauses/stops, immediately persist the new position.
   - When audio is unloaded (story change), ensure final position is saved.
5. Testing & adjustments:
   - Verify switching between stories resumes correctly.
   - Confirm progress is cleared when generating new audio or when story finishes.

## Risks & Assumptions
- Resume point might become invalid if story audio is regenerated (URI changes); need to clear progress when audio URL changes or when `hasServerAudio` triggers a new download.
- Frequent writes to AsyncStorage could impact performance; plan to throttle/debounce.
- Must ensure autoplay still works when resuming mid-story.
- Expo Audio seeking right after load can fail; may need to await `status.isLoaded` inside `loadAudio`.

## Validation & Done Criteria
- Selecting a previously played story resumes near the saved position (±1 second) for both cached and freshly downloaded audio.
- Generating new audio resets progress (starts at 0).
- Switching stories mid-playback does not produce errors, and newly selected story auto-plays from saved point.
- No regressions in manual controls (play/pause/seek slider).

## Open Questions
- Should progress sync per user across devices (API) or remain local-only? (Assumed local-only.)
Local-only
- What threshold counts as “finished” (e.g. last 5% of audio) before auto-clearing saved position?
last 5% of audio is good