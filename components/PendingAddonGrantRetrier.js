import { useEffect, useRef } from 'react';
import * as Sentry from '@sentry/react-native';
import { useSubscription } from '../hooks/useSubscription';
import { useCreditActions } from '../hooks/useCredits';
import { useToast } from './StatusToast';
import { grantAddonCredits } from '../services/subscriptionStatusService';
import { getCurrentUserId } from '../services/authService';
import {
  loadPendingAddonGrant,
  clearPendingAddonGrant,
} from '../utils/pendingAddonGrant';

/**
 * Background retry for failed addon credit grants.
 *
 * Mounts at the app root (inside Subscription/Credit/Toast providers) so the
 * retry fires on app launch, not only when the user navigates to the
 * Subscription screen. Renders nothing.
 *
 * Runs exactly once per mount, gated by `sdkConfigured` so it only fires
 * after the RevenueCat SDK is ready and the user session has been linked.
 *
 * See DawnoTemu/mobile#21 for the motivation — previously this logic lived
 * inside SubscriptionScreen and users who failed an addon grant silently
 * lost their credits unless they manually revisited that screen within 24h.
 */
export default function PendingAddonGrantRetrier() {
  const { loading } = useSubscription();
  const creditActions = useCreditActions();
  const { showToast } = useToast();
  const hasRetriedRef = useRef(false);

  useEffect(() => {
    if (loading || hasRetriedRef.current) return;
    hasRetriedRef.current = true;

    let cancelled = false;

    const retry = async () => {
      try {
        const userId = await getCurrentUserId();
        if (!userId) return;

        const pending = await loadPendingAddonGrant();
        if (!pending) return;

        if (!pending.transactionId || !pending.productId) {
          Sentry.captureMessage('Pending addon grant has missing fields, cannot retry', {
            level: 'error',
            extra: {
              hasTransactionId: !!pending.transactionId,
              hasProductId: !!pending.productId,
            },
          });
          await clearPendingAddonGrant();
          return;
        }

        if (!pending.userId || pending.userId !== String(userId)) {
          // Belongs to a different user — clear it.
          await clearPendingAddonGrant();
          return;
        }

        const grantResult = await grantAddonCredits({
          transactionId: pending.transactionId,
          productId: pending.productId,
          platform: pending.platform,
        });

        if (cancelled) return;

        if (grantResult.success) {
          await clearPendingAddonGrant();
          Sentry.addBreadcrumb({
            category: 'addon_grant',
            message: 'Addon credits granted via pending retry',
            level: 'info',
            data: {
              transactionId: pending.transactionId,
              productId: pending.productId,
              credits: pending.credits,
            },
          });
          if (pending.credits) {
            showToast(`Dodano ${pending.credits} Punktów Magii!`, 'SUCCESS');
          }
          if (creditActions?.refreshCredits) {
            creditActions
              .refreshCredits({ force: true })
              .catch((err) =>
                Sentry.captureException(err, {
                  extra: { context: 'refresh_credits_after_pending_addon_retry' },
                })
              );
          }
        } else {
          Sentry.captureMessage('Pending addon grant retry failed', {
            level: 'warning',
            extra: {
              error: grantResult.error,
              code: grantResult.code,
              productId: pending.productId,
            },
          });
          // Keep the pending grant in AsyncStorage — it will retry on the
          // next app launch (until the 24h expiry).
        }
      } catch (err) {
        Sentry.captureException(err, { extra: { context: 'pending_addon_grant_retry' } });
      }
    };

    retry();

    return () => {
      cancelled = true;
    };
  }, [loading, creditActions, showToast]);

  return null;
}
