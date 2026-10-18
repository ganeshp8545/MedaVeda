export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes))))
    .map((part) => part.toString(16).padStart(2, "0")).join("");
}

export async function storedPdfMatchesHash(
  file: Blob,
  expectedHash: string,
  expectedSize: number,
): Promise<boolean> {
  if (file.size !== expectedSize) return false;
  return await sha256Hex(new Uint8Array(await file.arrayBuffer())) === expectedHash;
}
