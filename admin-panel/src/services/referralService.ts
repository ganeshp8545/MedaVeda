import { supabase } from "../config/supabase";
import { toCamelCase, toSnakeCase } from "../utils/caseConvert";
import type {
  Referral,
  ReferralSettings,
  ReferralSettingsInput,
  ReferralStatus,
} from "../types/referral";

// referral_settings is a single-row table (id = true, see the migration).
export async function getReferralSettings(): Promise<ReferralSettings> {
  const { data, error } = await supabase
    .from("referral_settings")
    .select("*")
    .eq("id", true)
    .single();
  if (error) throw error;
  return toCamelCase<ReferralSettings>(data);
}

export async function saveReferralSettings(data: ReferralSettingsInput) {
  const { error } = await supabase
    .from("referral_settings")
    .update(toSnakeCase(data))
    .eq("id", true);
  if (error) throw error;
}

// Admins can read every profile (profiles_select_own_or_admin), so the
// referrer/referred names and emails are joined live here.
export async function getReferrals(status?: ReferralStatus): Promise<Referral[]> {
  let query = supabase
    .from("referrals")
    .select(
      "*, referrer:profiles!referrals_referrer_id_fkey ( name, email ), referred:profiles!referrals_referred_id_fkey ( name, email )"
    )
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    ...toCamelCase<Referral>(row),
    referrerName: row.referrer?.name ?? "",
    referrerEmail: row.referrer?.email ?? "",
    referredName: row.referred?.name ?? "",
    referredEmail: row.referred?.email ?? "",
  }));
}

// Rewards are issued by the payment system only (settlement), never by hand.
// The one manual action left is rejecting a referral: the server cancels the
// referrer's credit if it is still pending (admin_reject_referral).
export async function rejectReferral(id: string, reason?: string) {
  const { error } = await supabase.rpc("admin_reject_referral", {
    p_referral_id: id,
    p_reason: reason ?? "",
  });
  if (error) throw error;
}
