import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../../styles/colors';

const WELCOME_FEATURES = [
  { icon: 'star', label: '10 Punktów Magii na start' },
  { icon: 'mic', label: 'Nagrywanie głosu' },
  { icon: 'book-open', label: 'Generowanie bajek' },
  { icon: 'headphones', label: 'Odtwarzanie offline' }
];

export default function OnboardingModal({ visible, trialDays, priceLabel, onDismiss }) {
  if (!visible) return null;

  // Fallback of 14 must match the server-configured trial period
  const displayDays = typeof trialDays === 'number' && trialDays > 0 ? trialDays : 14;
  const displayPrice = priceLabel || null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <TouchableWithoutFeedback onPress={onDismiss}>
        <BlurView intensity={20} style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <View style={styles.modalContainer}>
              <View style={styles.content}>
                <Text style={styles.title}>Witaj w DawnoTemu!</Text>
                <Text style={styles.subtitle}>
                  Masz {displayDays} dni za darmo, żeby wypróbować wszystko.
                </Text>

                <View style={styles.featuresList}>
                  {WELCOME_FEATURES.map((feature) => (
                    <View key={feature.label} style={styles.featureRow}>
                      <View style={styles.featureIconContainer}>
                        <Feather name={feature.icon} size={16} color={COLORS.lavender} />
                      </View>
                      <Text style={styles.featureText}>{feature.label}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.separator} />

                {displayPrice && (
                  <Text style={styles.afterTrialText}>
                    Po okresie próbnym: {displayPrice}/mies. za pełen dostęp i 26 punktów.
                  </Text>
                )}
              </View>

              <TouchableOpacity
                style={styles.ctaButton}
                onPress={onDismiss}
                activeOpacity={0.9}
              >
                <Text style={styles.ctaButtonText}>Zaczynamy!</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </BlurView>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)'
  },
  modalContainer: {
    width: '90%',
    maxWidth: 400,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10
  },
  content: {
    padding: 24
  },
  title: {
    fontFamily: 'Quicksand-Bold',
    fontSize: 22,
    color: COLORS.text.primary,
    textAlign: 'center',
    marginBottom: 8
  },
  subtitle: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 15,
    color: COLORS.text.secondary,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22
  },
  featuresList: {
    marginBottom: 16
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  },
  featureIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: COLORS.lavenderSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12
  },
  featureText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 14,
    color: COLORS.text.primary,
    flex: 1
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    marginBottom: 12
  },
  afterTrialText: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 13,
    color: COLORS.text.tertiary,
    textAlign: 'center',
    lineHeight: 18
  },
  ctaButton: {
    backgroundColor: COLORS.lavender,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  ctaButtonText: {
    fontFamily: 'Quicksand-Bold',
    fontSize: 16,
    color: COLORS.white
  }
});
