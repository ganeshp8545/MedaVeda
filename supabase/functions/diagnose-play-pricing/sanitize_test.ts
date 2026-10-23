import { sanitizeGoogleResponse } from "./sanitize.ts";

Deno.test("keeps actionable Google denial fields and redacts identifiers", () => {
  const result = sanitizeGoogleResponse(403, {
    error: {
      code: 403,
      status: "PERMISSION_DENIED",
      message:
        "Caller account user@example.com cannot access https://example.com/path with Bearer ya29.secret",
      details: [{
        "@type": "type.googleapis.com/google.rpc.ErrorInfo",
        reason: "SERVICE_DISABLED",
        domain: "googleapis.com",
        metadata: {
          service: "androidpublisher.googleapis.com",
          consumer: "projects/123456789012",
          token: "must-not-appear",
        },
      }],
    },
  });
  if (
    result.google_http_status !== 403 || result.error_code !== 403 ||
    result.reason !== "SERVICE_DISABLED" ||
    result.details[0].service !== "androidpublisher.googleapis.com" ||
    result.details[0].consumer !== "projects/123456789012"
  ) throw new Error("lost useful fields");
  const serialized = JSON.stringify(result);
  for (
    const secret of [
      "user@example.com",
      "https://example.com/path",
      "ya29.secret",
      "must-not-appear",
    ]
  ) {
    if (serialized.includes(secret)) throw new Error(`leaked ${secret}`);
  }
});

Deno.test("uses Google status when no detailed reason is present", () => {
  const result = sanitizeGoogleResponse(403, {
    error: {
      code: 403,
      status: "PERMISSION_DENIED",
      message: "The caller does not have permission",
    },
  });
  if (
    result.reason !== "PERMISSION_DENIED" ||
    result.message !== "The caller does not have permission"
  ) throw new Error("lost basic denial");
});

Deno.test("redacts credential fields in a Google message", () => {
  const result = sanitizeGoogleResponse(403, {
    error: {
      message:
        "Authorization: Basic abc123 access_token=shortsecret private_key: secretvalue",
    },
  });
  const serialized = JSON.stringify(result);
  for (const secret of ["abc123", "shortsecret", "secretvalue"]) {
    if (serialized.includes(secret)) throw new Error(`leaked ${secret}`);
  }
});

Deno.test("redacts exact opaque credentials even without recognizable prefixes", () => {
  const result = sanitizeGoogleResponse(403, {
    error: {
      message: "Unexpected token opaque-secret-123456789 was rejected",
      details: [{ message: "opaque-secret-123456789" }],
    },
  }, ["opaque-secret-123456789"]);
  if (JSON.stringify(result).includes("opaque-secret-123456789")) {
    throw new Error("exact credential leaked");
  }
});
