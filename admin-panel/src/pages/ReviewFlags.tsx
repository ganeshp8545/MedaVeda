import { useCallback, useEffect, useState } from "react";

import Button from "../components/Button";
import Modal from "../components/Modal";
import {
  getReviewFlags,
  resolveReviewFlag,
  type ReviewFlag,
} from "../services/reviewFlagService";

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ReviewFlags() {
  const [flags, setFlags] = useState<ReviewFlag[]>([]);
  const [showResolved, setShowResolved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [target, setTarget] = useState<ReviewFlag | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      setFlags(await getReviewFlags(showResolved));
    } catch (err: any) {
      console.error(err);
      setError("Could not load review flags.");
    } finally {
      setLoading(false);
    }
  }, [showResolved]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleResolve() {
    if (!target) return;
    try {
      setSaving(true);
      await resolveReviewFlag(target.id, note.trim());
      setTarget(null);
      setNote("");
      await load();
    } catch (err: any) {
      console.error(err);
      setError("Could not resolve this flag.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Review Flags</h1>
        <p className="text-gray-500 mt-1">
          Orders the system held back for a human check (for example a referral where both accounts
          share a network, or a payment that arrived after its order expired). Look at the order and
          the referral, act on them from Orders / Referrals if needed, then mark the flag resolved.
        </p>
      </div>

      <label className="mb-4 flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={showResolved}
          onChange={(e) => setShowResolved(e.target.checked)}
        />
        Show resolved flags
      </label>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-xl bg-white shadow">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="p-4">Raised</th>
              <th className="p-4">Reason</th>
              <th className="p-4">Order</th>
              <th className="p-4">Wallet</th>
              <th className="p-4">Discount</th>
              <th className="p-4">Status</th>
              <th className="p-4"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="p-4 text-gray-500" colSpan={7}>Loading...</td>
              </tr>
            )}
            {!loading && flags.length === 0 && (
              <tr>
                <td className="p-4 text-gray-500" colSpan={7}>
                  {showResolved ? "No flags." : "Nothing needs review."}
                </td>
              </tr>
            )}
            {flags.map((flag) => (
              <tr key={flag.id} className="border-t align-top">
                <td className="p-4 whitespace-nowrap">{formatDate(flag.createdAt)}</td>
                <td className="p-4">
                  <div className="font-medium">{flag.reason}</div>
                  {flag.details && Object.keys(flag.details).length > 0 && (
                    <pre className="mt-1 max-w-xs whitespace-pre-wrap break-words text-xs text-gray-500">
                      {JSON.stringify(flag.details, null, 1)}
                    </pre>
                  )}
                </td>
                <td className="p-4 font-mono text-xs">{flag.orderId ?? "-"}</td>
                <td className="p-4">{flag.walletAmount != null ? `₹${flag.walletAmount}` : "-"}</td>
                <td className="p-4">
                  {flag.referralDiscount != null ? `₹${flag.referralDiscount}` : "-"}
                </td>
                <td className="p-4">
                  {flag.resolvedAt ? (
                    <span className="text-green-700">
                      Resolved {formatDate(flag.resolvedAt)}
                      {flag.resolutionNote ? ` - ${flag.resolutionNote}` : ""}
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-700">
                      Needs review
                    </span>
                  )}
                </td>
                <td className="p-4">
                  {!flag.resolvedAt && (
                    <Button variant="secondary" onClick={() => setTarget(flag)}>
                      Resolve
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={target !== null} title="Resolve flag" onClose={() => setTarget(null)}>
        <p className="mb-3 text-sm text-gray-600">
          Add a short note of what you checked or did. It is saved with your admin account.
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={4}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-green-600 focus:ring-1 focus:ring-green-600"
          placeholder="e.g. Same college hostel Wi-Fi, genuine friends - approved"
        />
        <div className="mt-4 flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setTarget(null)}>Cancel</Button>
          <Button loading={saving} onClick={handleResolve}>Mark resolved</Button>
        </div>
      </Modal>
    </div>
  );
}
