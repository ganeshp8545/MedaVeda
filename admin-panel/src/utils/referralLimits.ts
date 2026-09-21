import type { ReferralSettingsInput } from "../types/referral";

// Mirrors the CHECK constraints on referral_settings
// (20260928100000_referral_settings_limits_and_audit.sql). The database is the
// real gate; this only gives the admin an error next to the field before Save.
export type LimitedField =
  | "friendDiscountPercent"
  | "friendDiscountMax"
  | "referrerCreditAmount"
  | "creditHoldDays"
  | "walletMaxPercent"
  | "applyWindowDays"
  | "maxReferralsPerUser";

export type FieldErrors = Partial<Record<LimitedField, string>>;

// Confirm-before-save thresholds and the sample order used to explain them.
export const CONFIRM_WALLET_PERCENT_ABOVE = 50;
export const CONFIRM_FRIEND_DISCOUNT_ABOVE = 20;
export const SAMPLE_ORDER_PRICE = 499;

type Rule = { min: number; max: number; integer: boolean; optional: boolean; message: string };

const RULES: Record<LimitedField, Rule> = {
  friendDiscountPercent: { min: 0, max: 50, integer: false, optional: false, message: "Enter a percentage between 0 and 50." },
  friendDiscountMax: { min: 1, max: 10000, integer: false, optional: true, message: "Enter an amount between ₹1 and ₹10,000, or leave blank for no cap." },
  referrerCreditAmount: { min: 0, max: 10000, integer: false, optional: false, message: "Enter an amount between ₹0 and ₹10,000." },
  creditHoldDays: { min: 0, max: 90, integer: true, optional: false, message: "Enter a whole number of days between 0 and 90." },
  walletMaxPercent: { min: 1, max: 100, integer: false, optional: false, message: "Enter a percentage between 1 and 100." },
  applyWindowDays: { min: 1, max: 30, integer: true, optional: false, message: "Enter a whole number of days between 1 and 30." },
  maxReferralsPerUser: { min: 1, max: 1000, integer: true, optional: true, message: "Enter a whole number between 1 and 1000, or leave blank for no limit." },
};

export function validateReferralSettings(form: ReferralSettingsInput): FieldErrors {
  const errors: FieldErrors = {};
  for (const field of Object.keys(RULES) as LimitedField[]) {
    const rule = RULES[field];
    const value = form[field] as number | null | undefined;
    if (value === null || value === undefined) {
      if (!rule.optional) errors[field] = "This field is required. " + rule.message;
      continue;
    }
    if (!Number.isFinite(value) || value < rule.min || value > rule.max || (rule.integer && !Number.isInteger(value))) {
      errors[field] = rule.message;
    }
  }
  return errors;
}

const inr = (n: number) => `₹${Number.isInteger(n) ? n : n.toFixed(2)}`;

// Same arithmetic as quote_my_order: discount is capped by the max and leaves
// at least ₹1; the wallet share is a percentage of what is left.
export function sampleOrderImpact(form: ReferralSettingsInput, price = SAMPLE_ORDER_PRICE) {
  let discount = Math.round(price * form.friendDiscountPercent) / 100;
  if (form.friendDiscountMax != null) discount = Math.min(discount, form.friendDiscountMax);
  discount = Math.max(0, Math.min(discount, price - 1));
  const afterDiscount = price - discount;
  const walletMax = Math.floor(afterDiscount * form.walletMaxPercent) / 100;
  return { price, discount, afterDiscount, walletMax, cashMin: afterDiscount - walletMax };
}

// Human-readable reasons this save needs a confirmation (empty = none).
export function confirmationReasons(form: ReferralSettingsInput): string[] {
  const s = sampleOrderImpact(form);
  const reasons: string[] = [];
  if (form.friendDiscountPercent > CONFIRM_FRIEND_DISCOUNT_ABOVE) {
    reasons.push(
      `Friend discount ${form.friendDiscountPercent}% is above ${CONFIRM_FRIEND_DISCOUNT_ABOVE}%: on a ${inr(s.price)} order a friend's first purchase is reduced by ${inr(s.discount)}, so they pay ${inr(s.afterDiscount)}.`
    );
  }
  if (form.walletMaxPercent > CONFIRM_WALLET_PERCENT_ABOVE) {
    reasons.push(
      `Wallet ${form.walletMaxPercent}% is above ${CONFIRM_WALLET_PERCENT_ABOVE}%: on a ${inr(s.price)} order up to ${inr(s.walletMax)} can be paid from referral balance, leaving as little as ${inr(s.cashMin)} to pay in cash${
        form.friendDiscountPercent > 0 ? " (after the friend discount, if it applies)" : ""
      }.`
    );
  }
  return reasons;
}
