import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import ConfirmModal from '../components/Modals/ConfirmModal';
import useUserSettings from '../hooks/useUserSettings';
import { useSubscription } from '../hooks/useSubscription';
import { COLORS } from '../styles/colors';

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleDateString('pl-PL', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

export default function UserSettingsScreen() {
  const navigation = useNavigation();
  const { isSubscribed, loading: subscriptionLoading, trial } = useSubscription();
  const {
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
  } = useUserSettings();

  const [emailInput, setEmailInput] = useState('');
  const [currentPasswordForEmail, setCurrentPasswordForEmail] = useState('');
  const [currentPasswordForPassword, setCurrentPasswordForPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);

  useEffect(() => {
    if (profile?.email) {
      setEmailInput(profile.email);
    }
  }, [profile?.email]);

  const isBusy = useMemo(
    () =>
      updatingEmail ||
      updatingPassword ||
      resendingConfirmation ||
      deletingAccount,
    [updatingEmail, updatingPassword, resendingConfirmation, deletingAccount]
  );

  const handleUpdateEmail = async () => {
    const result = await updateEmail({
      email: emailInput?.trim(),
      currentPassword: currentPasswordForEmail
    });
    if (result?.success) {
      setCurrentPasswordForEmail('');
    }
  };

  const handleChangePassword = async () => {
    const result = await changePassword({
      currentPassword: currentPasswordForPassword,
      newPassword,
      newPasswordConfirm: confirmPassword
    });
    if (result?.success) {
      setCurrentPasswordForPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleteModalVisible(false);
    const result = await deleteAccount({
      currentPassword: deletePassword,
      reason: deleteReason?.trim()
    });
    if (result?.success) {
      navigation.reset({
        index: 0,
        routes: [{ name: 'Login' }]
      });
    }
  };

  const renderBadge = () => {
    const confirmed = profile?.email_confirmed;
    return (
      <View
        style={[
          styles.badge,
          confirmed ? styles.badgeSuccess : styles.badgeWarning
        ]}
      >
        <Feather
          name={confirmed ? 'check' : 'alert-circle'}
          size={14}
          color={confirmed ? COLORS.mint : COLORS.peach}
          style={styles.badgeIcon}
        />
        <Text
          style={[
            styles.badgeText,
            confirmed ? styles.badgeTextSuccess : styles.badgeTextWarning
          ]}
        >
          {confirmed ? 'Potwierdzony' : 'Niepotwierdzony'}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.backButton}
              disabled={isBusy}
            >
              <Feather name="chevron-left" size={24} color={COLORS.text.primary} />
            </TouchableOpacity>
            <View>
              <Text style={styles.title}>Moje konto</Text>
              <Text style={styles.subtitle}>
                Zarządzaj swoim adresem e-mail i hasłem.
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('Subscription')}
            activeOpacity={0.8}
          >
            <View style={styles.rowBetween}>
              <View>
                <Text style={styles.label}>Subskrypcja</Text>
                {subscriptionLoading ? (
                  <ActivityIndicator size="small" color={COLORS.text.secondary} style={{ marginTop: 4 }} />
                ) : (
                  <>
                    <Text style={[styles.value, { color: isSubscribed ? COLORS.mint : COLORS.text.secondary }]}>
                      {isSubscribed ? 'Aktywna' : trial?.active ? 'Okres próbny' : 'Nieaktywna'}
                    </Text>
                    {trial?.active && !isSubscribed && (
                      <Text style={[styles.label, { marginTop: 2 }]}>
                        {trial.daysRemaining > 0 ? `${trial.daysRemaining} dni pozostało` : 'Ostatni dzień'}
                      </Text>
                    )}
                  </>
                )}
              </View>
              <Feather name="chevron-right" size={20} color={COLORS.text.tertiary} />
            </View>
          </TouchableOpacity>

          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Dane konta</Text>
              <TouchableOpacity
                style={styles.refreshButton}
                onPress={() => refreshProfile()}
                disabled={refreshingProfile}
              >
                {refreshingProfile ? (
                  <ActivityIndicator size="small" color={COLORS.text.secondary} />
                ) : (
                  <Feather name="refresh-ccw" size={18} color={COLORS.text.secondary} />
                )}
              </TouchableOpacity>
            </View>

            {loadingProfile && !profile ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={COLORS.text.secondary} size="small" />
                <Text style={styles.loadingText}>Ładowanie danych konta...</Text>
              </View>
            ) : (
              <>
                <View style={styles.rowBetween}>
                  <View>
                    <Text style={styles.label}>Adres e-mail</Text>
                    <Text style={styles.value}>{profile?.email || '—'}</Text>
                  </View>
                  {renderBadge()}
                </View>

                <View style={styles.metaRow}>
                  <Feather name="calendar" size={16} color={COLORS.text.tertiary} />
                  <Text style={styles.metaText}>
                    Utworzono {formatDate(profile?.created_at)}
                  </Text>
                </View>

                {profile?.last_login && (
                  <View style={styles.metaRow}>
                    <Feather name="clock" size={16} color={COLORS.text.tertiary} />
                    <Text style={styles.metaText}>
                      Ostatnie logowanie {formatDate(profile.last_login)}
                    </Text>
                  </View>
                )}

                {!profile?.email_confirmed && (
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={resendConfirmation}
                    disabled={resendingConfirmation}
                  >
                    {resendingConfirmation ? (
                      <ActivityIndicator color={COLORS.text.secondary} size="small" />
                    ) : (
                      <>
                        <Feather name="send" size={16} color={COLORS.text.secondary} />
                        <Text style={styles.secondaryButtonText}>
                          Wyślij ponownie potwierdzenie
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Zmień adres e-mail</Text>
            <View style={styles.inputContainer}>
              <Feather name="mail" size={18} color={COLORS.text.tertiary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Nowy adres e-mail"
                placeholderTextColor={COLORS.text.tertiary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={emailInput}
                onChangeText={setEmailInput}
                editable={!updatingEmail}
              />
            </View>
            <View style={styles.inputContainer}>
              <Feather name="lock" size={18} color={COLORS.text.tertiary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Obecne hasło"
                placeholderTextColor={COLORS.text.tertiary}
                secureTextEntry
                value={currentPasswordForEmail}
                onChangeText={setCurrentPasswordForEmail}
                editable={!updatingEmail}
              />
            </View>
            <TouchableOpacity
              style={[styles.primaryButton, updatingEmail && styles.disabledButton]}
              onPress={handleUpdateEmail}
              disabled={updatingEmail}
              activeOpacity={0.9}
            >
              {updatingEmail ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.primaryButtonText}>Zaktualizuj e-mail</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Zmień hasło</Text>
            <View style={styles.inputContainer}>
              <Feather name="lock" size={18} color={COLORS.text.tertiary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Obecne hasło"
                placeholderTextColor={COLORS.text.tertiary}
                secureTextEntry
                value={currentPasswordForPassword}
                onChangeText={setCurrentPasswordForPassword}
                editable={!updatingPassword}
              />
            </View>
            <View style={styles.inputContainer}>
              <Feather name="key" size={18} color={COLORS.text.tertiary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Nowe hasło"
                placeholderTextColor={COLORS.text.tertiary}
                secureTextEntry
                value={newPassword}
                onChangeText={setNewPassword}
                editable={!updatingPassword}
              />
            </View>
            <View style={styles.inputContainer}>
              <Feather name="key" size={18} color={COLORS.text.tertiary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Powtórz nowe hasło"
                placeholderTextColor={COLORS.text.tertiary}
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                editable={!updatingPassword}
              />
            </View>
            <TouchableOpacity
              style={[styles.primaryButton, updatingPassword && styles.disabledButton]}
              onPress={handleChangePassword}
              disabled={updatingPassword}
              activeOpacity={0.9}
            >
              {updatingPassword ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.primaryButtonText}>Zmień hasło</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={[styles.card, styles.dangerCard]}>
            <Text style={styles.cardTitle}>Usuń konto</Text>
            <Text style={styles.dangerDescription}>
              Zaplanowanie usunięcia konta wyloguje Cię natychmiast. Operacja jest nieodwracalna.
            </Text>
            <View style={styles.inputContainer}>
              <Feather name="message-circle" size={18} color={COLORS.text.tertiary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Powód (opcjonalnie)"
                placeholderTextColor={COLORS.text.tertiary}
                value={deleteReason}
                onChangeText={setDeleteReason}
                editable={!deletingAccount}
              />
            </View>
            <View style={styles.inputContainer}>
              <Feather name="lock" size={18} color={COLORS.text.tertiary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Obecne hasło"
                placeholderTextColor={COLORS.text.tertiary}
                secureTextEntry
                value={deletePassword}
                onChangeText={setDeletePassword}
                editable={!deletingAccount}
              />
            </View>
            <TouchableOpacity
              style={[styles.dangerButton, deletingAccount && styles.disabledButton]}
              onPress={() => setIsDeleteModalVisible(true)}
              disabled={deletingAccount}
              activeOpacity={0.9}
            >
              {deletingAccount ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.dangerButtonText}>Usuń konto</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmModal
        visible={isDeleteModalVisible}
        title="Usunąć konto?"
        message="Twoje konto zostanie oznaczone do usunięcia i nastąpi wylogowanie. Czy na pewno chcesz kontynuować?"
        confirmText="Usuń"
        cancelText="Anuluj"
        onConfirm={handleDeleteAccount}
        onCancel={() => setIsDeleteModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background
  },
  container: {
    flex: 1
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 32
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 8
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2
  },
  title: {
    fontFamily: 'Quicksand-Bold',
    fontSize: 22,
    color: COLORS.text.primary
  },
  subtitle: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 14,
    color: COLORS.text.secondary,
    marginTop: 2
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 1
  },
  dangerCard: {
    borderWidth: 1,
    borderColor: 'rgba(255, 181, 167, 0.5)'
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  cardTitle: {
    fontFamily: 'Quicksand-Bold',
    fontSize: 16,
    color: COLORS.text.primary
  },
  refreshButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center'
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  label: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 13,
    color: COLORS.text.secondary
  },
  value: {
    fontFamily: 'Quicksand-Bold',
    fontSize: 16,
    color: COLORS.text.primary,
    marginTop: 4
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12
  },
  badgeSuccess: {
    backgroundColor: '#E7F8F3'
  },
  badgeWarning: {
    backgroundColor: '#FFF4E5'
  },
  badgeText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 12
  },
  badgeTextSuccess: {
    color: COLORS.mint
  },
  badgeTextWarning: {
    color: COLORS.peach
  },
  badgeIcon: {
    marginRight: 6
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6
  },
  metaText: {
    marginLeft: 8,
    fontFamily: 'Quicksand-Regular',
    fontSize: 13,
    color: COLORS.text.secondary
  },
  secondaryButton: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: COLORS.lavenderSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  },
  secondaryButtonText: {
    marginLeft: 8,
    fontFamily: 'Quicksand-Medium',
    fontSize: 14,
    color: COLORS.text.secondary
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
    backgroundColor: COLORS.white
  },
  inputIcon: {
    marginRight: 10
  },
  input: {
    flex: 1,
    fontFamily: 'Quicksand-Regular',
    fontSize: 14,
    color: COLORS.text.primary
  },
  primaryButton: {
    backgroundColor: COLORS.lavender,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  primaryButtonText: {
    fontFamily: 'Quicksand-Bold',
    fontSize: 15,
    color: COLORS.white
  },
  disabledButton: {
    opacity: 0.7
  },
  dangerDescription: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 13,
    color: COLORS.text.secondary,
    marginBottom: 10,
    lineHeight: 18
  },
  dangerButton: {
    backgroundColor: COLORS.peach,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  dangerButtonText: {
    fontFamily: 'Quicksand-Bold',
    fontSize: 15,
    color: COLORS.white
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8
  },
  loadingText: {
    marginLeft: 10,
    fontFamily: 'Quicksand-Regular',
    fontSize: 14,
    color: COLORS.text.secondary
  }
});
