import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, BackHandler, Linking, Alert, Platform, AppState } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { useFocusEffect, useNavigation, useRoute, CommonActions } from "@react-navigation/native";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { SPACING } from "../../theme/spacing";
import { buildCheckoutHtml } from "./checkoutHtmlTemplate";
import { verifyPayment, recoverPayment } from "../../services/paymentService";
import { markOrderStatus } from "../../services/ordersService";

// Replaces the old "open the hosted checkout page in the external
// browser" flow (Linking.openURL). Supabase Edge Functions don't serve
// real HTML/JS on this project's default *.supabase.co domain (only with
// a paid custom domain) - GET responses with Content-Type: text/html get
// silently rewritten to text/plain and any <script> is blocked from
// running. That's the actual cause of "Buy Now opens a page but tapping
// Pay does nothing": the checkout page's script never executed, so the
// Razorpay modal never opened.
//
// Fix: the app now builds the checkout HTML itself (checkoutHtmlTemplate)
// and hands it straight to a WebView via source={{ html }} - the
// Razorpay checkout.js script comes from Razorpay's own CDN, not from
// Supabase, so none of the above applies. "pay" only ever returns JSON
// now (see supabase-migration/functions/pay/index.ts).
export default function PaymentCheckoutScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const {
    keyId,
    razorpayOrderId,
    amountPaise,
    productTitle,
    internalOrderId,
    verifyUrl,
    prefillName,
    prefillEmail,
  } = route.params ?? {};

  const [verifying, setVerifying] = useState(false);
  // Guards against the WebView firing more than one message for the same
  // attempt (e.g. a dismiss event arriving right after a handler event).
  const settledRef = useRef(false);

  const missingParams =
    !keyId || !razorpayOrderId || !amountPaise || !internalOrderId || !verifyUrl;

  function resetTo(screenName: string, params?: Record<string, unknown>) {
    navigation.dispatch(
      CommonActions.reset({
        index: 1,
        routes: [{ name: "Home" }, { name: screenName, params }],
      })
    );
  }

  const goToFailed = useCallback(
    (reason?: string) => {
      if (internalOrderId) {
        markOrderStatus(internalOrderId, "failed").catch(() => {});
      }
      resetTo("PaymentFailed", { title: productTitle, reason });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [internalOrderId, productTitle]
  );

  async function handleMessage(event: WebViewMessageEvent) {
    if (settledRef.current) return;

    let message: any;
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }

    if (message.type === "success") {
      settledRef.current = true;
      setVerifying(true);
      try {
        const result = await verifyPayment(verifyUrl, {
          internalOrderId,
          razorpay_order_id: message.razorpay_order_id,
          razorpay_payment_id: message.razorpay_payment_id,
          razorpay_signature: message.razorpay_signature,
        });

        if (result.success) {
          resetTo("PaymentSuccess", {
            title: productTitle,
            amount: result.amount,
            orderId: internalOrderId,
          });
        } else {
          goToFailed(result.message || "Payment verification failed.");
        }
      } catch {
        // The payment may well have succeeded on Razorpay's side even if
        // this network call failed - don't claim it failed outright.
        goToFailed(
          `Payment may have succeeded but verification could not be confirmed. Payment ID: ${message.razorpay_payment_id || "unknown"}. Please check My Purchases or contact support.`
        );
      } finally {
        setVerifying(false);
      }
      return;
    }

    if (message.type === "failed") {
      settledRef.current = true;
      goToFailed(message.reason || "Payment failed.");
      return;
    }

    if (message.type === "cancelled") {
      settledRef.current = true;
      if (internalOrderId) {
        markOrderStatus(internalOrderId, "failed").catch(() => {});
      }
      navigation.goBack();
    }
  }

  // RECOVERY: covers the case where Checkout's success callback never made
  // it out of the WebView at all - most commonly Android killing the
  // WebView's renderer process while the app was backgrounded for a UPI
  // app switch (PhonePe/GPay). The student's payment can genuinely go
  // through on Razorpay's side even though this screen never heard about
  // it (stuck on "Verifying payment..." / a WebView crash page forever).
  // Runs whenever: (a) the app comes back to the foreground while this
  // screen is open and unsettled, or (b) the WebView's renderer process
  // itself crashes. Safe to call even when nothing was actually paid yet -
  // it just comes back { success: false } and this screen keeps waiting.
  const recovering = useRef(false);
  const runRecoveryCheck = useCallback(async () => {
    if (settledRef.current || recovering.current) return;
    if (!verifyUrl || !internalOrderId) return;
    recovering.current = true;
    setVerifying(true);
    try {
      const result = await recoverPayment(verifyUrl, internalOrderId);
      if (result.success) {
        settledRef.current = true;
        resetTo("PaymentSuccess", {
          title: productTitle,
          amount: result.amount,
          orderId: internalOrderId,
        });
      }
      // If not successful yet, say nothing and let the student keep
      // watching/retry - the payment may just not have gone through yet,
      // or may still be in progress in the UPI app.
    } catch {
      // Transient network hiccup while checking - stay quiet, next resume
      // or retry will check again.
    } finally {
      recovering.current = false;
      if (!settledRef.current) setVerifying(false);
    }
  }, [verifyUrl, internalOrderId, productTitle]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") runRecoveryCheck();
    });
    return () => sub.remove();
  }, [runRecoveryCheck]);

  // Android-only: fires when the WebView's own renderer process is killed
  // by the OS (typically under memory pressure right after the app was
  // backgrounded for a UPI app switch) - shows as a native "Something went
  // wrong" page with no way for our postMessage-based success callback to
  // ever arrive. Treat it the same as an app-resume: check with Razorpay
  // directly instead of leaving the student stuck on a dead WebView.
  const handleRenderProcessGone = useCallback(() => {
    runRecoveryCheck();
  }, [runRecoveryCheck]);

  // Hardware back button during an in-flight payment shouldn't leave a
  // half-finished order and a confusing state - treat it the same as the
  // Razorpay modal being dismissed.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (settledRef.current || verifying) return true; // swallow while verifying
        settledRef.current = true;
        if (internalOrderId) {
          markOrderStatus(internalOrderId, "failed").catch(() => {});
        }
        navigation.goBack();
        return true;
      });
      return () => sub.remove();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [internalOrderId, verifying])
  );

  // BUG FIX ("UPI options don't do anything when tapped"): Razorpay's UPI
  // block (see checkoutHtmlTemplate.ts) is enabled and does render PhonePe /
  // Google Pay / Paytm / other installed UPI apps - but selecting one makes
  // checkout.js try to navigate the WebView itself to a deep link
  // (upi://pay?..., tez://upi/pay?..., phonepe://..., paytmmp://..., or an
  // Android intent://...#Intent;...end URL). A WebView has no way to "load"
  // those - they aren't http(s) pages - so without interception the
  // navigation just silently fails and the UPI app never opens.
  //
  // Fix: intercept every navigation attempt before the WebView acts on it.
  // Anything that isn't a normal http(s) URL (i.e. an app deep link) gets
  // handed to the OS via Linking.openURL instead, which is what actually
  // launches the matching UPI app - and we tell the WebView not to try
  // loading it itself (return false).
  const handleShouldStartLoad = useCallback((request: { url: string }) => {
    const url = request.url;
    const isWebUrl = url.startsWith("http://") || url.startsWith("https://") || url.startsWith("about:");

    if (isWebUrl) return true;

    // Android sends UPI app choices as intent://...#Intent;scheme=upi;...end
    // URLs. Extract the S.browser_fallback_url if present (points to the
    // Play Store listing when the app isn't installed); otherwise just try
    // the intent URL itself - Linking on Android can resolve these directly.
    let target = url;
    if (Platform.OS === "android" && url.startsWith("intent://")) {
      const fallbackMatch = url.match(/S\.browser_fallback_url=([^;]+)/);
      if (fallbackMatch) {
        target = decodeURIComponent(fallbackMatch[1]);
      }
    }

    Linking.openURL(target).catch(() => {
      Alert.alert(
        "App not found",
        "The selected UPI app isn't installed on this device. Please choose another payment method."
      );
    });

    return false;
  }, []);

  if (missingParams) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Could not open the payment page. Please try again.</Text>
      </View>
    );
  }

  const html = buildCheckoutHtml({
    keyId,
    razorpayOrderId,
    amountPaise,
    productTitle: productTitle || "MedVeda purchase",
    prefillName,
    prefillEmail,
  });

  return (
    <View style={styles.container}>
      <WebView
        source={{ html }}
        onMessage={handleMessage}
        onShouldStartLoadWithRequest={handleShouldStartLoad}
        onRenderProcessGone={handleRenderProcessGone}
        style={styles.webview}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.center}>
            <ActivityIndicator color={COLORS.accent} size="large" />
          </View>
        )}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
      />
      {verifying && (
        <View style={styles.overlay}>
          <ActivityIndicator color={COLORS.accent} size="large" />
          <Text style={styles.overlayText}>Verifying payment...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  webview: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
    padding: SPACING.xl,
  },
  errorText: {
    color: COLORS.text,
    fontSize: FONT.body,
    textAlign: "center",
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(16, 12, 10, 0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  overlayText: {
    color: COLORS.text,
    fontSize: FONT.body,
    marginTop: SPACING.md,
  },
});
