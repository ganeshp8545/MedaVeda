// Keep Google's useful denial text while removing identifiers and credential-like data.
// No raw Google response is logged or persisted by the diagnostic.
function safeText(
  value: unknown,
  secrets: readonly string[],
): string | undefined {
  if (typeof value !== "string") return undefined;
  let redacted = value;
  for (const secret of secrets) {
    if (secret.length >= 8) {
      redacted = redacted.replaceAll(secret, "[redacted]");
    }
  }
  return redacted
    .replace(
      /\bAuthorization\s*[:=]\s*(?:Bearer|Basic)\s+\S+/gi,
      "[credential redacted]",
    )
    .replace(
      /\b(?:Authorization|access_token|refresh_token|private_key|assertion|api_key)\s*[:=]\s*["']?[^\s,"']+/gi,
      "[credential redacted]",
    )
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(
      /(?:ya29\.|eyJ[A-Za-z0-9_-]{10,}\.|-----BEGIN)[^\s,;]*/g,
      "[redacted]",
    )
    .replace(/https?:\/\/\S+/gi, "[url redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email redacted]")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[redacted]")
    .split("").map((char) =>
      char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? " " : char
    )
    .join("").slice(0, 1200);
}

function safeLabel(value: unknown): string | undefined {
  return typeof value === "string" &&
      /^[A-Za-z][A-Za-z0-9_.-]{0,100}$/.test(value)
    ? value
    : undefined;
}

export function sanitizeGoogleResponse(
  status: number,
  raw: unknown,
  secrets: readonly string[] = [],
) {
  const source = raw && typeof raw === "object"
    ? raw as Record<string, unknown>
    : {};
  const error = source.error && typeof source.error === "object"
    ? source.error as Record<string, unknown>
    : {};
  const legacy = Array.isArray(error.errors) ? error.errors[0] : undefined;
  const legacyReason = legacy && typeof legacy === "object"
    ? safeLabel((legacy as Record<string, unknown>).reason)
    : undefined;
  const details = Array.isArray(error.details) ? error.details.slice(0, 8) : [];
  return {
    google_http_status: status,
    error_code: Number.isInteger(error.code) ? error.code : undefined,
    reason: legacyReason ??
      details.map((entry) =>
        entry && typeof entry === "object"
          ? safeLabel((entry as Record<string, unknown>).reason)
          : undefined
      ).find(Boolean) ??
      safeLabel(error.status),
    message: safeText(error.message, secrets),
    details: details.map((entry) => {
      const item = entry && typeof entry === "object"
        ? entry as Record<string, unknown>
        : {};
      const metadata = item.metadata && typeof item.metadata === "object"
        ? item.metadata as Record<string, unknown>
        : {};
      return {
        type: safeLabel(
          typeof item["@type"] === "string"
            ? item["@type"].split("/").at(-1)
            : undefined,
        ),
        reason: safeLabel(item.reason),
        domain: safeLabel(item.domain),
        message: safeText(item.message, secrets),
        service: metadata.service === "androidpublisher.googleapis.com"
          ? metadata.service
          : undefined,
        consumer: typeof metadata.consumer === "string" &&
            /^projects\/[0-9]{6,20}$/.test(metadata.consumer)
          ? metadata.consumer
          : undefined,
      };
    }),
  };
}
