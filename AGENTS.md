# Repository Guidelines

## Project Structure & Module Organization
This Expo-managed React Native client boots from `app/index.js`, which wraps the navigation stack and Sentry setup. Core folders:
- `screens/` route-level views.
- `components/` shared UI (menus, modals, toasts) with supporting hooks in `hooks/`.
- `services/` for auth, voice, and configuration; `utils/` for storage and audio helpers.
- `styles/` for color/typography tokens and `assets/` for fonts and media.
Native tweaks live in `ios/`, while `app.json`, `eas.json`, and `metro.config.js` store Expo settings. Build artifacts land in `dist/`.

## Build, Test, and Development Commands
Run `npm install` once. Use `npm run start` for the Metro server, then `npm run ios` or `npm run android` to deploy to devices; `npm run web` opens the browser preview. `npm test` executes the Jest (jest-expo) suite, `npm run lint` applies Expo's ESLint checks, and `npm run reset-project` flushes caches when builds misbehave.

## Coding Style & Naming Conventions
Favor functional React components, hooks, and 2-space indentation. Keep single quotes and terminating semicolons to mirror existing files. Components and screens use PascalCase filenames (`LoginScreen.js`), utilities stay camelCase (`storageUtils.js`), and shared styles should reference tokens from `styles/` instead of hard-coded values. Run `npm run lint` before opening a PR.

## Testing Guidelines
Co-locate tests as `*.test.js` next to the module or in a sibling `__tests__/` folder (e.g., `services/__tests__/voiceService.test.js`). Mock React Native modules with `jest.mock` to isolate business logic, and cover async success/error branches for services and hooks. Stop Metro before running `npm test` to avoid port conflicts, and aim to raise coverage on services that currently lack tests.

## Commit & Pull Request Guidelines
Follow the repo's short, imperative commit style (`fix android`, `update plist and verison`), keeping one functional change per commit and summaries under ~70 characters. PRs should explain the user-facing impact, list manual verification steps, and link any tracker issues. Attach screenshots or recordings for UI updates, call out config edits (like `services/config.js`), and ensure `npm test` and `npm run lint` pass.

## Security & Configuration Tips
Never commit secrets beyond the published Sentry DSN. Switch environments by editing `CURRENT_ENV` in `services/config.js`; avoid hard-coding local hosts in other files. After changing native settings or config, rerun the relevant Expo command (`npm run ios` / `npm run android`) so updates propagate.
