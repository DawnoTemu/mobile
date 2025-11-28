import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../components/StatusToast';
import authService from '../services/authService';

export const useUserSettings = () => {
  const { showToast } = useToast();
  const mountedRef = useRef(true);

  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [refreshingProfile, setRefreshingProfile] = useState(false);
  const [updatingEmail, setUpdatingEmail] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [resendingConfirmation, setResendingConfirmation] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const refreshProfile = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoadingProfile(true);
      setRefreshingProfile(true);
    }

    try {
      const result = await authService.fetchProfile();

      if (result.success && result.user && mountedRef.current) {
        setProfile(result.user);
      } else if (!silent && result?.error) {
        showToast(result.error, 'ERROR');
      }

      if (mountedRef.current) {
        setLoadingProfile(false);
        setRefreshingProfile(false);
      }

      return result;
    } catch (error) {
      if (!silent) {
        showToast('Nie udało się odświeżyć danych konta.', 'ERROR');
      }
      if (mountedRef.current) {
        setLoadingProfile(false);
        setRefreshingProfile(false);
      }
      return {
        success: false,
        status: null,
        error: error?.message || 'Unknown error',
        code: 'API_ERROR'
      };
    }
  }, [showToast]);

  useEffect(() => {
    const hydrateProfile = async () => {
      try {
        const cachedUser = await authService.getCurrentUser();
        if (cachedUser && mountedRef.current) {
          setProfile(cachedUser);
        }
      } catch (error) {
        // No-op; fallback to network fetch
      }

      await refreshProfile({ silent: true });
      if (mountedRef.current) {
        setLoadingProfile(false);
      }
    };

    hydrateProfile();

    return () => {
      mountedRef.current = false;
    };
  }, [refreshProfile]);

  const resendConfirmation = useCallback(async () => {
    if (!profile?.email) {
      showToast('Brakuje adresu e-mail.', 'ERROR');
      return { success: false, error: 'Missing email' };
    }

    setResendingConfirmation(true);
    try {
      const result = await authService.resendConfirmationEmail(profile.email);
      if (result.success) {
        showToast('Wysłaliśmy ponownie e-mail z potwierdzeniem.', 'SUCCESS');
      } else {
        showToast(result.error || 'Nie udało się wysłać e-maila potwierdzającego.', 'ERROR');
      }
      return result;
    } finally {
      if (mountedRef.current) {
        setResendingConfirmation(false);
      }
    }
  }, [profile?.email, showToast]);

  const updateEmail = useCallback(async ({ email, currentPassword }) => {
    if (!email || !currentPassword) {
      showToast('Podaj nowy e-mail oraz obecne hasło.', 'ERROR');
      return {
        success: false,
        error: 'Missing fields',
        code: 'VALIDATION_ERROR'
      };
    }

    setUpdatingEmail(true);
    try {
      const result = await authService.updateProfile({
        email,
        currentPassword
      });

      if (result.success) {
        const nextProfile = result.user || profile;
        if (nextProfile && mountedRef.current) {
          setProfile(nextProfile);
        }
        const requiresConfirmation = result?.data?.email_confirmation_required || result?.email_confirmation_required;
        const message = result?.data?.message || 'Adres e-mail został zaktualizowany.';
        showToast(
          requiresConfirmation
            ? `${message} Sprawdź skrzynkę, by potwierdzić adres.`
            : message,
          'SUCCESS'
        );
      } else {
        showToast(result.error || 'Nie udało się zaktualizować e-maila.', 'ERROR');
      }

      return result;
    } finally {
      if (mountedRef.current) {
        setUpdatingEmail(false);
      }
    }
  }, [profile, showToast]);

  const changePassword = useCallback(async ({
    currentPassword,
    newPassword,
    newPasswordConfirm
  }) => {
    if (!currentPassword || !newPassword || !newPasswordConfirm) {
      showToast('Uzupełnij wszystkie pola hasła.', 'ERROR');
      return {
        success: false,
        error: 'Missing fields',
        code: 'VALIDATION_ERROR'
      };
    }

    if (newPassword !== newPasswordConfirm) {
      showToast('Hasła muszą być identyczne.', 'ERROR');
      return {
        success: false,
        error: 'Password mismatch',
        code: 'VALIDATION_ERROR'
      };
    }

    setUpdatingPassword(true);
    try {
      const result = await authService.updateProfile({
        currentPassword,
        newPassword,
        newPasswordConfirm
      });

      if (result.success) {
        const nextProfile = result.user || profile;
        if (nextProfile && mountedRef.current) {
          setProfile(nextProfile);
        }
        const message = result?.data?.message || 'Hasło zostało zmienione.';
        showToast(message, 'SUCCESS');
      } else {
        showToast(result.error || 'Nie udało się zmienić hasła.', 'ERROR');
      }

      return result;
    } finally {
      if (mountedRef.current) {
        setUpdatingPassword(false);
      }
    }
  }, [profile, showToast]);

  const deleteAccount = useCallback(async ({ currentPassword, reason }) => {
    if (!currentPassword) {
      showToast('Podaj swoje obecne hasło.', 'ERROR');
      return {
        success: false,
        error: 'Missing password',
        code: 'VALIDATION_ERROR'
      };
    }

    setDeletingAccount(true);
    try {
      const result = await authService.deleteAccount({
        currentPassword,
        reason
      });

      if (result.success) {
        if (mountedRef.current) {
          setProfile(null);
        }
        showToast('Konto zostanie usunięte. Zostałeś wylogowany.', 'INFO');
      } else {
        showToast(result.error || 'Nie udało się zaplanować usunięcia konta.', 'ERROR');
      }

      return result;
    } finally {
      if (mountedRef.current) {
        setDeletingAccount(false);
      }
    }
  }, [showToast]);

  return {
    profile,
    loadingProfile,
    refreshingProfile,
    updatingEmail,
    updatingPassword,
    resendingConfirmation,
    deletingAccount,
    refreshProfile,
    resendConfirmation,
    updateEmail,
    changePassword,
    deleteAccount
  };
};

export default useUserSettings;
