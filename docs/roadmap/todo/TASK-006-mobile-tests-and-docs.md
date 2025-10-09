Epic: docs/roadmap/epics/EPIC-001-mobile-story-points-integration.md

# TASK-024 Mobile tests & documentation updates

## Description
Expand automated tests for the new credit service and hook, document manual QA flows, and update README/docs to mention the mobile credit experience and testing prerequisites.

## Plan
- Add Jest tests covering `creditService` success/error cases, caching decisions, and offline fallbacks.
- Test `useCredits` reducer/actions (using React Testing Library hooks) for refresh success, optimistic debit, and rollback.
- Update README (or new doc) with manual verification checklist for credit flows, including handling of insufficient balance and refunds.
- Ensure CI test script includes the new test suites and adjust mocks/stubs as needed.

## Definition of Done
- Jest suite passes with coverage for credit service/hook logic; no flakey tests introduced.
- Documentation reflects the new mobile credit UX and lists manual validation steps.
- Manual QA notes stored alongside code so future contributors can verify credit behavior quickly.
