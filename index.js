// Custom entry that runs BEFORE expo-router/entry-classic mounts the root
// component. We need this for two reasons:
//
// 1. expo-router 6.0.12 ships a Sitemap view that reads `window.location.origin`
//    unconditionally. On React Native `window.location` is `undefined`, so any
//    deep link / push notification / mistyped `dawnotemu://...` URL that
//    bounces through the auto-generated `/_sitemap` or `+not-found` routes
//    crashes the app with a fatal C++ exception (REACT-NATIVE-16, 2026-04-28).
//    Defining a no-op `globalThis.location` makes the read return an empty
//    string and the screen renders fine.
//
// 2. `react-native-url-polyfill` is in `package.json` deps but was never
//    imported anywhere. Hermes 0.81's URL implementation has known gaps
//    (`URL.canParse`, `searchParams.size`, etc.). Importing the polyfill
//    here makes URL parsing identical across Hermes versions and OTA bundles.
if (typeof globalThis.location === 'undefined') {
  globalThis.location = { origin: '' };
}

require('react-native-url-polyfill/auto');
require('expo-router/entry');
