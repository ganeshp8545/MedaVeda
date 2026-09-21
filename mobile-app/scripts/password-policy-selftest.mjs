// Password policy self-test: client pattern == website pattern, and the server-side
// rule (supabase/config.toml [auth], enforced by Supabase Auth) is declared.
// Run: node --experimental-strip-types scripts/password-policy-selftest.mjs
import { readFileSync } from "node:fs";
import { PASSWORD_POLICY_PATTERN } from "../src/validation/passwordPolicy.ts";

// Expected verdict of BOTH layers. The server column follows Supabase Auth's
// "lower_upper_letters_digits_symbols" + minimum_password_length = 8 semantics.
const cases = [
  ["abc", false], ["abcdefgh", false], ["abcdefgh1", false],
  ["Abcdefgh1", false], ["Abcdefgh!", false], ["Abcdefg1!", true],
  ["Abcdefg1! ", true],                       // space is not required, extra chars fine
  ["Abcd1!", false],                          // < 8
  ["Abcdefgh1!Abcdefgh1!Abcdefgh1!Abcdefgh1!", false], // > 32 (client-only rule)
  ["ABCDEFG1!", false], ["abcdefg1!", false], // missing case
  ["Abcdefgé1", false],                       // é is not a symbol Supabase accepts
];
const web = readFileSync(new URL("../../website/assets/js/reset-password.js", import.meta.url), "utf8");
const webSrc = web.match(/var POLICY = \/(.*)\/;/)[1];
const webRe = new RegExp(webSrc);
let fail = 0;
for (const [pw, ok] of cases) {
  for (const [name, re] of [["mobile", PASSWORD_POLICY_PATTERN], ["website", webRe]]) {
    const got = re.test(pw);
    if (got !== ok) { fail++; console.log("FAIL", name, JSON.stringify(pw), "expected", ok); }
  }
}
const toml = readFileSync(new URL("../../supabase/config.toml", import.meta.url), "utf8");
const cfg = {
  "server min length 8": /^minimum_password_length\s*=\s*8\s*$/m.test(toml),
  "server requires lower+upper+digit+symbol": /^password_requirements\s*=\s*"lower_upper_letters_digits_symbols"\s*$/m.test(toml),
  "mobile and website patterns identical": PASSWORD_POLICY_PATTERN.source === webRe.source,
};
for (const [k, v] of Object.entries(cfg)) { if (!v) fail++; console.log(v ? "PASS" : "FAIL", k); }
console.log(`${cases.length * 2} pattern checks, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
