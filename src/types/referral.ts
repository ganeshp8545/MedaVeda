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
