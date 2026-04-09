import { API_BASE_URL, REQUEST_TIMEOUT, DEFAULT_INITIAL_CREDITS } from './config';
import { getAccessToken } from './authService';
import * as Sentry from '@sentry/react-native';

const fetchSubscriptionStatus = async () => {
  let timeoutId;
  try {
    const token = await getAccessToken();
    if (!token) {
      return { success: false, data: null, error: 'Authentication required', code: 'AUTH_REQUIRED' };
    }

    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await fetch(`${API_BASE_URL}/api/user/subscription-status`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal
    });

    if (response.status === 404) {
      Sentry.captureMessage('Subscription status endpoint returned 404', 'warning');
      return { success: false, data: null, error: 'Endpoint not found', code: 'NOT_FOUND' };
    }

    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      if (response.status >= 500) {
        Sentry.captureMessage('Subscription status endpoint server error', {
          level: 'error',
          extra: { status: response.status, body: responseText.slice(0, 500) }
        });
      } else {
        Sentry.captureMessage('Subscription status endpoint client error', {
          level: 'warning',
          extra: { status: response.status }
        });
      }
      return { success: false, data: null, error: `HTTP ${response.status}` };
    }

    let body;
    try {
      body = await response.json();
    } catch (parseError) {
      Sentry.captureMessage('fetchSubscriptionStatus: 200 response with invalid JSON', {
        level: 'error',
        extra: { parseError: parseError.message }
      });
      return { success: false, data: null, error: 'Serwer zwrócił nieprawidłowe dane. Spróbuj ponownie.' };
    }

    if (!body.trial || typeof body.can_generate !== 'boolean') {
      Sentry.captureMessage('Unexpected subscription-status response shape', {
        level: 'error',
        extra: { keys: Object.keys(body) }
      });
      return { success: false, data: null, error: 'Serwer zwrócił niekompletne dane subskrypcji.', code: 'INVALID_RESPONSE_SHAPE' };
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
  } catch (error) {
    if (error.name === 'AbortError') {
      Sentry.captureMessage('Subscription status request timed out', { level: 'warning' });
      return { success: false, data: null, error: 'Request timeout', code: 'TIMEOUT' };
    }
    Sentry.captureException(error);
    return { success: false, data: null, error: error.message };
  } finally {
    clearTimeout(timeoutId);
  }
};

// transactionId is a RevenueCat transactionIdentifier, not an App Store/Play Store receipt.
// The backend field is named receipt_token for historical reasons; it serves as an idempotency key.
const grantAddonCredits = async ({ transactionId, productId, platform }) => {
  let timeoutId;
  try {
    const token = await getAccessToken();
    if (!token) {
      return { success: false, error: 'Authentication required', code: 'AUTH_REQUIRED' };
    }

    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await fetch(`${API_BASE_URL}/api/credits/grant-addon`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        receipt_token: transactionId,
        product_id: productId,
        platform
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      let body = {};
      try {
        body = JSON.parse(responseText);
        if (response.status >= 500) {
          Sentry.captureMessage('grantAddonCredits server error', {
            level: 'error',
            extra: { status: response.status, error: body.error, productId }
          });
        }
      } catch (parseError) {
        Sentry.captureMessage('grantAddonCredits non-JSON error response', {
          level: 'warning',
          extra: { body: responseText.slice(0, 200), parseError: parseError.message }
        });
      }
      return {
        success: false,
        error: body.error || `HTTP ${response.status}`,
        status: response.status
      };
    }

    let body;
    try {
      body = await response.json();
    } catch (parseError) {
      Sentry.captureMessage('grantAddonCredits: 200 response with invalid JSON', {
        level: 'error',
        extra: { parseError: parseError.message }
      });
      return { success: false, error: 'Serwer zwrócił nieprawidłowe dane. Skontaktuj się z obsługą.' };
    }
    if (typeof body.credits_granted !== 'number' || typeof body.new_balance !== 'number') {
      Sentry.captureMessage('grantAddonCredits: success response missing numeric fields', {
        level: 'error',
        extra: { keys: Object.keys(body), credits_granted: body.credits_granted, new_balance: body.new_balance }
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
  } catch (error) {
    if (error.name === 'AbortError') {
      Sentry.captureMessage('Grant addon credits request timed out', { level: 'warning' });
      return { success: false, error: 'Request timeout', code: 'TIMEOUT' };
    }
    Sentry.captureException(error);
    return { success: false, error: error.message };
  } finally {
    clearTimeout(timeoutId);
  }
};

const linkRevenueCat = async (revenuecatAppUserId) => {
  let timeoutId;
  try {
    const token = await getAccessToken();
    if (!token) {
      return { success: false, error: 'Authentication required', code: 'AUTH_REQUIRED' };
    }

    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await fetch(`${API_BASE_URL}/api/user/link-revenuecat`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ revenuecat_app_user_id: revenuecatAppUserId }),
      signal: controller.signal
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      let body = {};
      try { body = JSON.parse(responseText); } catch (_) { /* ignore */ }
      if (response.status !== 409) {
        Sentry.captureMessage('linkRevenueCat failed', {
          level: 'warning',
          extra: { status: response.status, error: body.error, revenuecatAppUserId }
        });
      }
      return { success: false, error: body.error || `HTTP ${response.status}`, status: response.status };
    }

    return { success: true };
  } catch (error) {
    if (error.name === 'AbortError') {
      return { success: false, error: 'Request timeout', code: 'TIMEOUT' };
    }
    Sentry.captureException(error, { extra: { context: 'link_revenuecat' } });
    return { success: false, error: error.message };
  } finally {
    clearTimeout(timeoutId);
  }
};

export {
  fetchSubscriptionStatus,
  grantAddonCredits,
  linkRevenueCat
};
