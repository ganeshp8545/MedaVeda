import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { CommonActions, useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import {
  createPlayOrder,
  fetchMatchingPlayProduct,
  PlayBillingEvent,
  startPlayPurchase,
  subscribePlayBilling,
} from "../../services/playBillingService";
import { fetchOrderQuote } from "../../services/referralsService";
import { supabase } from "../../config/supabase";
import { paymentProvider } from "../../config/paymentProvider";
import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { SPACING } from "../../theme/spacing";
import type { RootStackParamList } from "../../types/navigation";

export default function PlayBillingScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "PlayBilling">>();
  const { productId, productTitle } = route.params;
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [playPrice, setPlayPrice] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<{ offerToken: string; order: Awaited<ReturnType<typeof createPlayOrder>> } | null>(null);
  const started = useRef(false);
  const settled = useRef(false);
  const currentOrderId = useRef<string | null>(null);

  useEffect(() => subscribePlayBilling((event: PlayBillingEvent) => {
    if (settled.current || event.attempt.internalOrderId !== currentOrderId.current) return;
    if (event.type === "success") {
      settled.current = true;
      navigation.dispatch(CommonActions.reset({
        index: 1,
        routes: [
          { name: "Home" },
          {
            name: "PaymentSuccess",
            params: {
              title: event.result.productTitle ?? productTitle,
              amount: event.result.amount,
              orderId: event.attempt.internalOrderId,
            },
          },
        ],
      }));
    } else if (event.type === "pending") {
      settled.current = true;
      navigation.dispatch(CommonActions.reset({
        index: 1,
        routes: [
          { name: "Home" },
          {
            name: "PaymentFailed",
            params: {
              title: productTitle,
              pending: true,
              provider: "play",
              internalOrderId: event.attempt.internalOrderId,
            },
          },
        ],
      }));
    } else if (event.type === "cancel") {
      settled.current = true;
      navigation.goBack();
    } else if (event.type === "error") {
      setWorking(false);
      setPrepared(null);
      setPlayPrice(null);
      setMessage(event.message);
    }
  }), [navigation, productId, productTitle]);

  const prepare = async () => {
    if (working || !productId || Platform.OS !== "android") return;
    if (paymentProvider !== "play") {
      setMessage("Google Play Billing is not enabled for this distribution.");
      return;
    }
    try {
      setWorking(true);
      setMessage(null);
      // Both the quote and Play SKU are derived from server-side product data.
      // The quote's list price is compared with Play's live INR price.
      const quote = await fetchOrderQuote(productId, false);
      if (!quote.ok || !Number.isFinite(quote.listPrice)) {
        throw new Error("This product is no longer available.");
      }
      const order = await createPlayOrder(productId);
      if (!order.internalOrderId || !order.playSku || !order.purchaseOptionId) {
        throw new Error("Could not prepare Play payment.");
      }
      currentOrderId.current = order.internalOrderId;
      if (!Number.isFinite(order.amountInr) || Math.abs(order.amountInr - quote.listPrice) > 0.005) {
        throw new Error("The product price changed. Please try again.");
      }
      const offer = await fetchMatchingPlayProduct(order.playSku, order.amountInr);
      setPlayPrice(offer.formattedPrice);
      setPrepared({ offerToken: offer.offerToken, order });
      setWorking(false);
    } catch (error) {
      setWorking(false);
      setPrepared(null);
      setPlayPrice(null);
      setMessage(error instanceof Error ? error.message : "Could not start Play payment.");
    }
  };

  const pay = async () => {
    if (!prepared || working) return;
    try {
      setWorking(true);
      setMessage(null);
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user.id;
      if (!userId) throw new Error("Please log in before purchasing.");
      await startPlayPurchase({ userId, productId,
        productTitle: productTitle ?? "MedVeda purchase", ...prepared.order }, prepared.offerToken);
    } catch (error) {
      setWorking(false);
      setPrepared(null);
      setPlayPrice(null);
      setMessage(error instanceof Error ? error.message : "Could not start Play payment.");
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void prepare();
    // Run once for this screen instance. Retry is an explicit button below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Choose how to pay</Text>
      <Text style={styles.description}>
        Google Play will show the payment options available to you.
      </Text>
      {playPrice && <Text style={styles.price}>Google Play price: {playPrice}</Text>}
      {working && <ActivityIndicator color={COLORS.accent} size="large" style={styles.spinner} />}
      {message && <Text style={styles.error}>{message}</Text>}
      {!working && (
        <TouchableOpacity style={styles.button} onPress={() => { void (prepared ? pay() : prepare()); }}>
          <Text style={styles.buttonText}>{prepared ? `Pay ${playPrice}` : message ? "Try again" : "Continue"}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    padding: SPACING.xl,
  },
  title: { color: COLORS.text, fontSize: FONT.title, fontWeight: "700", textAlign: "center" },
  description: { color: COLORS.subtitle, fontSize: FONT.body, textAlign: "center", marginTop: SPACING.md },
  price: { color: COLORS.text, fontSize: FONT.title, fontWeight: "700", textAlign: "center", marginTop: SPACING.xl },
  spinner: { marginTop: SPACING.xl },
  error: { color: COLORS.error, fontSize: FONT.body, textAlign: "center", marginTop: SPACING.xl },
  button: { backgroundColor: COLORS.accent, padding: SPACING.md, borderRadius: 10, marginTop: SPACING.xl },
  buttonText: { color: COLORS.white, textAlign: "center", fontWeight: "700" },
});
