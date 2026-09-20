// Supabase tables: "referral_settings" (single row) and "referrals",
// added by 20260919120000_multi_course_and_referrals.sql.
export type ReferralRewardType = "none" | "discount_percent" | "discount_flat" | "credit";
export type ReferralQualifyOn = "signup" | "first_purchase";

export interface ReferralSettings {
  enabled: boolean;
  rewardType: ReferralRewardType;
  referrerRewardValue?: number;
  refereeRewardValue?: number;
  qualifyOn: ReferralQualifyOn;
  maxReferralsPerUser?: number;

  // Phase 2 reward config (referral_settings, edited in the admin panel).
  // Nothing in the app hardcodes these numbers - always read from here.
  friendDiscountPercent: number;
  friendDiscountMax: number | null; // null = no cap
  referrerCreditAmount: number;
  creditHoldDays: number;
  creditExpiryDays: number | null; // null = never expires
  walletMaxPercent: number;
  walletProductTypes: string[];
  applyWindowDays: number;
  termsUrl: string | null;
}

export type ReferralStatus = "pending" | "qualified" | "rewarded" | "rejected";

// One row per referral the current user is party to, from either side
// (see referrals_read_own RLS policy) - referredName is a joined display
// field (the referred user's first name only), not a real column.
export interface ReferralHistoryItem {
  id: string;
  referrerId: string;
  referredId: string;
  referredName?: string;
  codeUsed: string;
  status: ReferralStatus;
  createdAt?: number;
  qualifiedAt?: number;
  rewardedAt?: number;
}

// Return shape of the apply_referral_code(p_code) RPC.
export interface ApplyReferralCodeResult {
  status:
    | "success"
    | "disabled"
    | "invalid_code"
    | "self_referral"
    | "referrer_blocked"
    | "already_referred"
    | "too_late"
    | "already_purchased"
    | "referrer_limit_reached"
    | "error";
  message: string;
}

// get_my_wallet() - computed from the append-only ledger, never stored.
export interface WalletSummary {
  available: number;
  pending: number;
  totalEarned: number;
  nextAvailableAt: string | null;
}

// get_my_referral_list(): friendName is already masked by the server ("Rahul S.").
export type ReferralListStatus = "joined" | "purchased_pending" | "credited" | "cancelled";

export interface ReferralListItem {
  id: string;
  friendName: string;
  joinedAt: string;
  status: ReferralListStatus;
  amount: number | null;
  availableAt: string | null;
}

// quote_my_order(): what create-order WILL charge. Display only - the amount
// that is actually charged is decided again on the server at payment time.
export interface OrderQuote {
  ok: boolean;
  code?: string;
  listPrice: number;
  referralDiscount: number;
  walletEligible: boolean;
  walletAvailable: number;
  walletMaxUsable: number;
  walletAmount: number;
  amount: number;
}
