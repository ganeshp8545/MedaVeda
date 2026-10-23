import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { diagnosePlayPricing, type PlayPricingDiagnosticResult } from "../services/playPricingDiagnostic";
import Button from "./Button";

export default function PlayPricingDiagnostic() {
  const { user, isAdmin, loading } = useAuth();
  if (loading || !user || !isAdmin) return null;
  return <DiagnosticControl key={user.id} />;
}

function DiagnosticControl() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PlayPricingDiagnosticResult | null>(null);
  const pending = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function handleTest() {
    if (pending.current || !mounted.current) return;
    pending.current = true;
    setBusy(true);
    setResult(null);
    try {
      const next = await diagnosePlayPricing(() => mounted.current);
      if (mounted.current) setResult(next);
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <section className="mt-6 bg-white rounded-xl shadow p-6" aria-labelledby="play-pricing-title">
      <h2 id="play-pricing-title" className="text-lg font-semibold">Google Play pricing API (temporary)</h2>
      <p className="mt-1 mb-4 text-sm text-gray-500">
        Send one pricing conversion diagnostic request. Requires administrator MFA.
      </p>
      <Button type="button" onClick={handleTest} disabled={busy}>
        {busy ? "Testing..." : "Test Google Play Pricing API"}
      </Button>
      <div role="status" aria-live="polite" className="mt-3 text-sm">
        {result && <>
          <p>Function HTTP status: {result.functionHttpStatus ?? "Unavailable"}</p>
          {result.googleHttpStatus !== undefined && <p>Google HTTP status: {result.googleHttpStatus}</p>}
          {result.googleErrorCode !== undefined && <p>Google error code: {result.googleErrorCode}</p>}
          {result.googleReason && <p>Google reason: {result.googleReason}</p>}
          {result.googleMessage && <p>Redacted Google message: {result.googleMessage}</p>}
          {result.details.length > 0 && <div>
            <p>Bounded error details:</p>
            <ul className="list-disc pl-5">
              {result.details.map((detail, index) => <li key={index}>
                {[detail.type, detail.reason, detail.domain, detail.message,
                  detail.service, detail.consumer].filter(Boolean).join(" · ")}
              </li>)}
            </ul>
          </div>}
          {result.error && <p className="text-red-500">{result.error}</p>}
        </>}
      </div>
    </section>
  );
}
