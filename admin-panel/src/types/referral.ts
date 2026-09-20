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

export type ReferralSettingsInput = ReferralSettings;

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
