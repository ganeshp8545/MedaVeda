import {
  applyReferralCode as applyReferralCodeRepo,
  getMyReferrals,
  getReferralSettings,
} from "../repositories/referralsRepository";

export type {
  ReferralSettings,
  ReferralHistoryItem,
  ApplyReferralCodeResult,
} from "../types/referral";

export {
  getReferralSettings as fetchReferralSettings,
  getMyReferrals as fetchMyReferrals,
};

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
