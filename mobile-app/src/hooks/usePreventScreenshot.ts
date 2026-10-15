import { useEffect } from "react";
import { Platform } from "react-native";
import * as ScreenCapture from "expo-screen-capture";
import { logDebug } from "../utils/logger";

// Anti-piracy protection for paid Notes content.
//
// Platform behavior is genuinely different here, and it's worth being
// honest about that instead of overpromising:
//   - Android: preventScreenCaptureAsync() sets FLAG_SECURE on the window.
//     Any screenshot taken while it's active comes back solid black, and
//     the screen goes black in the recents/app-switcher thumbnail and
//     during screen recording too. This is what actually delivers the
//     "screenshot should come out fully black" behavior.
//   - iOS: Apple does not allow any app to block a screenshot - there is
//     no equivalent of FLAG_SECURE. preventScreenCaptureAsync() on iOS
//     only blurs the app's content in the app-switcher preview and while
//     a screen recording is active; a plain screenshot will still
//     capture the screen normally. There's no source-only way around
//     this restriction.
//
// Mounted once at the app root (see AppNavigator) so protection applies
// everywhere, not just the PDF viewer - matches the "app cha screenshot"
// ask rather than only guarding the Notes/PdfViewer screens.
export default function usePreventScreenshot() {
  useEffect(() => {
    // expo-screen-capture has no web implementation.
    if (Platform.OS === "web" || process.env.EXPO_PUBLIC_DISABLE_SCREENSHOT_BLOCK === "1") return;

    ScreenCapture.preventScreenCaptureAsync().catch((err) => {
      logDebug(`preventScreenCaptureAsync failed (${Platform.OS}):`, err);
    });

    return () => {
      ScreenCapture.allowScreenCaptureAsync().catch(() => {});
    };
  }, []);
}
