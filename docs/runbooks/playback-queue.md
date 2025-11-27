# Playback Queue Runbook

## Symptoms
- App stuck on stale queue items or cannot advance.
- Queue UI shows entries that no longer exist.
- Playback loops unexpectedly or skips items.

## Immediate Mitigations
1) Clear local queue state (non-destructive to stories):
   - iOS/Android dev build: open React Native DevMenu → `AsyncStorage` and clear keys `playback_queue_state` and `playback_loop_mode`, or run in JS console:
   ```js
   await AsyncStorage.multiRemove(['playback_queue_state', 'playback_loop_mode']);
   ```
   - Reopen app; queue will rehydrate empty.
2) Force queue reset from UI:
   - Open Queue screen → tap "Wyczyść" (Clear).
3) If playback stalls at end of track:
   - Toggle loop mode off/on in Audio Controls, then hit Play.

## Diagnostics
- Check Sentry breadcrumbs for `PlaybackQueue` logs (hydrate/persist failures).
- Inspect `playback_queue_state` payload size; if >100KB, trimming may have been applied (queue capped to 200 items).
- Verify storage version: queue snapshots include `version`. Mismatched versions are discarded on hydrate.

## Prevention / Long-Term
- Keep queue lengths reasonable (<200 items).
- Avoid storing large story payloads; rely on normalized queue items.
- On unexpected queue shapes, bump `QUEUE_STATE_VERSION` and add a migration path before shipping.
