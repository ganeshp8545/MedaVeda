import { useEffect, useMemo, useState } from "react";

import useReferrals from "../hooks/useReferrals";

import SearchBar from "../components/SearchBar";
import Button from "../components/Button";
import Input from "../components/Input";
import Modal from "../components/Modal";

import type {
  Referral,
  ReferralQualifyOn,
  ReferralRewardType,
  ReferralSettingsInput,
  ReferralStatus,
} from "../types/referral";

const STATUS_STYLES: Record<ReferralStatus, string> = {
  pending: "bg-amber-100 text-amber-700",
  qualified: "bg-blue-100 text-blue-700",
  rewarded: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

const REWARD_TYPES: { value: ReferralRewardType; label: string }[] = [
  { value: "none", label: "None (track only)" },
  { value: "discount_percent", label: "Discount %" },
  { value: "discount_flat", label: "Flat discount (₹)" },
  { value: "credit", label: "Credit" },
];

const selectClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600";

function formatDate(value: any) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const defaultSettings: ReferralSettingsInput = {
  enabled: false,
  rewardType: "none",
  qualifyOn: "signup",
};

export default function Referrals() {
  const [statusFilter, setStatusFilter] = useState<ReferralStatus | "">("");
  const { referrals, settings, loading, error, saveSettings, changeStatus } = useReferrals(
    statusFilter || undefined
  );

  const [form, setForm] = useState<ReferralSettingsInput>(defaultSettings);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<{ ok: boolean; text: string } | null>(
    null
  );

  const [search, setSearch] = useState("");

  const [rejecting, setRejecting] = useState<Referral | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return referrals.filter(
      (r) =>
        !term ||
        r.referrerName?.toLowerCase().includes(term) ||
        r.referrerEmail?.toLowerCase().includes(term) ||
        r.referredName?.toLowerCase().includes(term) ||
        r.referredEmail?.toLowerCase().includes(term) ||
        r.codeUsed.toLowerCase().includes(term)
    );
  }, [referrals, search]);

  function validateSettings(): string | null {
    const nums: [string, number | undefined][] = [
      ["Referrer reward", form.referrerRewardValue],
      ["Referee reward", form.refereeRewardValue],
    ];
    for (const [label, value] of nums) {
      if (value !== undefined && value < 0) return `${label} cannot be negative.`;
    }
    if (form.rewardType === "discount_percent") {
      for (const [label, value] of nums) {
        if (value !== undefined && value > 100) return `${label} cannot exceed 100%.`;
      }
    }
    if (form.maxReferralsPerUser !== undefined && form.maxReferralsPerUser < 1) {
      return "Max referrals per user must be at least 1 (or leave it blank for no limit).";
    }
    return null;
  }

  async function handleSaveSettings() {
    const problem = validateSettings();
    if (problem) {
      setSettingsMessage({ ok: false, text: problem });
      return;
    }
    try {
      setSavingSettings(true);
      await saveSettings(form);
      setSettingsMessage({ ok: true, text: "Referral settings saved." });
    } catch (err: any) {
      setSettingsMessage({ ok: false, text: err?.message ?? "Could not save settings." });
    } finally {
      setSavingSettings(false);
    }
  }

  async function updateStatus(referral: Referral, status: ReferralStatus, reason?: string) {
    setActionError(null);
    try {
      setBusyId(referral.id);
      await changeStatus(referral.id, status, reason);
    } catch (err: any) {
      setActionError(err?.message ?? "Could not update this referral.");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmReject() {
    if (!rejecting) return;
    await updateStatus(rejecting, "rejected", rejectReason.trim() || undefined);
    setRejecting(null);
    setRejectReason("");
  }

  const numberValue = (v: number | undefined) => (v === undefined || v === null ? "" : v);
  const toNumber = (raw: string) => (raw === "" ? undefined : Number(raw));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Referrals</h1>
        <p className="mt-1 text-gray-500">
          Configure the referral program and review who referred whom.
        </p>
      </div>

      <div className="mb-8 rounded-xl bg-white p-6 shadow">
        <h2 className="mb-1 text-lg font-semibold text-gray-800">Settings</h2>
        <p className="mb-4 text-xs text-gray-500">
          Rewards are recorded as a status only - no payout, credit or discount is applied
          automatically. Mark referrals as rewarded once you have handled the reward yourself.
        </p>

        <label className="mb-4 flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          Referral program enabled (shows Refer &amp; Earn in the app)
        </label>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="mb-4">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Reward type</label>
            <select
              value={form.rewardType}
              onChange={(e) =>
                setForm({ ...form, rewardType: e.target.value as ReferralRewardType })
              }
              className={selectClass}
            >
              {REWARD_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Referral qualifies on
            </label>
            <select
              value={form.qualifyOn}
              onChange={(e) =>
                setForm({ ...form, qualifyOn: e.target.value as ReferralQualifyOn })
              }
              className={selectClass}
            >
              <option value="signup">Sign-up (code applied)</option>
              <option value="first_purchase">First purchase</option>
            </select>
          </div>

          <Input
            label="Referrer reward value"
            type="number"
            min={0}
            disabled={form.rewardType === "none"}
            value={numberValue(form.referrerRewardValue)}
            onChange={(e) => setForm({ ...form, referrerRewardValue: toNumber(e.target.value) })}
          />

          <Input
            label="Referee reward value"
            type="number"
            min={0}
            disabled={form.rewardType === "none"}
            value={numberValue(form.refereeRewardValue)}
            onChange={(e) => setForm({ ...form, refereeRewardValue: toNumber(e.target.value) })}
          />

          <Input
            label="Max referrals per user (blank = unlimited)"
            type="number"
            min={1}
            value={numberValue(form.maxReferralsPerUser)}
            onChange={(e) => setForm({ ...form, maxReferralsPerUser: toNumber(e.target.value) })}
          />
        </div>

        {settingsMessage && (
          <p className={`mb-3 text-sm ${settingsMessage.ok ? "text-green-700" : "text-red-500"}`}>
            {settingsMessage.text}
          </p>
        )}

        <Button onClick={handleSaveSettings} loading={savingSettings} disabled={loading}>
          Save settings
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search name, email or code..."
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ReferralStatus | "")}
          className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="qualified">Qualified</option>
          <option value="rewarded">Rewarded</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {loading && <p className="text-gray-400">Loading...</p>}
      {error && <p className="text-red-500">{error}</p>}
      {actionError && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</p>
      )}

      {!loading && !error && (
        <div className="overflow-hidden rounded-xl bg-white shadow">
          {filtered.length === 0 ? (
            <div className="p-10 text-center text-gray-400">No referrals found.</div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-green-700 text-white">
                <tr>
                  <th className="p-4">Referrer</th>
                  <th className="p-4">Referred</th>
                  <th className="p-4">Code</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Created</th>
                  <th className="p-4">Qualified</th>
                  <th className="p-4">Rewarded</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-gray-50">
                    <td className="p-4">
                      <div className="font-medium text-gray-800">{r.referrerName || "-"}</div>
                      <div className="text-xs text-gray-500">{r.referrerEmail}</div>
                    </td>
                    <td className="p-4">
                      <div className="font-medium text-gray-800">{r.referredName || "-"}</div>
                      <div className="text-xs text-gray-500">{r.referredEmail}</div>
                    </td>
                    <td className="p-4 font-mono text-xs text-gray-600">{r.codeUsed}</td>
                    <td className="p-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLES[r.status]}`}
                      >
                        {r.status}
                      </span>
                      {r.status === "rejected" && r.rejectReason && (
                        <div className="mt-1 text-xs text-gray-500">{r.rejectReason}</div>
                      )}
                    </td>
                    <td className="p-4 text-gray-500">{formatDate(r.createdAt)}</td>
                    <td className="p-4 text-gray-500">{formatDate(r.qualifiedAt)}</td>
                    <td className="p-4 text-gray-500">{formatDate(r.rewardedAt)}</td>
                    <td className="p-4 text-right whitespace-nowrap">
                      {r.status === "pending" && (
                        <button
                          disabled={busyId === r.id}
                          onClick={() => updateStatus(r, "qualified")}
                          className="mr-3 text-sm font-medium text-blue-700 hover:underline disabled:opacity-50"
                        >
                          Mark qualified
                        </button>
                      )}
                      {(r.status === "pending" || r.status === "qualified") && (
                        <button
                          disabled={busyId === r.id}
                          onClick={() => updateStatus(r, "rewarded")}
                          className="mr-3 text-sm font-medium text-green-700 hover:underline disabled:opacity-50"
                        >
                          Mark rewarded
                        </button>
                      )}
                      {r.status !== "rejected" && r.status !== "rewarded" && (
                        <button
                          disabled={busyId === r.id}
                          onClick={() => setRejecting(r)}
                          className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
                        >
                          Reject
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <Modal
        open={!!rejecting}
        title="Reject referral"
        onClose={() => {
          setRejecting(null);
          setRejectReason("");
        }}
      >
        <Input
          label="Reason (optional)"
          placeholder="e.g. Suspected duplicate account"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
        />
        <div className="mt-2 flex justify-end gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              setRejecting(null);
              setRejectReason("");
            }}
          >
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmReject} loading={busyId === rejecting?.id}>
            Reject
          </Button>
        </div>
      </Modal>
    </div>
  );
}
