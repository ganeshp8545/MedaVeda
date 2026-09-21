import { getCurrentUser } from "./authState";
import { clearPendingReferral, getPendingReferral } from "../utils/pendingReferral";
import {
  applyReferralCode as applyReferralCodeRepo,
  getMyReferrals,
  getMyReferralList,
  getMyWallet,
  getReferralSettings,
  quoteOrder,
} from "../repositories/referralsRepository";

import type { ApplyReferralCodeResult } from "../types/referral";
import { logDebug } from "../utils/logger";

export type {
  ReferralSettings,
  ReferralHistoryItem,
  ApplyReferralCodeResult,
  ReferralListItem,
  ReferralListStatus,
  WalletSummary,
  OrderQuote,
} from "../types/referral";

export {
  getReferralSettings as fetchReferralSettings,
  getMyReferrals as fetchMyReferrals,
  getMyReferralList as fetchMyReferralList,
  getMyWallet as fetchMyWallet,
  quoteOrder as fetchOrderQuote,
};

// "₹49" / "₹49.50" - whole rupees without decimals.
export function formatRupees(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  return `₹${Number.isInteger(n) ? n : n.toFixed(2)}`;
}

// "notes" / "notes and videos" - which purchases referral balance may pay for,
// straight from referral_settings.wallet_product_types (never hardcoded).
const WALLET_PRODUCT_LABEL: Record<string, string> = {
  notes: "notes",
  notes_bundle: "notes",
  video: "videos",
  other: "other items",
};

export function walletProductsText(types: string[] | null | undefined): string {
  const labels = Array.from(new Set((types ?? []).map((t) => WALLET_PRODUCT_LABEL[t] ?? t)));
  if (labels.length === 0) return "no products";
  return labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

// Referral codes are uppercase A-Z/2-9 (see generate_unique_referral_code
// in the migration). Used to validate the optional Register field before
// a code is ever sent to the server.
export const REFERRAL_CODE_PATTERN = /^[A-Z2-9]{6,10}$/;

export function normalizeReferralCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidReferralCodeFormat(raw: string): boolean {
  return REFERRAL_CODE_PATTERN.test(normalizeReferralCode(raw));
}

export async function applyReferralCode(raw: string) {
  return applyReferralCodeRepo(normalizeReferralCode(raw));
}

// Applies a code saved at sign-up once a session exists. Only the account
// that registered with it can claim it. A network/server failure leaves it
// in place to retry next launch; any definitive answer (applied, or rejected
// for a reason retrying can't fix) clears it. Never throws - registration and
// login must not depend on this.
export async function applyPendingReferralCode(): Promise<ApplyReferralCodeResult | null> {
  try {
    const pending = await getPendingReferral();
    const email = getCurrentUser()?.email?.toLowerCase();
    if (!pending || !email || pending.email !== email) return null;

    const result = await applyReferralCodeRepo(pending.code);
    await clearPendingReferral();
    return result;
  } catch (error) {
    logDebug("applyPendingReferralCode failed, will retry later:", error);
    return null;
  }
}
