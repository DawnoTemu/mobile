const { getDefaultConfig } = require("@expo/metro-config");
const { withSentryConfig } = require("@sentry/react-native/metro");

// Get the default Expo Metro config
const config = getDefaultConfig(__dirname);

module.exports = withSentryConfig(config);
