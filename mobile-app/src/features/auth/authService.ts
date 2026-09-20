import { supabase } from "../../config/supabase";
import type { AuthIdentifier } from "./identity";

// BUG FIX ("reset link opens the app but lands on whatever screen was
// already open, never Reset Password"): this used to be the raw custom
// scheme "ayurpulse://reset-password". Supabase's verify endpoint 302s
// to this URL as the LAST hop of an automatic redirect chain. When the
// email link is tapped from inside Gmail's own embedded in-app browser
// (not a real standalone browser), that final https -> custom-scheme
// hop is a *programmatic* redirect, which Gmail's webview silently
// swallows for security reasons - nothing opens, and the app (if
// already running) just resumes on its current screen with no token
// ever delivered.
//
// Fix: point Supabase at a real https landing page instead (hosted
// alongside the marketing site at medveda.in/reset-password). https -> https
// redirects always survive embedded webviews, and that page hands the
// token to the app via a genuine user tap on an ayurpulse:// link,
// which webviews honour far more reliably than an automatic redirect.
//
// This URL must be added under Supabase Dashboard -> Authentication ->
// URL Configuration -> Redirect URLs, or Supabase silently refuses to
// redirect there and falls back to the Site URL instead.
export const PASSWORD_RESET_REDIRECT_URL =
  "https://medveda.in/reset-password";

export const EMAIL_VERIFY_REDIRECT_URL = "https://medveda.in/account-verified";

export async function signInWithIdentifier(identifier: AuthIdentifier, password: string) {
  if (identifier.kind === "email") {
    return supabase.auth.signInWithPassword({ email: identifier.value, password });
  }
  const { data, error } = await supabase.functions.invoke("login-with-mobile", {
    body: { mobileNumber: identifier.value, password },
  });
  if (error || !data?.session) return { data: { user: null, session: null }, error: error ?? new Error("Invalid credentials") };
  return supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
}

export async function registerWithEmailAndMobile(params: {
  fullName: string;
  email: string;
  mobileNumber: string;
  password: string;
}) {
  return supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: {
      // Send the confirmation link straight to the "account verified" page
      // instead of the Supabase Site URL. Must be covered by the Redirect
      // URLs allow-list (https://medveda.in/**).
      emailRedirectTo: EMAIL_VERIFY_REDIRECT_URL,
      // The database trigger persists these fields atomically with the Auth
      // user. Its unique mobile_number index rejects duplicate registrations.
      data: { full_name: params.fullName, mobile_number: params.mobileNumber },
    },
  });
}

export async function requestPasswordReset(identifier: AuthIdentifier) {
  if (identifier.kind === "email") {
    return supabase.auth.resetPasswordForEmail(identifier.value, {
      redirectTo: PASSWORD_RESET_REDIRECT_URL,
    });
  }
  return supabase.functions.invoke("request-password-reset-by-mobile", {
    body: { mobileNumber: identifier.value },
  });
}

// Supabase appends the recovery session as a URL fragment on the
// redirect link, e.g.
//   ayurpulse://reset-password#access_token=...&refresh_token=...&type=recovery
// (or, if the link is expired/already used, #error=...&error_description=...).
// React Navigation's linking config only forwards the path/query into
// route params, not the fragment, so ResetPasswordScreen reads the raw
// URL itself (via React Native's Linking module) and this function pulls
// the tokens out of it.
export function parseRecoveryTokensFromUrl(
  url: string
): { accessToken: string; refreshToken: string } | null {
  const hashIndex = url.indexOf("#");
  if (hashIndex === -1) return null;
  const params = new URLSearchParams(url.slice(hashIndex + 1));
  const errorDescription = params.get("error_description");
  if (errorDescription) {
    throw new Error(errorDescription.replace(/\+/g, " "));
  }
  if (params.get("type") !== "recovery") return null;
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

// Establishes the short-lived recovery session from the email link, then
// immediately sets the new password. Throws with a user-presentable
// message if the link is missing/malformed/expired.
export async function completePasswordReset(url: string, newPassword: string) {
  const tokens = parseRecoveryTokensFromUrl(url);
  if (!tokens) {
    throw new Error("This reset link is invalid or has expired. Please request a new one.");
  }
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });
  if (sessionError) throw sessionError;

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) throw updateError;
}

// shouldCreateUser: false - OTP login is only for people who already have
// an account (created via RegisterScreen). Without this flag Supabase
// would silently sign up a brand-new, unverified account for any email
// typed into the OTP box, which would bypass the existing registration
// flow (full name / mobile number collection, mobile uniqueness trigger,
// etc.) entirely. Keeping this false preserves that flow as the single
// place accounts get created.
export async function sendEmailOtp(email: string) {
  return supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
}

export async function verifyEmailOtp(email: string, token: string) {
  return supabase.auth.verifyOtp({ email, token, type: "email" });
}