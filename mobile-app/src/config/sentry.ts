import * as Sentry from "@sentry/react-native";
import * as Application from "expo-application";

// Runs once, as a side effect, the moment this module is first imported -
// imported at the very top of navigation/AppNavigator.tsx (the app's
// startup file) so it initializes before anything else can throw.
//
// EXPO_PUBLIC_SENTRY_DSN must be provided to production builds (an EAS environment
// variable named EXPO_PUBLIC_SENTRY_DSN; see supabase/DEPLOY_ORDER.md). Without it Sentry stays
// off and crashes are not reported - the app itself is unaffected.
//
// Privacy: crash reports must not carry student data. sendDefaultPii is off, no user object is
// ever attached, request bodies/headers/cookies and console/navigation breadcrumbs are stripped
// before sending, and messages are scrubbed of e-mail addresses, phone numbers and tokens.
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

const SCRUBBERS: [RegExp, string][] = [
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]"],
  [/\+?\d[\d\s().-]{8,}\d/g, "[number]"],
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*/g, "[jwt]"],
  [/(pay|order|rzp)_[A-Za-z0-9]{6,}/g, "[razorpay-id]"],
];

function scrub(text: string | undefined): string | undefined {
  if (!text) return text;
  return SCRUBBERS.reduce((acc, [re, to]) => acc.replace(re, to), text);
}

Sentry.init({
  dsn,
  enabled: !__DEV__ && Boolean(dsn),
  environment: __DEV__ ? "development" : "production",
  release: Application.applicationId && Application.nativeApplicationVersion
    ? `${Application.applicationId}@${Application.nativeApplicationVersion}+${Application.nativeBuildVersion ?? "0"}`
    : undefined,
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
  maxBreadcrumbs: 30,
  attachScreenshot: false,
  attachViewHierarchy: false,
  beforeBreadcrumb(breadcrumb) {
    // console output and navigation params can contain personal data
    if (breadcrumb.category === "console" || breadcrumb.category === "navigation") return null;
    return breadcrumb;
  },
  beforeSend(event) {
    delete event.user;
    delete event.request;
    if (event.message) event.message = scrub(event.message);
    for (const ex of event.exception?.values ?? []) ex.value = scrub(ex.value);
    if (event.extra) delete event.extra;
    return event;
  },
});

export { Sentry };
