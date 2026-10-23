import { supabase, supabaseAnonKey } from "../config/supabase";

export type PricingDetail = {
  type?: string;
  reason?: string;
  domain?: string;
  message?: string;
  service?: string;
  consumer?: string;
};

export type PlayPricingDiagnosticResult = {
  functionHttpStatus: number | null;
  googleHttpStatus?: number;
  googleErrorCode?: number;
  googleReason?: string;
  googleMessage?: string;
  details: PricingDetail[];
  error?: string;
};

// Navigation cannot start a second concurrent request.
let inFlight = false;

const unavailable = "The pricing diagnostic could not be completed.";
const sessionFailure = "Your session could not be verified. Sign in again and complete MFA.";

function status(value: unknown): number | undefined {
  return Number.isInteger(value) && (value as number) >= 100 &&
    (value as number) <= 599 ? value as number : undefined;
}

function code(value: unknown): number | undefined {
  return Number.isInteger(value) && (value as number) >= 0 &&
    (value as number) <= 999 ? value as number : undefined;
}

function label(value: unknown): string | undefined {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9_.-]{0,100}$/.test(value)
    ? value : undefined;
}

function redactedText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value
    .replace(/\bAuthorization\s*[:=]\s*(?:Bearer|Basic)\s+\S+/gi, "[credential redacted]")
    .replace(/\b(?:access_token|refresh_token|private_key|mfa_secret|assertion|api_key)\s*[:=]\s*["']?[^\s,"']+/gi, "[credential redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/(?:ya29\.|eyJ[A-Za-z0-9_-]{10,}\.|-----BEGIN)[^\s,;]*/g, "[redacted]")
    .replace(/https?:\/\/\S+/gi, "[url redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email redacted]")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[redacted]")
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .slice(0, 1200);
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function sanitizeResponse(functionHttpStatus: number, raw: unknown): PlayPricingDiagnosticResult {
  const body = object(raw);
  const details = Array.isArray(body.details) ? body.details.slice(0, 8) : [];
  return {
    functionHttpStatus,
    googleHttpStatus: status(body.google_http_status),
    googleErrorCode: code(body.error_code),
    googleReason: label(body.reason),
    googleMessage: redactedText(body.message),
    details: details.map((entry): PricingDetail => {
      const item = object(entry);
      return {
        type: label(item.type),
        reason: label(item.reason),
        domain: label(item.domain),
        message: redactedText(item.message),
        service: item.service === "androidpublisher.googleapis.com" ? item.service : undefined,
        consumer: typeof item.consumer === "string" &&
          /^projects\/[0-9]{6,20}$/.test(item.consumer) ? item.consumer : undefined,
      };
    }),
    ...(functionHttpStatus !== 200 ? {
      error: functionHttpStatus === 401 ? sessionFailure :
        functionHttpStatus === 403 ? "Administrator access and MFA are required." : unavailable,
    } : {}),
  };
}

// Only the explicit button handler calls this function. No retry or persistence.
export async function diagnosePlayPricing(
  isStillAuthorized: () => boolean,
): Promise<PlayPricingDiagnosticResult | null> {
  if (inFlight || !isStillAuthorized()) return null;
  inFlight = true;
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (sessionError || !token) {
      return { functionHttpStatus: null, details: [], error: sessionFailure };
    }
    const { data: identity, error: identityError } = await supabase.auth.getUser(token);
    if (identityError || !identity.user || identity.user.id !== sessionData.session?.user.id) {
      if (identityError?.code === "session_not_found") {
        await supabase.auth.signOut({ scope: "local" });
      }
      return { functionHttpStatus: null, details: [], error: sessionFailure };
    }
    if (!isStillAuthorized()) return null;

    const { data: admin, error: adminError } = await supabase.rpc("am_i_admin");
    if (adminError || admin !== true) {
      return { functionHttpStatus: null, details: [], error: "Administrator access could not be verified." };
    }
    const { data: assurance, error: assuranceError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError || assurance?.currentLevel !== "aal2") {
      return { functionHttpStatus: null, details: [], error: "MFA verification is required." };
    }
    if (!isStillAuthorized()) return null;

    // The same-origin rewrite avoids CORS; the Edge Function checks this JWT,
    // admin membership and AAL2 again before contacting Google.
    const response = await fetch("/api/diagnose-play-pricing", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
        "Content-Type": "application/json",
      },
      body: "{}",
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
    });
    const functionHttpStatus = status(response.status) ?? null;
    if (functionHttpStatus === null) {
      return { functionHttpStatus: null, details: [], error: unavailable };
    }
    const body = await response.json().catch(() => null);
    return sanitizeResponse(functionHttpStatus, body);
  } catch {
    return { functionHttpStatus: null, details: [], error: unavailable };
  } finally {
    inFlight = false;
  }
}
