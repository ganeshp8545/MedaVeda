import { useEffect, useState } from "react";

import {
  getReferralSettings,
  getReferralSettingsAudit,
  getReferrals,
  saveReferralSettings,
  rejectReferral,
} from "../services/referralService";

import type {
  Referral,
  ReferralSettings,
  ReferralSettingsAuditEntry,
  ReferralSettingsInput,
  ReferralStatus,
} from "../types/referral";

export default function useReferrals(status?: ReferralStatus) {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [settings, setSettings] = useState<ReferralSettings | null>(null);
  const [audit, setAudit] = useState<ReferralSettingsAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [status]);

  async function load() {
    try {
      setLoading(true);
      const [list, s, log] = await Promise.all([
        getReferrals(status),
        getReferralSettings(),
        // The change log is secondary: if it cannot be read (e.g. the audit migration is not
        // applied yet) the page and the settings form must still work.
        getReferralSettingsAudit(10).catch((err) => {
          console.error("Could not load the settings change log:", err);
          return [] as ReferralSettingsAuditEntry[];
        }),
      ]);
      setReferrals(list);
      setSettings(s);
      setAudit(log);
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

  return { referrals, settings, audit, loading, error, reload: load, saveSettings, reject };
}
