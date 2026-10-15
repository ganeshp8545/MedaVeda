import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { sha256 } from "js-sha256";
import type { Purchase, PurchaseAndroid } from "expo-iap";

import { supabase } from "../config/supabase";
import { getOrdersByUser } from "../repositories/ordersRepository";
import { Order } from "../types/order";

const projectUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const attemptKey = (userId: string) => `medveda:play-attempt:${userId}`;

class BillingApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export interface PlayOrder {
  internalOrderId: string;
  playSku: string;
}

export interface PlayAttempt extends PlayOrder {
  userId: string;
  productId: string;
  productTitle: string;
}

export interface PlayVerifyResult {
  success: boolean;
  pending?: boolean;
  internalOrderId?: string;
  amount?: number;
  productTitle?: string;
  message?: string;
}

export type PlayBillingEvent =
  | { type: "success"; attempt: PlayAttempt; result: PlayVerifyResult }
  | { type: "pending"; attempt: PlayAttempt }
  | { type: "cancel"; attempt: PlayAttempt }
  | { type: "error"; attempt: PlayAttempt; message: string };

type Listener = (event: PlayBillingEvent) => void;
const listeners = new Set<Listener>();
const inFlightTokens = new Set<string>();
let activeAttempt: PlayAttempt | null = null;
let connection: Promise<typeof import("expo-iap")> | null = null;

function emit(event: PlayBillingEvent): void {
  listeners.forEach((listener) => listener(event));
}

function isAndroidPurchase(purchase: Purchase): purchase is PurchaseAndroid {
  return purchase.platform === "android";
}

export function subscribePlayBilling(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function obfuscatedPlayId(value: string): string {
  return sha256(value);
}

async function authenticatedPost<T>(name: string, payload: Record<string, string>): Promise<T> {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error("Please log in before purchasing.");
  const response = await fetch(`${projectUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session.access_token}`,
    },
    body: JSON.stringify(payload),
  });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "error" in body
      ? String(body.error)
      : "Could not confirm the purchase.";
    throw new BillingApiError(message, response.status);
  }
  return body as T;
}

export async function createPlayOrder(productId: string): Promise<PlayOrder> {
  return authenticatedPost<PlayOrder>("create-play-order", { productId });
}

export async function verifyPlayPurchase(
  attempt: PlayAttempt,
  purchaseToken: string
): Promise<PlayVerifyResult> {
  return authenticatedPost<PlayVerifyResult>("verify-play-purchase", {
    purchaseToken,
    productId: attempt.productId,
    internalOrderId: attempt.internalOrderId,
  });
}

export async function attachExternalToken(
  attempt: PlayAttempt,
  externalTransactionToken: string
): Promise<void> {
  const result = await authenticatedPost<{ ok: boolean }>("attach-external-token", {
    internalOrderId: attempt.internalOrderId,
    externalTransactionToken,
  });
  if (result.ok !== true) throw new Error("Could not attach the alternative payment token.");
}

async function saveAttempt(attempt: PlayAttempt): Promise<void> {
  activeAttempt = attempt;
  await AsyncStorage.setItem(attemptKey(attempt.userId), JSON.stringify(attempt));
}

async function clearAttempt(attempt: PlayAttempt): Promise<void> {
  if (activeAttempt?.internalOrderId === attempt.internalOrderId) activeAttempt = null;
  const key = attemptKey(attempt.userId);
  const stored = await AsyncStorage.getItem(key);
  if (stored) {
    try {
      const current = JSON.parse(stored) as PlayAttempt;
      if (current.internalOrderId === attempt.internalOrderId) await AsyncStorage.removeItem(key);
    } catch {
      await AsyncStorage.removeItem(key);
    }
  }
}

async function lookupAttemptForPurchase(purchase: Purchase): Promise<PlayAttempt | null> {
  if (Platform.OS !== "android" || !isAndroidPurchase(purchase)) return null;
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return null;
  const accountHash = obfuscatedPlayId(userId);
  if (purchase.obfuscatedAccountIdAndroid !== accountHash) return null;

  const stored = await AsyncStorage.getItem(attemptKey(userId));
  if (stored) {
    try {
      const attempt = JSON.parse(stored) as PlayAttempt;
      if (attempt.userId === userId && attempt.playSku === purchase.productId &&
          obfuscatedPlayId(attempt.internalOrderId) === purchase.obfuscatedProfileIdAndroid) {
        activeAttempt = attempt;
        return attempt;
      }
    } catch {
      await AsyncStorage.removeItem(attemptKey(userId));
    }
  }

  // A process death may remove local state. The order ID hash in the Play
  // receipt still identifies the server-created order without trusting the client.
  const orders = await getOrdersByUser(userId);
  const order = orders.find((candidate: Order) =>
    candidate.provider === "play" && candidate.playSku === purchase.productId &&
    obfuscatedPlayId(candidate.id) === purchase.obfuscatedProfileIdAndroid
  );
  if (!order) return null;
  return {
    userId,
    internalOrderId: order.id,
    productId: order.productId,
    productTitle: order.productTitle ?? "MedVeda purchase",
    playSku: order.playSku!,
  };
}

