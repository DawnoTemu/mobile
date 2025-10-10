# Mobile Credits Testing & QA

This document captures the automated checks and manual verification steps for the Story Points (credits) experience introduced in the mobile client.

## Automated Tests

Run selective suites when iterating on credits logic:

```bash
# Credit service cache & API handling
npm test -- creditService

# Credit provider/context behaviour
npm test -- useCredits
```

The full `npm test` run should also remain green before raising a PR.

## Manual Verification Checklist

Perform these flows against an environment backed by the new credit-aware API:

1. **Login & Balance Display**
   - Log in with a user who has a non-zero balance.
   - Confirm the Synthesis screen shows the correct balance/unit label and no error banner.

2. **Story Cost Visibility**
   - Verify each story card shows required Story Points once estimates load.
   - Check that free/comped stories surface as `0 Story Points`.

3. **Generation With Sufficient Credits**
   - Choose a story you can afford.
   - Start synthesis and ensure the balance refreshes after success.

4. **Insufficient Credit Gating**
   - With a low-balance user, select a story that costs more than the balance.
   - Expect a toast explaining insufficient Story Points and no API call to generate audio.

5. **Payment Required Error Handling**
   - Force a credit debit (or use admin tooling) so `/voices/.../audio` returns `402`.
   - Confirm the user sees the informative toast and the balance refreshes.

6. **Offline Behaviour**
   - Disconnect from the network.
   - Only locally cached stories remain selectable, and credit toasts avoid spamming errors.

7. **Logout/Login Refresh**
   - Log out, then log back in.
   - Balance and per-story costs refresh automatically without requiring an app restart.

Document any deviations or backend inconsistencies discovered during testing.
