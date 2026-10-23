import { useEffect, useRef, useState } from "react";

import { useAuth } from "../context/AuthContext";
import {
  diagnosePlayServiceAccount,
  type PlayServiceAccountDiagnosticResult,
} from "../services/playServiceAccountDiagnostic";
import Button from "./Button";

export default function PlayServiceAccountDiagnostic() {
  const { user, isAdmin, loading } = useAuth();
  if (loading || !user || !isAdmin) return null;

  // Discard results when the authenticated administrator changes.
  return <DiagnosticControl key={user.id} />;
}

function DiagnosticControl() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PlayServiceAccountDiagnosticResult | null>(null);
  const pending = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function handleVerify() {
    if (pending.current || !mounted.current) return;
    pending.current = true;
    setBusy(true);
    setResult(null);
    try {
      const next = await diagnosePlayServiceAccount(() => mounted.current);
      if (mounted.current) setResult(next);
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <section className="mt-6 bg-white rounded-xl shadow p-6" aria-labelledby="play-identity-title">
      <h2 id="play-identity-title" className="text-lg font-semibold">
        Google Play service account identity (temporary)
      </h2>
      <p className="mt-1 mb-4 text-sm text-gray-500">
        Verify the configured service account identity. Requires administrator MFA.
      </p>
      <Button type="button" onClick={handleVerify} disabled={busy}>
        {busy ? "Verifying..." : "Verify service account identity"}
      </Button>
      <div role="status" aria-live="polite" className="mt-3 text-sm">
        {result && (
          <>
            <p>HTTP status: {result.httpStatus ?? "Unavailable (no diagnostic response)"}</p>
            {result.httpStatus === 200 &&
              typeof result.service_account_matches_expected === "boolean" && (
                <p>service_account_matches_expected: {String(result.service_account_matches_expected)}</p>
              )}
            {result.error && <p className="text-red-500">{result.error}</p>}
          </>
        )}
      </div>
    </section>
  );
}
