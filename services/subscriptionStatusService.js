import * as Sentry from '@sentry/react-native';
import { DEFAULT_INITIAL_CREDITS } from './config';
import { apiRequest } from './authService';

// All three calls below route through `apiRequest` (authService) which
// transparently handles 401 -> refreshToken() -> retry, and broadcasts a
// LOGOUT auth event when the refresh ultimately fails. Callers therefore do
// NOT need to capture 401/AUTH_ERROR — those are recoverable signals, not
// programming faults. Capture only response-shape and 5xx anomalies.

const fetchSubscriptionStatus = async () => {
  const result = await apiRequest('/api/user/subscription-status', { method: 'GET' });

  if (!result.success) {
    if (result.status >= 500) {
      Sentry.captureMessage('Subscription status endpoint server error', {
        level: 'error',
        extra: { status: result.status, error: result.error }
      });
    } else if (result.status === 404) {
      Sentry.captureMessage('Subscription status endpoint returned 404', 'warning');
    }
    return {
      success: false,
      data: null,
      error: result.error || `HTTP ${result.status}`,
      code: result.code,
      status: result.status
    };
  }

  const body = result.data;
  if (!body || !body.trial || typeof body.can_generate !== 'boolean') {
    Sentry.captureMessage('Unexpected subscription-status response shape', {
      level: 'error',
      extra: { keys: body ? Object.keys(body) : null }
    });
    return {
      success: false,
      data: null,
      error: 'Serwer zwrócił niekompletne dane subskrypcji.',
      code: 'INVALID_RESPONSE_SHAPE'
    };
  }

  const parseDate = (raw) => {
    if (!raw) return null;
    const parsed = new Date(raw);
    if (!Number.isFinite(parsed.getTime())) {
      Sentry.captureMessage('fetchSubscriptionStatus: invalid date string', {
        level: 'warning',
        extra: { raw }
      });
      return null;
    }
    return parsed;
  };

  return {
    success: true,
    data: {
      trial: {
        active: body.trial?.active ?? false,
        expiresAt: parseDate(body.trial?.expires_at),
        daysRemaining: body.trial?.days_remaining ?? 0
      },
      subscription: {
        active: body.subscription?.active ?? false,
        plan: body.subscription?.plan ?? null,
        expiresAt: parseDate(body.subscription?.expires_at),
        willRenew: body.subscription?.will_renew ?? false
      },
      canGenerate: body.can_generate ?? false,
      initialCredits: body.initial_credits ?? DEFAULT_INITIAL_CREDITS
    }
  };
};

// transactionId is a RevenueCat transactionIdentifier, not an App Store/Play
// Store receipt. The backend field is named receipt_token for historical
// reasons; it serves as an idempotency key.
const grantAddonCredits = async ({ transactionId, productId, platform }) => {
  const result = await apiRequest('/api/credits/grant-addon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      receipt_token: transactionId,
      product_id: productId,
      platform
    })
  });

  if (!result.success) {
    if (result.status >= 500) {
      Sentry.captureMessage('grantAddonCredits server error', {
        level: 'error',
        extra: { status: result.status, error: result.error, productId }
      });
    }
    return {
      success: false,
      error: result.error || `HTTP ${result.status}`,
      code: result.code,
      status: result.status
    };
  }

  const body = result.data;
  if (!body || typeof body.credits_granted !== 'number' || typeof body.new_balance !== 'number') {
    Sentry.captureMessage('grantAddonCredits: success response missing numeric fields', {
      level: 'error',
      extra: {
        keys: body ? Object.keys(body) : null,
        credits_granted: body?.credits_granted,
        new_balance: body?.new_balance
      }
    });
    return { success: false, error: 'Serwer zwrócił niekompletne dane. Skontaktuj się z obsługą.' };
  }

  return {
    success: true,
    data: {
      creditsGranted: body.credits_granted,
      newBalance: body.new_balance
    }
  };
};

const linkRevenueCat = async (revenuecatAppUserId) => {
  const result = await apiRequest('/api/user/link-revenuecat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ revenuecat_app_user_id: revenuecatAppUserId })
  });

  if (!result.success) {
    // 401 already cleared via apiRequest's refresh path. 409 is "already linked
    // to another user" — surfaced to caller, not noise. Anything else worth a
    // warning so we can spot misconfigured backends.
    if (result.status && result.status !== 401 && result.status !== 409) {
      Sentry.captureMessage('linkRevenueCat failed', {
        level: 'warning',
        extra: { status: result.status, error: result.error, revenuecatAppUserId }
      });
    }
    return {
      success: false,
      error: result.error || `HTTP ${result.status}`,
      code: result.code,
      status: result.status
    };
  }

  return { success: true };
};

export {
  fetchSubscriptionStatus,
  grantAddonCredits,
  linkRevenueCat
};
