const { getDefaultConfig } = require("@expo/metro-config");
const { withSentryConfig } = require("@sentry/react-native/metro");

// Get the default Expo Metro config
const defaultConfig = getDefaultConfig(__dirname);

// Apply Sentry configuration
const config = withSentryConfig(defaultConfig);

module.exports = config;
