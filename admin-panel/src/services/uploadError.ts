export async function uploadErrorMessage(
  error: unknown,
  fallback: string,
): Promise<string> {
  const response = (error as { context?: unknown } | null)?.context;
  if (!(response instanceof Response) || response.status < 400 || response.status >= 500) {
    return fallback;
  }
  try {
    const data: unknown = await response.clone().json();
    const message = (data as { error?: unknown } | null)?.error;
    if (
      typeof message === "string" && message.length > 0 &&
      message.length <= 160 && /^[\x20-\x7e]+$/.test(message)
    ) return message;
  } catch {
    // Network and non-JSON errors use the caller's fallback.
  }
  return fallback;
}
