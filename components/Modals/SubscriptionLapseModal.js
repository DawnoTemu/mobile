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

export default function SubscriptionLapseModal({ visible, onSubscribe, onDismiss }) {
  if (!visible) return null;

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
                <View style={styles.iconContainer}>
                  <Feather name="alert-circle" size={32} color={COLORS.peach} />
                </View>

                <Text style={styles.title}>Twoja subskrypcja wygasła</Text>

                <Text style={styles.message}>
                  Odtwarzaj zapisane bajki bez zmian. Aby generować nowe, odnów subskrypcję.
                </Text>
              </View>

              <View style={styles.buttonsContainer}>
                <TouchableOpacity
                  style={styles.dismissButton}
                  onPress={onDismiss}
                  activeOpacity={0.7}
                >
                  <Text style={styles.dismissButtonText}>Później</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.subscribeButton}
                  onPress={onSubscribe}
                  activeOpacity={0.9}
                >
                  <Text style={styles.subscribeButtonText}>Odnów subskrypcję</Text>
                </TouchableOpacity>
              </View>
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
    padding: 24,
    alignItems: 'center'
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFF4E5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16
  },
  title: {
    fontFamily: 'Quicksand-Bold',
    fontSize: 18,
    color: COLORS.text.primary,
    textAlign: 'center',
    marginBottom: 12
  },
  message: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 15,
    color: COLORS.text.secondary,
    textAlign: 'center',
    lineHeight: 22
  },
  buttonsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)'
  },
  dismissButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginRight: 12
  },
  dismissButtonText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 15,
    color: COLORS.text.secondary
  },
  subscribeButton: {
    backgroundColor: COLORS.lavender,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10
  },
  subscribeButtonText: {
    fontFamily: 'Quicksand-Bold',
    fontSize: 15,
    color: COLORS.white
  }
});
