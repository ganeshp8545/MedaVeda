// Supabase tables: "referral_settings" (single row) and "referrals",
// added by 20260919120000_multi_course_and_referrals.sql.
export type ReferralRewardType = "none" | "discount_percent" | "discount_flat" | "credit";
export type ReferralQualifyOn = "signup" | "first_purchase";

export interface ReferralSettings {
  enabled: boolean;
  rewardType?: ReferralRewardType;
  referrerRewardValue?: number;
  refereeRewardValue?: number;
  qualifyOn?: ReferralQualifyOn;
  maxReferralsPerUser?: number;

  // Phase 2 reward config. Legacy fields above (rewardType, referrerRewardValue,
  // refereeRewardValue, qualifyOn) are kept for old app builds and are no
  // longer read by any reward logic. They are optional here and never written
  // back by the admin (see ReferralSettingsInput / saveReferralSettings).
  friendDiscountPercent: number;
  friendDiscountMax?: number | null; // blank = no cap
  referrerCreditAmount: number;
  creditHoldDays: number;
  creditExpiryDays?: number | null; // blank = never expires
  walletMaxPercent: number;
  walletProductTypes: string[];
  applyWindowDays: number;
  termsUrl?: string | null;
}

// What the admin form may save: everything except the legacy Phase 1 columns.
export type ReferralSettingsInput = Omit<
  ReferralSettings,
  "rewardType" | "referrerRewardValue" | "refereeRewardValue" | "qualifyOn"
>;

export type ReferralStatus = "pending" | "qualified" | "rewarded" | "rejected";

export interface Referral {
  id: string;

  referrerId: string;
  referrerName?: string;
  referrerEmail?: string;

  referredId: string;
  referredName?: string;
  referredEmail?: string;

  codeUsed: string;
  status: ReferralStatus;
  rejectReason?: string;

  createdAt?: any;
  qualifiedAt?: any;
  rewardedAt?: any;
}
