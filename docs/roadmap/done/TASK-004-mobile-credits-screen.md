Epic: docs/roadmap/epics/EPIC-001-mobile-story-points-integration.md

# TASK-022 Mobile credits screen & navigation

## Description
Introduce a dedicated Credits screen showing balance, unit label, credit lots (with expiry/source), and recent transactions, then wire it into navigation and the app menu with appropriate styling that reuses existing tokens.

## Plan
- Add the Credits screen to the navigation stack and create entry points (App Menu CTA, optional header badge tap).
- Implement UI sections: balance header, lots list (with expiry badges), transactions list (with type/status icons), empty states.
- Ensure screen consumes `useCredits`, supports pull-to-refresh, and surfaces stale/offline states clearly.
- Finalize copy using product-approved naming ("Story Points (Punkty Magii)") and add placeholder CTA for future top-ups if requested.

## Definition of Done
- Credits screen navigable from App Menu and displays live data from credit context.
- Lots and transactions render with responsive layouts, showing expiry/source metadata where available.
- Manual QA: balance updates after refresh, offline view shows cached data message, empty states render gracefully.
