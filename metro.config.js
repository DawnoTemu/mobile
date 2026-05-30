// Sentry's Expo-aware Metro config. Replaces the old getDefaultConfig +
// withSentryConfig combo, which broke under Expo SDK 55's Metro
// (determineDebugIdFromBundleSource -> .match() on undefined).
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const config = getSentryExpoConfig(__dirname);

module.exports = config;
