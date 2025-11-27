import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from '../../styles/colors';

export default function SynthesisHeader({ isOnline, onMenuPress }) {
  return (
    <View style={styles.header}>
      {isOnline ? (
        <TouchableOpacity
          style={styles.backButton}
          onPress={onMenuPress}
        >
          <Feather name="menu" size={24} color={COLORS.text.primary} />
        </TouchableOpacity>
      ) : (
        <View style={styles.backButton} />
      )}

      <Text style={styles.headerTitle}>DawnoTemu</Text>

      <View style={styles.avatarContainer}>
        <Image
          source={require('../../assets/images/logo.png')}
          style={styles.avatar}
          resizeMode="contain"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 64,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    zIndex: 10,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerTitle: {
    fontFamily: 'Comfortaa-Regular',
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text.primary,
    flex: 1,
    textAlign: 'center',
  },
  avatarContainer: {
    flex: 1,
    alignItems: 'flex-end',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16
  },
});
