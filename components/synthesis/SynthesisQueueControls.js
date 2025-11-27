import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../../styles/colors';

export default function SynthesisQueueControls({
  queueLength,
  autoFillDisabled,
  clearQueueDisabled,
  onAutoFill,
  onClear
}) {
  return (
    <View style={styles.container}>
      <View style={styles.queueSummary}>
        <Feather name="list" size={16} color={COLORS.text.secondary} />
        <Text style={styles.queueSummaryText}>W kolejce: {queueLength}</Text>
      </View>
      <View style={styles.queueActions}>
        <TouchableOpacity
          style={[
            styles.queueButton,
            styles.queueButtonFirst,
            styles.queueButtonPrimary,
            autoFillDisabled && styles.queueButtonDisabled
          ]}
          onPress={onAutoFill}
          disabled={autoFillDisabled}
          activeOpacity={0.85}
        >
          <Feather name="plus-circle" size={16} color={COLORS.white} />
          <Text style={[styles.queueButtonText, styles.queueButtonTextPrimary]}>
            Uzupełnij kolejkę
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.queueButton,
            styles.queueButtonSecondary,
            clearQueueDisabled && styles.queueButtonDisabled
          ]}
          onPress={onClear}
          disabled={clearQueueDisabled}
          activeOpacity={0.85}
        >
          <Feather
            name="trash-2"
            size={16}
            color={clearQueueDisabled ? COLORS.text.tertiary : COLORS.lavender}
          />
          <Text
            style={[
              styles.queueButtonText,
              styles.queueButtonTextSecondary,
              clearQueueDisabled && styles.queueButtonTextDisabled
            ]}
          >
            Wyczyść kolejkę
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  queueSummary: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  queueSummaryText: {
    marginLeft: 6,
    fontFamily: 'Quicksand-Medium',
    fontSize: 13,
    color: COLORS.text.secondary,
  },
  queueActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  queueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginLeft: 10,
  },
  queueButtonFirst: {
    marginLeft: 0,
  },
  queueButtonPrimary: {
    backgroundColor: COLORS.peach,
    borderColor: COLORS.peach,
  },
  queueButtonSecondary: {
    backgroundColor: 'rgba(218, 143, 255, 0.12)',
    borderColor: 'rgba(218, 143, 255, 0.35)',
  },
  queueButtonDisabled: {
    opacity: 0.6,
  },
  queueButtonText: {
    fontFamily: 'Quicksand-Medium',
    fontSize: 13,
    marginLeft: 8,
  },
  queueButtonTextPrimary: {
    color: COLORS.white,
  },
  queueButtonTextSecondary: {
    color: COLORS.lavender,
  },
  queueButtonTextDisabled: {
    color: COLORS.text.tertiary,
  },
});
