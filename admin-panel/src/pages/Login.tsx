import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import { supabase } from "../config/supabase";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Sign-in has up to three steps: password -> (TOTP code | TOTP enrolment).
  // Nothing here grants access: every admin policy/RPC checks am_i_admin() on the server, which
  // requires an AAL2 session once admin MFA is switched on (docs/security/ADMIN_MFA.md).
  const [step, setStep] = useState<"password" | "challenge" | "enroll">("password");
  const [factorId, setFactorId] = useState("");
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [canSkipEnroll, setCanSkipEnroll] = useState(false);

  function done() {
    navigate(location.state?.from || "/", { replace: true });
  }

  async function reject(message: string) {
    await supabase.auth.signOut();
    setStep("password");
    setError(message);
  }

  // Decide what a signed-in session still needs before the panel opens.
  async function continueAfterPassword() {
    const { data: isAccount, error: acctError } = await supabase.rpc("is_admin_account");
    if (acctError) throw acctError;
    if (!isAccount) return reject("This account doesn't have admin access.");

    const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError) throw aalError;

    if (aal.currentLevel === "aal2") return done();

    if (aal.nextLevel === "aal2") {
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) throw listError;
      const totp = factors.totp[0];
      if (!totp) throw new Error("No verified authenticator found.");
      setFactorId(totp.id);
      setCode("");
      setStep("challenge");
      return;
    }

    // No verified factor yet. While the server does not require MFA the admin may skip once.
    const { data: allowed } = await supabase.rpc("am_i_admin");
    setCanSkipEnroll(!!allowed);
    await startEnroll();
  }

  async function startEnroll() {
    // drop half-finished enrolments so a retry does not collide on the friendly name
    const { data: factors } = await supabase.auth.mfa.listFactors();
    for (const f of factors?.all ?? []) {
      if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "MedVeda Admin",
    });
    if (enrollError) throw enrollError;
    setFactorId(data.id);
    setQr(data.totp.qr_code);
    setSecret(data.totp.secret);
    setCode("");
    setStep("enroll");
  }

  async function handleCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: code.trim(),
      });
      if (verifyError) throw verifyError;
      done();
    } catch {
      setError("That code didn't work. Check the code in your authenticator app and try again.");
    } finally {
      setLoading(false);
    }
  }

  // A page refresh (or being bounced here at AAL1) resumes the MFA step instead of asking for the password again.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled || !data.session) return;
      continueAfterPassword().catch(() => setError("Could not continue sign-in. Please sign in again."));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;
      setPassword("");
      await continueAfterPassword();
    } catch (err: any) {
      const message =
        err.message?.includes("Invalid login credentials")
          ? "Incorrect email or password."
          : err.message?.includes("rate limit")
          ? "Too many attempts. Please try again later."
          : "Could not sign in. Please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  if (step !== "password") {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <form onSubmit={handleCode} className="bg-white rounded-xl shadow p-8 w-full max-w-sm">
          <h1 className="text-2xl font-bold mb-1">🌿 MedVeda Admin</h1>
          <p className="text-gray-500 mb-6">
            {step === "challenge"
              ? "Enter the 6-digit code from your authenticator app."
              : "Set up two-step verification: scan the QR code with an authenticator app, then enter the code it shows."}
          </p>
          {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>}
          {step === "enroll" && (
            <div className="mb-4 text-center">
              <img src={qr} alt="Authenticator QR code" className="mx-auto w-44 h-44" />
              <p className="text-xs text-gray-500 mt-2 break-all">
                Can't scan? Enter this key manually: <span className="font-mono">{secret}</span>
              </p>
            </div>
          )}
          <input
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            autoComplete="one-time-code"
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4 tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-green-600"
          />
          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full bg-green-700 hover:bg-green-800 disabled:opacity-60 text-white font-semibold rounded-lg py-2.5 transition"
          >
            {loading ? "Verifying..." : step === "enroll" ? "Verify and finish setup" : "Verify"}
          </button>
          {step === "enroll" && canSkipEnroll && (
            <button type="button" onClick={done} className="w-full mt-3 text-sm text-gray-500 underline">
              Skip for now (only until MFA is switched on)
            </button>
          )}
          <button type="button" onClick={() => reject("")} className="w-full mt-3 text-sm text-gray-500 underline">
            Sign out
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl shadow p-8 w-full max-w-sm"
      >
        <h1 className="text-2xl font-bold mb-1">🌿 MedVeda Admin</h1>
        <p className="text-gray-500 mb-6">Sign in to manage content</p>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">
            {error}
          </div>
        )}

        <label className="block text-sm font-medium text-gray-700 mb-1">
          Email
        </label>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-green-600"
        />

        <label className="block text-sm font-medium text-gray-700 mb-1">
          Password
        </label>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-6 focus:outline-none focus:ring-2 focus:ring-green-600"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-green-700 hover:bg-green-800 disabled:opacity-60 text-white font-semibold rounded-lg py-2.5 transition"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </div>
  );
}
