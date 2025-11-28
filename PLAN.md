# User Settings View Plan

## Task & Context
Build a Moje konto / user settings screen accessible from the side menu that surfaces profile info (email + confirmation status, account timestamps), supports updating email/password, resending confirmation, and scheduling account deletion while keeping local auth state in sync with backend responses.

## API Notes (docs/openapi.yaml)
- `GET /auth/me` (bearer): returns `User` with `email`, `email_confirmed`, `credits_balance`, `created_at`, `updated_at`, `last_login`, `is_active`, `is_admin`.
- `PATCH /auth/me` (bearer): body requires `current_password`; optional `email`, `new_password`, `new_password_confirm`; response includes `user`, `message`, `email_confirmation_required`, `email_confirmation_error`, `password_updated`.
- `DELETE /auth/me` (bearer): body requires `current_password`, optional `reason`; returns `message` ("Account deletion scheduled.").
- `POST /auth/resend-confirmation`: body `{ email }`; sends confirmation email for unverified accounts.

## Current State (codebase scan)
- No settings/account screen exists; `navigation/AppNavigator.js` only registers Splash/Login/Register/Forgot/Confirm/Synthesis/Clone/Queue.
- `components/AppMenu.js` has commented navigation for `Moje konto`/`Ustawienia`, currently only fetches cached user data and credits.
- `services/authService.js` lacks remote profile fetch/update/delete helpers; stores user data in `AsyncStorage` after login and exposes `resendConfirmationEmail` but nothing for `/auth/me` mutations.
- No shared hook for live user profile state; toasts (`StatusToast`) and confirmation modal components exist and can be reused for form feedback.

## Proposed Changes (files & functions)
- Extend `authService` with `fetchProfile` (GET /auth/me), `updateProfile` (PATCH /auth/me), `deleteAccount` (DELETE /auth/me) built on `apiRequest`, updating `AsyncStorage` via `updateUserData` and emitting auth events on profile changes/logout.
- Add a user settings hook (e.g., `hooks/useUserSettings.js`) to hydrate profile from cache + API, expose actions for resend confirmation, email update, password change, and deletion with loading/error flags and toast helpers.
- Create `screens/UserSettingsScreen.js` (or `AccountSettingsScreen.js`) with sections for profile summary (email, confirmation badge, last login/created_at), email verification/resend CTA, change email form (fields: email, current password), change password form (fields: current/new/confirm), and account deletion block (reason optional) with confirmation modal.
- Wire navigation: register the screen in `navigation/AppNavigator.js` with slide animation; update `components/AppMenu.js` to navigate to it and close the menu. Consider refreshing menu user data when auth events fire so updates show immediately.
- Style consistency: reuse `COLORS`, form input patterns from auth screens, `StatusToast` for success/error messages, `ActivityIndicator` for mutations.

## Step-by-Step Plan
1. Implement service methods for profile fetch/update/delete in `services/authService.js`, persisting updated `user` payloads and handling `email_confirmation_required` flags; add unit tests under `services/__tests__/`.
2. Introduce `useUserSettings` hook to manage profile loading, mutation calls, toast handling, and optimistic local user updates; ensure it handles offline/errors gracefully.
3. Build `UserSettingsScreen.js` with grouped cards: profile summary + resend confirmation, change email form, change password form, and delete account confirmation (collect `current_password` and optional reason, then logout on success).
4. Connect navigation/menu by adding the new route to `AppNavigator` and enabling the `Moje konto` item in `AppMenu` to push to it; listen for auth events to refresh user info shown in the menu after updates.
5. Test and QA: unit tests for service payloads; UI tests for form validation where feasible; manual flows for update email/password, resend confirmation, and delete account; run `npm run lint` and relevant Jest suites.

## Risks & Assumptions
- Every profile mutation requires `current_password`; need clear UX and error messaging for incorrect credentials.
- Delete account is asynchronous ("scheduled")—we should log out locally immediately after success to avoid stale sessions.
- Password change and email change share the same endpoint; guard against sending empty mutation payloads and mismatched `new_password_confirm`.
- Email confirmation flow depends on email delivery; surface `email_confirmation_error` from API when present.

## Open Questions
- Should the settings screen also surface Story Points balance/history or keep that in the menu/credits sheet only?
- Do we require client-side password strength checks beyond matching confirmation?
