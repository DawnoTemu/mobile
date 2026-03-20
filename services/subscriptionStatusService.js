import { API_BASE_URL, REQUEST_TIMEOUT } from './config';
import { getAccessToken } from './authService';
import * as Sentry from '@sentry/react-native';

const DEFAULT_STATUS = {
  trial: {
    active: false,
    expiresAt: null,
    daysRemaining: 0
  },
  subscription: {
    active: false,
    plan: null,
    expiresAt: null,
    willRenew: false
  },
  canGenerate: false,
  // Must match server INITIAL_CREDITS config (default: 10)
  initialCredits: 10
};

const fetchSubscriptionStatus = async () => {
  try {
    const token = await getAccessToken();
    if (!token) {
      return { success: false, data: null, code: 'AUTH_REQUIRED' };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await fetch(`${API_BASE_URL}/api/user/subscription-status`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.status === 404) {
      Sentry.captureMessage('Subscription status endpoint returned 404', 'warning');
      return { success: false, data: null, error: 'Endpoint not found', code: 'NOT_FOUND' };
    }

    if (!response.ok) {
      return { success: false, data: null, error: `HTTP ${response.status}` };
    }

    const body = await response.json();

    return {
      success: true,
      data: {
        trial: {
          active: body.trial?.active ?? false,
          expiresAt: body.trial?.expires_at ? new Date(body.trial.expires_at) : null,
          daysRemaining: body.trial?.days_remaining ?? 0
        },
        subscription: {
          active: body.subscription?.active ?? false,
          plan: body.subscription?.plan ?? null,
          expiresAt: body.subscription?.expires_at
            ? new Date(body.subscription.expires_at)
            : null,
          willRenew: body.subscription?.will_renew ?? false
        },
        canGenerate: body.can_generate ?? false,
        initialCredits: body.initial_credits ?? 10
      }
    };
  } catch (error) {
    Sentry.captureException(error);
    if (error.name === 'AbortError') {
      return { success: false, data: null, error: 'Request timeout' };
    }
    return { success: false, data: null, error: error.message };
  }
};

const grantAddonCredits = async ({ receiptToken, productId, platform }) => {
  try {
    const token = await getAccessToken();
    if (!token) {
      return { success: false, error: 'AUTH_REQUIRED' };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await fetch(`${API_BASE_URL}/api/credits/grant-addon`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        receipt_token: receiptToken,
        product_id: productId,
        platform
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      let body = {};
      try {
        body = JSON.parse(responseText);
      } catch {
        Sentry.captureMessage(`grantAddonCredits non-JSON error response: ${responseText.slice(0, 200)}`, 'warning');
      }
      return {
        success: false,
        error: body.error || `HTTP ${response.status}`,
        status: response.status
      };
    }

    const body = await response.json();
    return {
      success: true,
      data: {
        creditsGranted: body.credits_granted,
        newBalance: body.new_balance
      }
    };
  } catch (error) {
    Sentry.captureException(error);
    return { success: false, error: error.message };
  }
};

export {
  fetchSubscriptionStatus,
  grantAddonCredits,
  DEFAULT_STATUS
};

export default {
  fetchSubscriptionStatus,
  grantAddonCredits,
  DEFAULT_STATUS
};
