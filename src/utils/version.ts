// Numeric, semver-style comparison of "MAJOR[.MINOR[.PATCH]]" strings.
// Never compare versions as plain strings ("1.10.0" < "1.9.0" that way).

const VERSION_RE = /^\d+(\.\d+){0,2}$/;

export function parseVersion(input: unknown): [number, number, number] | null {
  if (typeof input !== "string") return null;
  const v = input.trim();
  if (!VERSION_RE.test(v)) return null;
  const [major, minor = "0", patch = "0"] = v.split(".");
  return [Number(major), Number(minor), Number(patch)];
}

// -1 if a < b, 0 if equal, 1 if a > b; null if either side is unparseable.
export function compareVersions(a: unknown, b: unknown): -1 | 0 | 1 | null {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}
