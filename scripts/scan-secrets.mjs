import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function scanSecrets(source) {
  // Recognize real PEM bodies, including JSON-escaped line breaks. A parser's
  // BEGIN/END marker literals and runtime-generated test keys are harmless.
  const text = source.replace(/\\r/g, '').replace(/\\n/g, '\n');
  const patterns = [
    ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----\s*[A-Za-z0-9+/=\s]{64,}-----END (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g],
    ['Razorpay live key', /rzp_live_[A-Za-z0-9]{10,}/g],
    ['Stripe live key', /sk_live_[A-Za-z0-9]{10,}/g],
  ];
  const findings = [];
  for (const [kind, pattern] of patterns) {
    for (const match of text.matchAll(pattern)) findings.push({ kind, line: text.slice(0, match.index).split('\n').length });
  }
  for (const match of text.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
    try {
      if (JSON.parse(Buffer.from(match[0].split('.')[1], 'base64url').toString()).role === 'service_role')
        findings.push({ kind: 'Supabase service role token', line: text.slice(0, match.index).split('\n').length });
    } catch { /* Not a JWT. */ }
  }
  return findings;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // git's inventory excludes dependencies/build outputs; no blanket source/test exclusions.
  let inventory;
  try { inventory = process.argv.includes('--stdin') ? readFileSync(0, 'utf8')
    : execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }); }
  catch { console.error('Cannot read git inventory; scan did not run.'); process.exit(2); }
  const files = inventory.split('\0').filter(Boolean);
  let count = 0;
  for (const file of files) {
    let text;
    try { text = readFileSync(file, 'utf8'); } catch { continue; } // locally removed tracked files
    for (const finding of scanSecrets(text)) {
      console.error(`${file}:${finding.line}: ${finding.kind} (value redacted)`);
      count++;
    }
  }
  console.log(count ? `FAIL: ${count} potential secrets` : 'PASS: tracked-file secret scan');
  process.exitCode = count ? 1 : 0;
}
