Epic: docs/roadmap/epics/EPIC-001-mobile-story-points-integration.md

# TASK-020 Mobile credit service layer

## Description
Create `services/creditService.js` that wraps `/me/credits` and `/stories/{story_id}/credits`, normalizes responses (balance, unit label, lots, recent transactions), caches story credit estimates, and exposes helpers for cache invalidation and stale data messaging.

## Plan
- Scaffold the new service with fetch functions for balance/history and per-story estimates using the refactored API helpers.
- Implement lightweight caching (AsyncStorage or in-memory) with TTL and explicit `refresh`/`invalidate` methods.
- Handle offline scenarios by returning cached data with freshness metadata and standardized error codes.
- Document public functions and integrate basic Jest tests with mocked fetch responses.

## Definition of Done
- `creditService` provides tested functions: `getCredits`, `refreshCredits`, `getStoryCredits`, and `primeStoryCredits`.
- Successful fetch returns parsed balance/unit label ("Story Points (Punkty Magii)"), lots, and transactions.
- Error pathways distinguish between offline, timeout, 402, and generic API errors.
