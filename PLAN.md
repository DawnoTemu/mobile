# Task & Context
Plan the React Native client changes needed to surface the new server-side credit system ("Story Stars"/credits) in the mobile app: display balances, show per-story costs, gate synthesis when funds are low, and expose credit history, aligning with the backend spec in `docs/openapi.yaml` and schema files.

## Current State (codebase scan)
- `screens/SynthesisScreen.js`: drives story listing and audio generation via `voiceService`; no awareness of credit balances or 402 handling.
- `components/StoryItem.js`, `components/AppMenu.js`, `components/StatusToast.js`: render story cards, the side menu, and user feedback; currently no credit-related UI.
- `services/voiceService.js`: encapsulates story/audio API calls, manages polling/offline cache, but the internal `apiRequest` collapses non-200 errors and never hits the `/me/credits` or `/stories/{id}/credits` endpoints.
- `services/authService.js`: owns shared API helper logic and cached user data; doesn’t persist credit metadata or expose HTTP status codes to callers.
- `navigation/AppNavigator.js`: stack navigation with no dedicated credit overview screen.
- Documentation (`docs/openapi.yaml`, `docs/schema.postgres.sql`, `docs/schema.sql`) defines credit balance, lots, transactions, and credit estimate endpoints that the mobile app has not integrated yet.

## Proposed Changes (files & functions)
- Add `services/creditService.js` wrapping `/me/credits`, `/stories/{story_id}/credits`, and helper transforms (balance, lots, transaction summaries, cache TTL).
- Introduce `hooks/useCredits.js` (or context provider) to fetch, cache, and refresh credit data globally; expose balance, unit label, lots, transactions, refresh/refetch helpers, and mutation hooks for post-debit/refund reconciliation.
- Extend `services/authService.js` and `services/voiceService.js` API helpers to surface HTTP status codes (esp. 402), support optional response transformers, and allow injecting updated credit snapshots returned from the server.
- Update `services/voiceService.js` (e.g., `getAudio`, `generateStoryAudio`, polling flows) to:
  * prefetch per-story credit requirements via `creditService` (memoize per story/voice),
  * short-circuit requests when balance is insufficient, and
  * bubble structured credit errors for UI handling.
- Enhance `screens/SynthesisScreen.js` to consume the credit hook, render balance UI, annotate stories with required credits, block synthesis when credits are insufficient, and trigger credit refetch after success/failure callbacks.
- Adjust `components/StoryItem.js` to accept props such as `requiredCredits`, `creditsAffordable`, and display a badge or warning state reflecting cost vs balance.
- Refresh `components/AppMenu.js` (and possibly add a header widget) to show the user’s balance/unit label and link into a new credits detail view.
- Add `screens/CreditsScreen.js` (plus supporting components like `CreditBalanceHeader`, `CreditLotList`, `CreditTransactionList`) and wire it into `navigation/AppNavigator.js` & the app menu; handle empty/limited states and CTA placeholders for future top-ups.
- Update localization/constants (e.g., `styles/colors.js`, shared typography) if new chips/badges or alert states are introduced; store any persistent credit meta in AsyncStorage under new keys.
- Create Jest tests for `creditService` (API success/error mapping) and the credit hook (state transitions, 402 handling mocks); update existing tests/mocks accordingly.

## Step-by-Step Plan
1. Refactor the shared API helpers (`authService.apiRequest`, `voiceService.apiRequest`) to return structured results { success, data, status, code } without losing HTTP codes; adjust existing call sites for the new shape.
2. Implement `services/creditService.js` with fetch functions (`getCredits`, `getStoryCredits`, `prefetchEstimates`) plus lightweight caching/throttling and offline fallbacks.
3. Build `useCredits` hook/context to call `creditService`, keep balance/unit/lot state, expose updater callbacks (e.g., `refreshCredits`, `applyDebitPlaceholder`, `rollbackDebit`) and share via provider at app root.
4. Update `navigation/AppNavigator.js` to include a `Credits` screen; scaffold `screens/CreditsScreen.js` and reusable UI components to render balance, lots, recent transactions, and zero-state messaging.
5. Enhance `AppMenu` (and any top-level header) to consume the credit context: show current balance/unit, add navigation entry to `Credits` screen, and refresh credits when menu opens.
6. Modify `StoryItem` (and optionally add a `CreditBadge` component) to display required credits and an affordability indicator; accept props wired from parent state.
7. Extend `SynthesisScreen` to fetch credit balances on focus, prefetch per-story requirements (batching if possible), disable or warn when credits are insufficient, surface 402 errors via dedicated toasts/modals, and trigger credit refresh after generation attempts.
8. Update `voiceService` generation/download flows to request credit estimates before synthesis, handle 402 responses gracefully, and call credit context refresh hooks after successful or failed operations.
9. Add Jest unit tests for `creditService` and `useCredits`, adjust mocks for the new API helper contract, and document manual verification steps in `README.md` (or a new `docs/CREDITS_UI.md`).

## Risks & Assumptions
- Assumes `/stories/{story_id}/credits` calls are lightweight; excessive per-story requests could impact Synthesis screen performance (may need batching or piggyback on story payloads).
- Offline mode may show stale balances; need clear messaging when credit data can’t refresh.
- UI/UX for zero-balance and purchasing/top-up flows is undefined; placeholder CTA strategy must be confirmed with stakeholders.
- Requires confirmation that API returns credit snapshots alongside 402 responses to avoid additional round trips.

## Validation & Done Criteria
- Manual: login with varying balances, ensure balance badge updates, credit screen loads lots/transactions, and synthesis is blocked with a clear message when balance < required credits.
- Manual: trigger a 402 response (zero-balance account) and confirm UI shows actionable guidance and balance refreshes after refund or admin grant.
- Manual: generate audio successfully and observe balance decrement + transaction record in UI after refresh.
- Automated: Jest suite passes with new tests covering `creditService` transformations and `useCredits` reducer/state changes.
- Regression: existing story playback, audio downloads, and offline cache flows remain functional.

## Open Questions
- Final user-facing naming for credits ("Story Stars" vs localized label from backend) and whether to always rely on API-provided `unit_label`.
Story Stars for english and for polish Gwiazdki
- Should we cache per-story credit estimates locally (with invalidation rules) or fetch on each selection?
fetch
- How should we surface upcoming subscription plans or purchase CTAs within the mobile app (link out, placeholder button, hidden for now)?
button link out to externl webpage which will describe subscrption plans (https://www.dawnotemu.app/cennik)
- Do we need push/in-app notifications when credits are low, or is on-screen messaging sufficient for this iteration?
 on-screen messaging is sufficient 