import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../../styles/colors';

const STATUS_TITLES = {
  queued_for_slot: 'Twoja prośba w kolejce',
  allocating_voice: 'Aktywujemy głos',
  processing: 'Tworzenie opowieści',
  downloading: 'Pobieranie nagrania',
  ready: 'Nagranie gotowe',
  error: 'Błąd generowania'
};

const STATUS_ICONS = {
  queued_for_slot: 'clock',
  allocating_voice: 'zap',
  processing: 'loader',
  downloading: 'download-cloud',
  ready: 'check-circle',
  error: 'alert-circle'
};

const ProgressModal = ({
  visible,
  progress,
  status,
  statusKey,
  queuePosition,
  queueLength,
  remoteVoiceId,
  serviceProvider,
  onCancel
}) => {
  const normalisedProgress =
    typeof progress === 'number'
      ? Math.max(0, Math.min(100, progress))
      : 0;
  const formattedProgress = Math.floor(normalisedProgress);
  const statusText = typeof status === 'string' ? status : '';
  const normalizedStatusKey =
    typeof statusKey === 'string' ? statusKey.trim().toLowerCase() : null;
  const title =
    STATUS_TITLES[normalizedStatusKey] || STATUS_TITLES.processing;
  const iconName =
    STATUS_ICONS[normalizedStatusKey] || STATUS_ICONS.processing;
  const isComplete = normalizedStatusKey === 'ready';
  const isError = normalizedStatusKey === 'error';
  const canCancel = typeof onCancel === 'function' && !isComplete;

  const queueLabel =
    queuePosition !== null && queuePosition !== undefined
      ? `Miejsce w kolejce: ${Math.max(1, Number(queuePosition) + 1)}${
          queueLength !== null && queueLength !== undefined
            ? `/${Math.max(1, Number(queueLength))}`
            : ''
        }`
      : null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <View style={styles.modalContent}>
          <View style={styles.headerRow}>
            <Feather
              name={iconName}
              size={28}
              color={isError ? COLORS.error : COLORS.peach}
              style={[
                styles.statusIcon,
                normalizedStatusKey === 'processing' && styles.iconSpinning
              ]}
            />
            <Text style={styles.title}>{title}</Text>
          </View>

          <Text style={styles.status}>{statusText}</Text>

          {queueLabel ? (
            <View style={styles.queuePill}>
              <Feather name="users" size={14} color={COLORS.white} />
              <Text style={styles.queueText}>{queueLabel}</Text>
            </View>
          ) : null}

          
          {/* Progress bar */}
          <View style={styles.progressContainer}>
            <View 
              style={[
                styles.progressBar, 
                { width: `${formattedProgress}%` }
              ]} 
            />
          </View>
          
          <Text style={styles.progressText}>{formattedProgress}%</Text>
          
          {/* Progress indicator */}
          <View style={styles.loadingIndicator}>
            {isComplete ? (
              <Feather
                name="check-circle"
                size={36}
                color={COLORS.mint}
                accessibilityRole="image"
                accessibilityLabel="Generowanie zakończone"
              />
            ) : isError ? (
              <Feather
                name="alert-circle"
                size={36}
                color={COLORS.error}
                accessibilityRole="image"
                accessibilityLabel="Wystąpił błąd"
              />
            ) : (
              <ActivityIndicator size="large" color={COLORS.peach} />
            )}
          </View>
          
          {/* Cancel button */}
          {canCancel ? (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel="Anuluj generowanie"
            >
              <Feather name="x" size={20} color={COLORS.text.secondary} />
              <Text style={styles.cancelText}>Anuluj</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '80%',
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  headerRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  },
  statusIcon: {
    marginRight: 12
  },
  title: {
    fontFamily: 'Quicksand-Bold',
    fontSize: 20,
    color: COLORS.text.primary,
  },
  status: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 16,
    color: COLORS.text.secondary,
    marginBottom: 12,
    textAlign: 'center',
  },
  queuePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
    backgroundColor: COLORS.peach,
    marginBottom: 8,
  },
  queueText: {
    fontFamily: 'Quicksand-SemiBold',
    fontSize: 13,
    color: COLORS.white,
    marginLeft: 6,
  },
  progressContainer: {
    width: '100%',
    height: 8,
    backgroundColor: '#F0F0F0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    backgroundColor: COLORS.peach,
    borderRadius: 4,
  },
  progressText: {
    fontFamily: 'Quicksand-Regular',
    fontSize: 14,
    color: COLORS.text.secondary,
    marginBottom: 24,
  },
  loadingIndicator: {
    marginBottom: 24,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  cancelText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 14,
    color: COLORS.text.secondary,
    marginLeft: 8,
  },
  iconSpinning: {
    // Placeholder class if we later wire animated rotation
  },
});

export default ProgressModal;
