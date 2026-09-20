import { supabase } from "../config/supabase";
import { toCamelCase } from "../utils/caseConvert";
import {
  ApplyReferralCodeResult,
  ReferralHistoryItem,
  ReferralSettings,
} from "../types/referral";

export async function getReferralSettings(): Promise<ReferralSettings | null> {
  const { data, error } = await supabase
    .from("referral_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();
  if (error) throw error;
  return data ? toCamelCase<ReferralSettings>(data) : null;
}

// Goes through get_my_referrals() (security definer) rather than a table
// select: a student can't read other students' profile rows under RLS, so
// a joined name would always come back empty. The RPC returns the referred
// user's first name only - never email/phone.
export async function getMyReferrals(): Promise<ReferralHistoryItem[]> {
  const { data, error } = await supabase.rpc("get_my_referrals");
  if (error) throw error;
  return (data ?? []).map((row: any) => toCamelCase<ReferralHistoryItem>(row));
}

export async function applyReferralCode(code: string): Promise<ApplyReferralCodeResult> {
  const { data, error } = await supabase.rpc("apply_referral_code", { p_code: code });
  if (error) throw error;
  return data as ApplyReferralCodeResult;
}
