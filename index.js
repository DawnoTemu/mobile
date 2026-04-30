// Custom entry that runs BEFORE expo-router/entry mounts the root component.
// Two side-effects, both removable when the upstream bugs are fixed:
//
// 1. expo-router's Sitemap view (and +not-found fallback) reads
//    `window.location.origin` unconditionally during render. On React Native,
//    `window.location` is undefined → fatal C++ exception, reachable via any
//    deep link / push notification / mistyped scheme URL the router can't
//    match. Defining a no-op `globalThis.location` makes the read return ''
//    and the screen renders. The stub intentionally exposes only `origin`;
//    if future code (e.g. RSC) needs `href`/`pathname`, expand the stub.
//    TODO: remove once expo-router guards the access.
//
// 2. `react-native-url-polyfill` is in package.json deps but never imported.
//    Hermes has gaps in URL (`URL.canParse`, `searchParams.size` etc.).
//    Importing here makes URL parsing identical across Hermes versions and
//    OTA bundles. TODO: remove once Hermes ships full URL support.
if (!globalThis.location || typeof globalThis.location.origin !== 'string') {
  globalThis.location = { origin: '' };
}

require('react-native-url-polyfill/auto');
require('expo-router/entry');
