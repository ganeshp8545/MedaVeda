import { supabase } from "../config/supabase";

export type PlayServiceAccountDiagnosticResult = {
  httpStatus: number | null;
  service_account_matches_expected?: boolean;
  error?: string;
};

// Shared across mounts so navigation cannot start a second concurrent request.
let inFlight = false;

function failure(httpStatus: number | null, error: string): PlayServiceAccountDiagnosticResult {
  return { httpStatus, error };
}

// Called only by the diagnostic button. Never return upstream messages, bodies,
// headers or error objects; they may contain sensitive production details.
export async function diagnosePlayServiceAccount(
  isStillAuthorized: () => boolean,
): Promise<PlayServiceAccountDiagnosticResult | null> {
  if (inFlight || !isStillAuthorized()) return null;
  inFlight = true;
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (sessionError || !token) {
      return failure(null, "Your session could not be verified. Sign in again and complete MFA.");
    }

    // PostgREST can accept a signed JWT after its underlying Auth session has
    // been revoked. Verify the exact token sent to the function with Auth first.
    const { data: identity, error: identityError } = await supabase.auth.getUser(token);
    if (identityError || !identity.user ||
        identity.user.id !== sessionData.session?.user.id) {
      if (identityError?.code === "session_not_found") {
        await supabase.auth.signOut({ scope: "local" });
      }
      return failure(null, "Your session could not be verified. Sign in again and complete MFA.");
    }
    if (!isStillAuthorized()) return null;

    const { data: admin, error: adminError } = await supabase.rpc("am_i_admin");
    if (adminError || admin !== true) {
      return failure(null, "Administrator access could not be verified. Sign in again.");
    }

    const { data: assurance, error: assuranceError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError || assurance?.currentLevel !== "aal2") {
      return failure(null, "MFA verification is required. Sign in again and complete MFA.");
    }
    if (!isStillAuthorized()) return null;

    const { data, error, response } = await supabase.functions.invoke(
      "diagnose-play-service-account",
      { method: "GET", headers: { Authorization: `Bearer ${token}` } },
    );
    const status = response?.status;
    const httpStatus = typeof status === "number" && Number.isInteger(status) &&
      status >= 100 && status <= 599 ? status : null;

    if (error || httpStatus !== 200) {
      const message = httpStatus === 401
        ? "Your session could not be verified. Sign in again."
        : httpStatus === 403
          ? "Access denied. Administrator access and MFA are required."
          : "Identity verification could not be completed. Try again.";
      return failure(httpStatus, message);
    }
    if (
      typeof data !== "object" || data === null || Array.isArray(data) ||
      typeof data.service_account_matches_expected !== "boolean"
    ) {
      return failure(httpStatus, "The diagnostic returned an invalid response.");
    }
    return {
      httpStatus,
      service_account_matches_expected: data.service_account_matches_expected,
    };
  } catch {
    return failure(null, "Identity verification could not be completed. Try again.");
  } finally {
    inFlight = false;
  }
}
