import { useEffect, useMemo, useState } from "react";

import useReferrals from "../hooks/useReferrals";

import SearchBar from "../components/SearchBar";
import Button from "../components/Button";
import Input from "../components/Input";
import Modal from "../components/Modal";

import {
  confirmationReasons,
  validateReferralSettings,
  SAMPLE_ORDER_PRICE,
  type FieldErrors,
} from "../utils/referralLimits";

import type {
  Referral,
  ReferralSettingsInput,
  ReferralStatus,
} from "../types/referral";

const STATUS_STYLES: Record<ReferralStatus, string> = {
  pending: "bg-amber-100 text-amber-700",
  qualified: "bg-blue-100 text-blue-700",
  rewarded: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};


function formatDate(value: any) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Column -> label for the change log (database names, as stored in the audit rows).
const AUDIT_LABELS: Record<string, string> = {
  enabled: "Program enabled",
  friend_discount_percent: "Friend discount %",
  friend_discount_max: "Friend discount cap (₹)",
  referrer_credit_amount: "Referrer credit (₹)",
  credit_hold_days: "Hold days",
  credit_expiry_days: "Credit expiry (days)",
  wallet_max_percent: "Wallet max %",
  wallet_product_types: "Wallet product types",
  apply_window_days: "Code window (days)",
  max_referrals_per_user: "Max referrals per user",
  checkout_expiry_minutes: "Checkout expiry (min)",
  terms_url: "Terms URL",
};

