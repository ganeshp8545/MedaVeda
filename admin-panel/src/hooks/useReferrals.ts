import { useEffect, useState } from "react";

import {
  getReferralSettings,
  getReferrals,
  saveReferralSettings,
  rejectReferral,
} from "../services/referralService";

import type {
  Referral,
  ReferralSettings,
  ReferralSettingsInput,
  ReferralStatus,
} from "../types/referral";

export default function useReferrals(status?: ReferralStatus) {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [settings, setSettings] = useState<ReferralSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [status]);

  async function load() {
    try {
      setLoading(true);
      const [list, s] = await Promise.all([getReferrals(status), getReferralSettings()]);
      setReferrals(list);
      setSettings(s);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Could not load referrals. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings(data: ReferralSettingsInput) {
    await saveReferralSettings(data);
    await load();
  }

  async function reject(id: string, reason?: string) {
    await rejectReferral(id, reason);
    await load();
  }

  return { referrals, settings, loading, error, reload: load, saveSettings, reject };
}