async function handlePurchase(purchase: Purchase): Promise<void> {
  if (Platform.OS !== "android" || !purchase.purchaseToken) return;
  const token = purchase.purchaseToken;
  if (inFlightTokens.has(token)) return;
  inFlightTokens.add(token);
  try {
    const attempt = await lookupAttemptForPurchase(purchase);
    if (!attempt) return;
    if (purchase.purchaseState === "pending") {
      emit({ type: "pending", attempt });
      return;
    }
    if (purchase.purchaseState !== "purchased") return;
    try {
      const result = await verifyPlayPurchase(attempt, token);
      if (result.success) {
        // Server consumes the reusable price-tier SKU only after its atomic
        // grant. Do not also call finishTransaction on the client.
        await clearAttempt(attempt);
        emit({ type: "success", attempt, result });
      } else if (result.pending) {
        emit({ type: "pending", attempt });
      } else {
        emit({ type: "error", attempt, message: result.message ?? "Payment verification failed." });
      }
    } catch (error) {
      if (error instanceof BillingApiError && error.status >= 400 &&
          error.status < 500 && error.status !== 401 && error.status !== 429) {
        emit({ type: "error", attempt, message: error.message });
      } else {
        // The purchase may already be paid. Keep it available for another
        // server verification on resume instead of showing a hard failure.
        emit({ type: "pending", attempt });
      }
    }
  } finally {
    inFlightTokens.delete(token);
  }
}

export async function ensurePlayBilling(): Promise<typeof import("expo-iap")> {
  if (Platform.OS !== "android") throw new Error("Play Billing is available on Android only.");
  if (!connection) {
    connection = (async () => {
      const iap = await import("expo-iap");
      const subscriptions = [
        iap.purchaseUpdatedListener((purchase) => {
          void handlePurchase(purchase).catch(() => {
            // A transient lookup failure leaves the unconsumed purchase for restore.
          });
        }),
        iap.purchaseErrorListener((error) => {
          const attempt = activeAttempt;
          if (!attempt) return;
          if (error.code === "user-cancelled") {
            void clearAttempt(attempt).catch(() => {});
            emit({ type: "cancel", attempt });
          } else {
            emit({ type: "error", attempt, message: error.message || "Could not start Play payment." });
          }
        }),
      ];
      try {
        const ready = await iap.initConnection({});
        if (!ready) throw new Error("Could not connect to Google Play Billing.");
      } catch (error) {
        subscriptions.forEach((subscription) => subscription.remove());
        throw error;
      }
      return iap;
    })().catch((error) => {
      connection = null;
      throw error;
    });
  }
  return connection;
}

export async function startPlayPurchase(attempt: PlayAttempt): Promise<void> {
  const iap = await ensurePlayBilling();
  await saveAttempt(attempt);
  try {
    await iap.requestPurchase({
      request: {
        google: {
          skus: [attempt.playSku],
          obfuscatedAccountId: obfuscatedPlayId(attempt.userId),
          obfuscatedProfileId: obfuscatedPlayId(attempt.internalOrderId),
        },
      },
      type: "in-app",
    });
  } catch (error) {
    // A user-choice or purchase listener may already have handled the result.
    if (activeAttempt?.internalOrderId === attempt.internalOrderId) {
      await clearAttempt(attempt);
      const code = typeof error === "object" && error !== null && "code" in error
        ? String(error.code) : "";
      if (code === "user-cancelled") {
        emit({ type: "cancel", attempt });
        return;
      }
      const message = error instanceof Error ? error.message : "Could not start Play payment.";
      emit({ type: "error", attempt, message });
    }
  }
}

export async function fetchMatchingPlayProduct(sku: string, priceInr: number): Promise<void> {
  const iap = await ensurePlayBilling();
  const products = await iap.fetchProducts({ skus: [sku], type: "in-app" });
  const item = products?.find((product) => product.id === sku && product.platform === "android");
  if (!item || item.currency !== "INR" || typeof item.price !== "number" ||
      Math.abs(item.price - priceInr) > 0.005) {
    throw new Error("The Play price does not match this product. Please contact support.");
  }
}

export async function restorePlayPurchases(): Promise<void> {
  if (Platform.OS !== "android") return;
  const { data } = await supabase.auth.getSession();
  if (!data.session?.user) return;
  const iap = await ensurePlayBilling();
  const purchases = await iap.getAvailablePurchases();
  for (const purchase of purchases) await handlePurchase(purchase);
}

export async function recheckPlayOrder(internalOrderId: string): Promise<PlayVerifyResult> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return { success: false, pending: true };
  const orders = await getOrdersByUser(userId);
  const order = orders.find((candidate) => candidate.id === internalOrderId && candidate.provider === "play");
  if (!order) return { success: false, pending: true };
  if (order.status === "paid") {
    return { success: true, internalOrderId, amount: order.amount, productTitle: order.productTitle };
  }
  if (order.status === "failed" || order.status === "cancelled") {
    return { success: false, pending: false, message: "Payment was not completed." };
  }
  const iap = await ensurePlayBilling();
  const purchases = await iap.getAvailablePurchases();
  const purchase = purchases.find((candidate): candidate is PurchaseAndroid => isAndroidPurchase(candidate) &&
    candidate.obfuscatedAccountIdAndroid === obfuscatedPlayId(userId) &&
    candidate.obfuscatedProfileIdAndroid === obfuscatedPlayId(internalOrderId));
  if (!purchase?.purchaseToken) return { success: false, pending: true };
  const attempt = await lookupAttemptForPurchase(purchase);
  if (!attempt) return { success: false, pending: true };
  return verifyPlayPurchase(attempt, purchase.purchaseToken);
}
