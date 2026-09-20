import { Linking } from "react-native";

// Module-level (not React state) so it survives regardless of which
// screen is currently mounted. Registered once, at app root
// (AppNavigator), NOT inside ResetPasswordScreen.
//
// WHY THIS EXISTS: if ResetPasswordScreen registered its own
// Linking.addEventListener, it would miss a "warm start" tap - i.e. the
// app already running in the background when the user taps the email
// link. In that case React Navigation's own linking config reacts to the
// same "url" event and navigates to ResetPasswordScreen, but that
// navigation (and the screen's mount + its own listener registration)
// happens only AFTER the event has already fired and passed - so a
// listener registered inside the screen itself never actually catches
// it, and the recovery token is silently lost.
//
// Registering the listener once at the root instead means it's already
// alive for the app's entire lifetime, so it always catches the event
// (synchronously, before React re-renders/mounts the new screen) and
// simply stores the URL for whichever screen asks for it afterward.
let lastUrl: string | null = null;
let initialized = false;

export function initDeepLinkListener() {
  if (initialized) return;
  initialized = true;

  Linking.getInitialURL().then((url) => {
    if (url) lastUrl = url;
  });

  Linking.addEventListener("url", ({ url }) => {
    lastUrl = url;
  });
}

export function getLastDeepLinkUrl(): string | null {
  return lastUrl;
}

// Called after a successful password reset so a stale (already-used)
// recovery URL can't be picked up again if this screen is somehow
// revisited.
export function clearLastDeepLinkUrl() {
  lastUrl = null;
}