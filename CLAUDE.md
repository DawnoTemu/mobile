# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

- **Run**: `npm start` (Expo Metro bundler)
- **iOS**: `npm run ios` (build and launch iOS app)
- **Android**: `npm run android` (build and launch Android app)
- **Web**: `npm run web` (browser preview)
- **Tests**: `npm test` (single test: `npm test -- -t "test name"`)
- **Lint**: `npm run lint`
- **Reset**: `npm run reset-project` (clear caches when builds misbehave)

Stop Metro before running tests to avoid port conflicts.

## Architecture Overview

This is an Expo-managed React Native app for the DawnoTemu bedtime story platform. The app handles voice cloning, story synthesis, audio playback, and offline queueing.

### Project Structure

```
app/index.js          # Root: SafeAreaProvider, GestureHandler, providers, Sentry init
navigation/           # AppNavigator with stack-based routing
screens/              # Route-level views (Login, Clone, Synthesis, Queue, etc.)
components/           # Shared UI (modals, audio controls, toast, menus)
hooks/                # Custom hooks (audio player/recorder, credits, queue playback, subscription)
context/              # React context providers (PlaybackQueueProvider)
services/             # API clients and config (auth, voice, credit, playback queue, subscription)
utils/                # Storage, audio helpers, logging, metrics
styles/               # Color palettes, typography tokens
```

### Key Architectural Patterns

#### Provider Hierarchy
`app/index.js` wraps the app in this order:
1. `GestureHandlerRootView`
2. `SafeAreaProvider`
3. `PlaybackQueueProvider` - queue state with AsyncStorage persistence
4. `SubscriptionProvider` - RevenueCat SDK, trial/lapse detection
5. `CreditProvider` - credit balance tracking
6. `ToastProvider` - global notifications
7. `AppNavigator` - navigation stack

#### Playback Queue System
`context/PlaybackQueueProvider.js` manages a reducer-based queue with:
- Loop modes: `NONE`, `REPEAT_ONE`, `REPEAT_ALL`
- Versioned state persistence to AsyncStorage
- User/voice ownership validation on hydration
- Max 200 items, auto-clears on logout
- Exposed via `usePlaybackQueue()` and `usePlaybackQueueDispatch()` hooks

#### Service Pattern
Services in `services/` handle API communication:
- `authService.js` - JWT auth with token refresh, SecureStore for tokens, pub/sub for auth events
- `voiceService.js` - Voice cloning and synthesis API calls
- `creditService.js` - Credit balance and estimates with caching
- `subscriptionService.js` - RevenueCat SDK wrapper for purchases and entitlement parsing
- `subscriptionStatusService.js` - Backend API client for trial status and add-on credit grants
- `playbackQueueService.js` - Queue persistence helpers
- `config.js` - Environment resolution and storage keys

Services return `{ success, data }` on success, or `{ success, error }` (with optional `code`/`status`) on failure.

#### Audio Hooks
- `useAudioPlayer.js` - Playback controls with expo-audio
- `useAudioRecorder.js` - Recording with WAV format
- `useActiveQueuePlayback.js` / `useQueuePlaybackControls.js` - Queue-aware playback

## Environment Configuration

Configure via `.env` file:

```bash
EXPO_PUBLIC_API_ENV=PROD       # DEV, STAGING, or PROD (default)
EXPO_PUBLIC_API_BASE_URL=...   # Optional override for custom API host
```

- `DEV` defaults to `http://localhost:8000`
- For physical devices, set `EXPO_PUBLIC_API_BASE_URL` to your LAN or tunnel URL
- Never hard-code URLs in source

Environment is resolved in `services/config.js`.

## Code Style

- Functional components with hooks
- 2-space indentation, single quotes, semicolons
- PascalCase filenames for components/screens (`LoginScreen.js`)
- camelCase for utilities (`storageUtils.js`)
- Use style tokens from `styles/` instead of hard-coded values
- Co-locate tests as `*.test.js` or in `__tests__/` folders

## Testing

- Jest with `jest-expo` preset
- Setup in `jest.setup.js`
- Mock React Native modules with `jest.mock` for isolation
- Cover success and error paths for services and hooks
- Run lint before PRs: `npm run lint`

## Key Files

- `services/config.js` - API URLs, storage keys, cache TTLs
- `context/PlaybackQueueProvider.js` - Queue state management
- `services/authService.js` - Auth flow with token refresh
- `hooks/useCredits.js` - Credit balance context and hook
- `hooks/useSubscription.js` - Subscription context provider with RevenueCat integration, trial/lapse detection

## Known Quirks

- Sentry is initialized in `app/index.js` with mobile replay enabled
- Recording uses WAV format; synthesized audio is MP3
- Cached audio lives in Expo's temporary directory
- Queue state versioned (`QUEUE_STATE_VERSION = 1`); mismatches discard old state
- Auth events broadcast via `authService.subscribeAuthEvents()` for cross-component coordination
- Subscription lapse detection compares the AsyncStorage-persisted `subscription_last_known_state` with live RevenueCat data; if this key is absent (e.g., after logout, first install, or manual storage clear), the lapse modal is suppressed
- RevenueCat SDK is configured on SubscriptionProvider mount; the refresh function guards against use before configuration via `isConfiguredRef`, but the real-time listener only registers after `sdkConfigured` state flips to true
- `canGenerate` is derived in two reducer branches (`SET_CUSTOMER_INFO` and `SET_TRIAL_STATUS`) because either data source may update independently
