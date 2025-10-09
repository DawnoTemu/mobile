# Epic: Mobile Story Points Integration

## Overview
- **Goal:** Bring the Story Points credit system (a.k.a. Story Stars / Punkty Magii) to the Expo React Native client so users can see balances, understand per-story costs, and are prevented from starting synthesis when credits are insufficient.
- **Background:** Backend EPIC-001 delivered the ledger, debit/refund logic, admin tools, and API endpoints (`/me/credits`, `/stories/{id}/credits`, admin grant). The mobile app still assumes audio synthesis is free and provides no visibility into balances.
- **Scope:** Update services, hooks, screens, and supporting UI to surface balances, required credits, and history, with proper handling of HTTP 402 responses.
- **Non-goals:** Implement purchase/subscription flows, push notifications, or deep admin features; overhaul offline architecture beyond credit caching primitives.

## Current State
- `voiceService` and `authService` wrap API calls but hide HTTP status codes, making it impossible to distinguish 402 Payment Required responses.
- `SynthesisScreen` manages story selection/generation and displays generic errors; it does not fetch credit information or block synthesis when the user has no credits.
- `StoryItem` and `AppMenu` lack any credit context; users cannot see balances or per-story costs.
- No dedicated Credits screen exists, and there is no shared state for credit balances, lots, or transaction history.
- Docs (`docs/openapi.yaml`, `docs/schema.*`) already describe the deployed credit system back end.

## Drivers & Rationale
- Prevent user confusion by explaining why synthesis fails once credits are enforced.
- Enable proactive communication of credit status (balance, lots, history) to align with forthcoming plans for top-ups and subscriptions.
- Reuse backend investment (ledger, endpoints) to provide parity across clients.

## Requirements & Constraints
- **Naming:** Use API-provided `unit_label` ("Story Points (Punkty Magii)") to remain consistent and localized.
- **API Usage:** Leverage `/me/credits` for balance/lots/history and `/stories/{id}/credits` for per-story estimates. Expect 402 responses from synthesis endpoints to include structured error bodies.
- **Caching:** Provide light caching/offline fallbacks but clearly indicate when credit data is stale.
- **UX Expectations:** Show balance prominently (menu header, new Credits screen) and annotate stories with required credits and affordability state.
- **Testing:** Add Jest coverage for new services/hooks; respect existing test patterns.

## Deliverables
1. Refined shared API helpers that surface HTTP status and error codes without regressing existing consumers.
2. New `creditService` and shared hook/context exposing balance, unit label, lots, transactions, and mutation helpers.
3. Credits-centric UI:
   - Balance badge (menu/header),
   - Story list indicators (required credits, affordability),
   - Dedicated Credits screen with balance, lots, and recent transactions.
4. Updated synthesis flow that pre-checks credit availability, gracefully handles 402 responses, and refreshes credit data on state changes.
5. Documentation/tests covering the new mobile credit behavior.

## High-Level Plan
1. **API Foundation:** Refactor `authService`/`voiceService` request helpers and adapt consumers to the richer response object.
2. **Credit Data Layer:** Implement `creditService` with caching utilities and error normalization; build `useCredits` (or provider) to share state app-wide.
3. **Navigation & UI:** Add Credits screen, update navigation/menu, and style reusable balance/lot/transaction components following existing design tokens.
4. **Synthesis Integration:** Wire credit context into `SynthesisScreen`, story items, and generation flows, ensuring preflight checks and user messaging.
5. **Quality & Docs:** Add unit tests, update README/docs with mobile credit usage notes, outline manual verification steps.

## Dependencies
- Backend EPIC-001 APIs must be available in all environments referenced by `services/config.js`.
- Sufficient design direction exists for badges and balance presentation; otherwise rely on minimal text-based UI using existing typography/colors.

## Risks & Mitigations
- **Performance:** Multiple credit estimate requests could slow the Synthesis screen. Mitigate by caching estimates per story and batching refetches.
- **Offline Behavior:** Balance might be stale when offline. Communicate freshness timestamps and fall back to cached values with warnings.
- **Error Handling:** 402 handling demands new UI states; ensure voiceService surfaces clear codes and toast messaging remains actionable.
- **Scope Creep:** Subscription or purchase flows are out of scope; keep CTAs as placeholders or links for future tasks.

## Open Items
- Confirm whether per-story credit estimates should persist beyond session (default assumption: cache with short TTL and invalidate on balance refresh).
- Determine copy/CTA for zero-balance prompts (e.g., "Contact support" vs future store link). Placeholder messaging until product decision.

## Definition of Done
- Credit balance, lots, and recent transactions visible and navigable in the mobile app.
- Story list surfaces required credits and blocks synthesis when balance is insufficient, with clear user feedback.
- 402 responses translated into user-facing guidance and trigger credit state refresh.
- Jest tests pass; manual checklist executed for success/insufficient/refund scenarios.
- Documentation updated to detail mobile credit UX and testing steps.
