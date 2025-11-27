# DawnoTemu

DawnoTemu is a React Native application that lets listeners experience narrated stories in their own cloned voice. The client bundles a guided cloning flow, rich playback controls, and offline queues so stories stay accessible even when a network connection drops.

![DawnoTemu Logo](./assets/images/logo.png)

## Features

- **Voice cloning** – capture a voice sample or upload existing audio to build a personal voice profile
- **Story library** – browse, favorite, and synthesize stories from the curated catalog
- **Narration playback** – play, pause, seek, or adjust position with custom audio controls
- **Offline queueing** – requests made offline are persisted and replayed when connectivity returns
- **Credit tracking** – surface balances, per-story costs, and guardrails when credits are low
- **Local caching** – generated audio and story metadata are cached for quick repeat sessions

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Expo CLI (installed automatically via npm scripts)
- Xcode (iOS) and/or Android Studio SDKs when running on devices or simulators

### Installation

```bash
git clone https://github.com/dawnotemu/mobile.git
cd mobile
npm install
```

### Running the app

```bash
npm run start     # Launch Metro bundler
npm run ios       # Build and launch the iOS app
npm run android   # Build and launch the Android app
npm run web       # Preview the web build
```

Stop Metro before running tests to free the default port.

## Project Structure

```
app/index.js                # Root component bootstrapping navigation, providers, and Sentry
assets/                     # Fonts, logos, and images bundled with the app
components/                 # Shared UI pieces (modals, audio controls, toast provider, etc.)
context/                    # React context providers such as the playback queue
hooks/                      # Custom hooks (audio recorder, audio player, credit state, ...)
navigation/                 # AppNavigator stack + routing helpers
screens/                    # Route-level views for cloning, synthesis, playback, onboarding
services/                   # API integrations, config resolution, and voice/credit services
styles/                     # Color palettes, typography tokens, theming utilities
utils/                      # Storage helpers, audio utilities, and misc shared helpers
docs/                       # Supporting documentation (QA checklists, workflows)
```

`app/index.js` wraps the experience in `SafeAreaProvider`, `GestureHandlerRootView`, custom providers, and Sentry instrumentation before rendering `AppNavigator`.

## Environment Configuration

Runtime configuration is resolved in `services/config.js`. Create a `.env` file (or configure `eas.json` secrets) with:

```bash
EXPO_PUBLIC_API_ENV=PROD       # DEV, STAGING, or PROD (default)
# Optional override when testing on devices:
# EXPO_PUBLIC_API_BASE_URL=https://api.dawnotemu.app
```

`DEV` defaults to `http://localhost:8000`. When testing on physical devices, replace that with your LAN or tunnel URL via `EXPO_PUBLIC_API_BASE_URL`. Never hard-code environment URLs in source; rely on these environment variables instead.

## NPM Scripts

- `npm run start` – start the Metro bundler (Expo) for local development
- `npm run ios` / `npm run android` – build and launch the native shells
- `npm run web` – open the Expo web preview
- `npm test` – execute the Jest (jest-expo) test suite
- `npm run lint` – run Expo's ESLint configuration
- `npm run reset-project` – clear caches and reinstall packages when builds misbehave

## Development Notes

- **Sentry instrumentation** – `app/index.js` initializes Sentry (including Replay) with the public DSN. Keep private keys and secrets out of the repo.
- **Audio processing** – recording uses WAV, synthesized audio is stored as MP3, and cached files live in Expo's temporary directory.
- **Offline behavior** – services queue cloning, synthesis, and download operations while offline and replay them once connectivity is restored.
- **Credits QA** – see `docs/mobile-credits-testing.md` for automated scenarios and manual validation steps that cover story point balances.
- **Playback queue** – queue state is persisted in AsyncStorage with versioned snapshots (capped at 200 items). Loop modes are stored separately. If the queue looks corrupted, clear `playback_queue_state`/`playback_loop_mode` (see `docs/runbooks/playback-queue.md`).

## Testing & QA

- `npm test` runs Jest with the Expo preset; mock native modules as needed for deterministic tests.
- Group new tests alongside the modules they cover (`*.test.js` or `__tests__/` folders).
- Aim to cover success and failure paths for hooks and services, especially around async behaviors and credit calculations.
- Run `npm run lint` before opening a PR to ensure coding standards are satisfied.

## Troubleshooting

- **Recording issues** – confirm microphone permission, then check device settings (iOS: Settings → App → Microphone; Android: App Info → Permissions).
- **Playback failures** – verify device volume, ensure audio assets finished downloading, and restart the app if the Expo cache is stale.
- **Stale builds** – if changes fail to appear, run `npm run reset-project` to clear caches and restart Metro.

## Additional Resources

- `docs/mobile-credits-testing.md` – story points QA checklist
- `docs/runbooks/playback-queue.md` – runbook for queue corruption/looping issues
- `AGENTS.md` – automation and tooling overview
- `PLAN.md` – current development roadmap (if maintained)

## License

[Add license details or link to LICENSE.md]

## Contact

[Add contact details or support channel]