function formatAuditValue(v: unknown) {
  if (v === null || v === undefined || v === "") return "blank";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "on" : "off";
  return String(v);
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Referrals() {
  const [statusFilter, setStatusFilter] = useState<ReferralStatus | "">("");
  const { referrals, settings, audit, loading, error, saveSettings, reject } = useReferrals(
    statusFilter || undefined
  );

  // null until the row is loaded from referral_settings: the form never shows
  // (or saves) numbers the admin did not set.
  const [form, setForm] = useState<ReferralSettingsInput | null>(null);
  const [confirmReasons, setConfirmReasons] = useState<string[] | null>(null);
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

  const errors: FieldErrors = useMemo(() => (form ? validateReferralSettings(form) : {}), [form]);
  const hasErrors = Object.keys(errors).length > 0;

  function handleSaveClick() {
    if (!form) return;
    if (hasErrors) return;
    setSettingsMessage(null);
    const reasons = confirmationReasons(form);
    if (reasons.length > 0) setConfirmReasons(reasons);
    else void persistSettings();
  }

  async function persistSettings() {
    if (!form) return;
    setConfirmReasons(null);
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

  async function confirmReject() {
    if (!rejecting) return;
    setActionError(null);
    try {
      setBusyId(rejecting.id);
      await reject(rejecting.id, rejectReason.trim() || undefined);
      setRejecting(null);
      setRejectReason("");
    } catch (err: any) {
      setActionError(err?.message ?? "Could not reject this referral.");
    } finally {
      setBusyId(null);
    }
  }

  const numberValue = (v: number | undefined | null) =>
    v === undefined || v === null || Number.isNaN(v) ? "" : v;
  // Blank required field -> NaN (fails validation, shown as blank); blank optional field -> null.
  const toNumberOrNull = (raw: string) => (raw === "" ? null : Number(raw));
  const toRequired = (raw: string) => (raw === "" ? NaN : Number(raw));
  const fieldError = (name: keyof FieldErrors) => errors[name];

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
          These values are read by the server at checkout and settlement, and shown live in the
          app; nothing is hardcoded. Changes apply to new orders immediately. Rewards are issued automatically after the
          friend's first paid purchase.
        </p>

        {!form ? (
          <p className="text-sm text-gray-400">{loading ? "Loading settings..." : "Settings could not be loaded."}</p>
        ) : (
        <>
        <label className="mb-4 flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          Referral program enabled (shows Refer &amp; Earn in the app, applies discount and credit)
        </label>

        <h3 className="mb-2 text-sm font-semibold text-gray-700">Friend (new user with a code)</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input
            label="Discount on first purchase (%)"
            type="number"
            min={0}
            max={50}
            step="any"
            error={fieldError("friendDiscountPercent")}
            value={numberValue(form.friendDiscountPercent)}
            onChange={(e) => setForm({ ...form, friendDiscountPercent: toRequired(e.target.value) })}
          />
          <Input
            label="Max discount (₹, blank = no cap)"
            type="number"
            min={1}
            max={10000}
            step="any"
            error={fieldError("friendDiscountMax")}
            value={numberValue(form.friendDiscountMax)}
            onChange={(e) => setForm({ ...form, friendDiscountMax: toNumberOrNull(e.target.value) })}
          />
          <Input
            label="Code usable for (days after signup)"
            type="number"
            min={1}
            max={30}
            error={fieldError("applyWindowDays")}
            value={numberValue(form.applyWindowDays)}
            onChange={(e) => setForm({ ...form, applyWindowDays: toRequired(e.target.value) })}
          />
        </div>

        <h3 className="mb-2 mt-2 text-sm font-semibold text-gray-700">Referrer</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input
            label="Credit per friend's first purchase (₹)"
            type="number"
            min={0}
            max={10000}
            step="any"
            error={fieldError("referrerCreditAmount")}
            value={numberValue(form.referrerCreditAmount)}
            onChange={(e) => setForm({ ...form, referrerCreditAmount: toRequired(e.target.value) })}
          />
          <Input
            label="Hold before credit is available (days)"
            type="number"
            min={0}
            max={90}
            error={fieldError("creditHoldDays")}
            value={numberValue(form.creditHoldDays)}
            onChange={(e) => setForm({ ...form, creditHoldDays: toRequired(e.target.value) })}
          />
          <Input
            label="Credit expires after (days, blank = never)"
            type="number"
            min={1}
            value={numberValue(form.creditExpiryDays)}
            onChange={(e) => setForm({ ...form, creditExpiryDays: toNumberOrNull(e.target.value) })}
          />
          <Input
            label="Max referrals per user (blank = unlimited)"
            type="number"
            min={1}
            max={1000}
            error={fieldError("maxReferralsPerUser")}
            value={numberValue(form.maxReferralsPerUser)}
            onChange={(e) => setForm({ ...form, maxReferralsPerUser: toNumberOrNull(e.target.value) })}
          />
        </div>

        <h3 className="mb-2 mt-2 text-sm font-semibold text-gray-700">Wallet</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input
            label="Max share of an order payable with wallet (%)"
            type="number"
            min={1}
            max={100}
            step="any"
            error={fieldError("walletMaxPercent")}
            value={numberValue(form.walletMaxPercent)}
            onChange={(e) => setForm({ ...form, walletMaxPercent: toRequired(e.target.value) })}
          />
          <Input
            label="Referral terms URL (blank = built-in terms screen)"
            value={form.termsUrl ?? ""}
            onChange={(e) => setForm({ ...form, termsUrl: e.target.value.trim() || null })}
          />
        </div>
        <p className="mb-4 text-xs text-gray-500">
          Wallet applies to products whose Product type is Notes or Notes bundle (set on the
          Products page). Videos and untagged products never accept it.
        </p>

        {!hasErrors && (
          <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">
            Students will see: “Invite friends, earn ₹{form.referrerCreditAmount}” · “Your friend gets{" "}
            {form.friendDiscountPercent}% off
            {form.friendDiscountMax != null ? ` (up to ₹${form.friendDiscountMax})` : ""}” · credit available
            after {form.creditHoldDays} days · wallet up to {form.walletMaxPercent}% of the price, notes only.
            On a ₹{SAMPLE_ORDER_PRICE} order the friend discount is applied first, then the wallet share.
          </div>
        )}

        {settingsMessage && (
          <p className={`mb-3 text-sm ${settingsMessage.ok ? "text-green-700" : "text-red-500"}`}>
            {settingsMessage.text}
          </p>
        )}

        <Button onClick={handleSaveClick} loading={savingSettings} disabled={loading || hasErrors}>
          Save settings
        </Button>
        {hasErrors && (
          <p className="mt-2 text-xs text-red-500">Fix the fields marked in red to enable Save.</p>
        )}
        </>
        )}

        <h3 className="mb-2 mt-8 text-sm font-semibold text-gray-700">Recent changes (last 10)</h3>
        {audit.length === 0 ? (
          <p className="text-xs text-gray-400">No changes recorded yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border text-xs text-gray-700">
            {audit.map((a) => (
              <li key={a.id} className="p-3">
                <div className="mb-1 text-gray-500">
                  {formatDateTime(a.changedAt)} · {a.changedByEmail ?? "database (no signed-in admin)"}
                </div>
                {Object.keys(a.newValues).map((k) => (
                  <div key={k}>
                    <span className="font-medium">{AUDIT_LABELS[k] ?? k}:</span>{" "}
                    {formatAuditValue(a.oldValues[k])} → {formatAuditValue(a.newValues[k])}
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={!!confirmReasons}
        title="Confirm these settings"
        onClose={() => setConfirmReasons(null)}
      >
        <p className="mb-3 text-sm text-gray-700">
          These values are higher than usual. Saving applies them to new orders immediately.
        </p>
        <ul className="mb-4 list-disc space-y-2 pl-5 text-sm text-gray-800">
          {confirmReasons?.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setConfirmReasons(null)}>
            Go back
          </Button>
          <Button onClick={persistSettings} loading={savingSettings}>
            Save anyway
          </Button>
        </div>
      </Modal>

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
                      {r.status !== "rejected" && (
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
