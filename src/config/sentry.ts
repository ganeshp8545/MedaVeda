import * as Sentry from "@sentry/react-native";

// Runs once, as a side effect, the moment this module is first imported -
// imported at the very top of navigation/AppNavigator.tsx (the app's
// startup file) so it initializes before anything else can throw.
//
// EXPO_PUBLIC_SENTRY_DSN must be set in your .env (and in EAS Build's
// environment variables for production builds) - get the DSN from
// Sentry.io -> Settings -> Projects -> <your project> -> Client Keys (DSN).
// Safe to leave unset during local development: Sentry.init silently
// no-ops without a dsn, and `enabled: !__DEV__` skips it in dev anyway.
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled: !__DEV__,
  tracesSampleRate: 0.2,
});

export { Sentry };