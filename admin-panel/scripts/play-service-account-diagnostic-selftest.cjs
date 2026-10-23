// Local-only tests: real diagnostic code and FunctionsClient, synthetic Auth/RPC
// and HTTP responses. No production session, credentials or network are used.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { FunctionsClient } = require("@supabase/functions-js");

const sentinel = "SENSITIVE_TEST_SENTINEL";
let passed = 0;

function load(relative, imports) {
  const module = { exports: {} };
  const code = ts.transpileModule(
    fs.readFileSync(path.resolve(__dirname, "../src", relative), "utf8"),
    { compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    } },
  ).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports,
    console: new Proxy({}, { get: () => () => assert.fail("Diagnostic must not log") }),
    require: (name) => {
      assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
      return imports[name];
    },
  });
  return module.exports;
}

function fixture(options = {}) {
  const events = [];
  const token = "synthetic.user.jwt";
  const user = { id: "admin-user" };
  const client = {
    rpc: async (name) => {
      assert.equal(name, "am_i_admin");
      events.push("admin");
      await options.adminWait;
      if (options.adminThrows) throw new Error(sentinel);
      return {
        data: Object.hasOwn(options, "admin") ? options.admin : true,
        error: options.adminError ? new Error(sentinel) : null,
      };
    },
    auth: {
      getSession: async () => {
        events.push("session");
        return {
          data: { session: options.noSession ? null : { access_token: token, user } },
          error: options.sessionError ? new Error(sentinel) : null,
        };
      },
      getUser: async (received) => {
        events.push("user");
        assert.equal(received, token);
        return {
          data: { user: options.noUser ? null : options.otherUser ? { id: "other" } : user },
          error: options.userError ? { code: options.userError } : null,
        };
      },
      signOut: async (config) => {
        events.push("signout");
        assert.deepEqual(config, { scope: "local" });
        return { error: null };
      },
      mfa: { getAuthenticatorAssuranceLevel: async () => {
      events.push("aal");
      await options.aalWait;
      if (options.aalThrows) throw new Error(sentinel);
      return {
        data: options.noAssurance ? null : {
          currentLevel: Object.hasOwn(options, "aal") ? options.aal : "aal2",
          nextLevel: "aal2",
        },
        error: options.aalError ? new Error(sentinel) : null,
      };
    } } },
    functions: new FunctionsClient("https://example.invalid/functions/v1", {
      customFetch: async (url, request) => {
        events.push("invoke");
        assert.equal(url, "https://example.invalid/functions/v1/diagnose-play-service-account");
        assert.equal(request.method, "GET");
        assert.equal(request.body, undefined);
        assert.equal(new Headers(request.headers).get("Authorization"), `Bearer ${token}`);
        await options.invokeWait;
        if (options.networkError) throw new Error(sentinel);
        const status = options.status ?? 200;
        const body = Object.hasOwn(options, "body") ? options.body : {
          service_account_matches_expected: true,
          private_key: sentinel,
          access_token: sentinel,
          refresh_token: sentinel,
          mfa_secret: sentinel,
        };
        return new Response(status === 204 ? null : options.invalidJson ? sentinel : JSON.stringify(body), {
          status,
          headers: {
            "content-type": status === 204 ? "text/plain" : "application/json",
            ...(options.relayError ? { "x-relay-error": "true" } : {}),
          },
        });
      },
    }),
  };
  const service = load("services/playServiceAccountDiagnostic.ts", {
    "../config/supabase": { supabase: client },
  });
  return { events, run: service.diagnosePlayServiceAccount };
}

function checkSafe(result) {
  assert.ok(!JSON.stringify(result).includes(sentinel), "Sensitive data escaped");
  assert.ok(Object.keys(result).every((key) => [
    "httpStatus", "service_account_matches_expected", "error",
  ].includes(key)));
}

async function check(name, options, expectedStatus, expectedMatch, expectedEvents) {
  const test = fixture(options);
  assert.deepEqual(test.events, [], "Import must not perform any checks");
  const result = await test.run(() => true);
  checkSafe(result);
  assert.equal(result.httpStatus, expectedStatus, name);
  assert.equal(result.service_account_matches_expected, expectedMatch, name);
  assert.equal(typeof result.error, expectedMatch === undefined ? "string" : "undefined", name);
  assert.deepEqual(test.events, expectedEvents, name);
  passed++;
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

(async () => {
  for (const options of [{ noSession: true }, { sessionError: true }]) {
    await check("session missing", options, null, undefined, ["session"]);
  }
  for (const options of [
    { noUser: true }, { otherUser: true }, { userError: "network_error" },
  ]) {
    await check("user not verified", options, null, undefined, ["session", "user"]);
  }
  await check("revoked session cleared locally", { userError: "session_not_found" },
    null, undefined, ["session", "user", "signout"]);
  for (const options of [
    { admin: false }, { admin: null }, { admin: "true" },
    { adminError: true }, { adminThrows: true },
  ]) {
    await check("admin denied", options, null, undefined, ["session", "user", "admin"]);
  }
  for (const options of [
    { aal: "aal1" }, { aal: null }, { aal: "aal3" },
    { noAssurance: true }, { aalError: true }, { aalThrows: true },
  ]) {
    await check("AAL2 unavailable", options, null, undefined, ["session", "user", "admin", "aal"]);
  }
  const invoked = ["session", "user", "admin", "aal", "invoke"];
  await check("match with extra sensitive fields discarded", {}, 200, true, invoked);
  await check("identity mismatch", {
    body: { service_account_matches_expected: false },
  }, 200, false, invoked);
  for (const status of [201, 204, 400, 401, 403, 405, 429, 500, 502, 503]) {
    await check(`HTTP ${status}`, {
      status, body: { service_account_matches_expected: false, error: sentinel },
    }, status, undefined, invoked);
  }
  for (const body of [null, [], sentinel, {}, {
    service_account_matches_expected: "true",
  }, { service_account_matches_expected: 1 }]) {
    await check("malformed success", { body }, 200, undefined, invoked);
  }
  await check("fetch failure", { networkError: true }, null, undefined, invoked);
  await check("JSON parse failure", { invalidJson: true }, null, undefined, invoked);
  await check("relay failure", { relayError: true, status: 502 }, 502, undefined, invoked);

  const denied = fixture();
  assert.equal(await denied.run(() => false), null);
  assert.deepEqual(denied.events, []);
  passed++;

  // Duplicate calls are blocked immediately, including while preflight checks
  // are pending. Only a new explicit call after completion can retry.
  for (const waitAt of ["adminWait", "aalWait", "invokeWait"]) {
    const gate = deferred();
    const test = fixture({ [waitAt]: gate.promise });
    const first = test.run(() => true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(await test.run(() => true), null);
    gate.resolve();
    checkSafe(await first);
    assert.deepEqual(test.events, invoked);
    await test.run(() => true);
    assert.deepEqual(test.events, [...invoked, ...invoked]);
    passed++;
  }

  // Navigating away/signing out during preflight cancels the invocation.
  for (const waitAt of ["adminWait", "aalWait"]) {
    const gate = deferred();
    const test = fixture({ [waitAt]: gate.promise });
    let authorized = true;
    const pending = test.run(() => authorized);
    authorized = false;
    gate.resolve();
    assert.equal(await pending, null);
    assert.ok(!test.events.includes("invoke"));
    passed++;
  }
  const failed = fixture({ networkError: true });
  await failed.run(() => true);
  await failed.run(() => true);
  assert.deepEqual(failed.events, [...invoked, ...invoked], "Failure must release the lock");
  passed++;

  // Render the real component with React to verify visibility and no invocation
  // on render. Effects only track mounting; they never trigger the diagnostic.
  let auth;
  let calls = 0;
  const Button = load("components/Button.tsx", {
    "react/jsx-runtime": require("react/jsx-runtime"),
  });
  const Component = load("components/PlayServiceAccountDiagnostic.tsx", {
    react: React,
    "react/jsx-runtime": require("react/jsx-runtime"),
    "../context/AuthContext": { useAuth: () => auth },
    "../services/playServiceAccountDiagnostic": {
      diagnosePlayServiceAccount: async () => { calls++; return null; },
    },
    "./Button": Button,
  }).default;
  for (const state of [
    { user: null, isAdmin: false, loading: false },
    { user: null, isAdmin: true, loading: false },
    { user: { id: "student" }, isAdmin: false, loading: false },
    { user: { id: "admin" }, isAdmin: true, loading: true },
  ]) {
    auth = state;
    assert.equal(renderToStaticMarkup(React.createElement(Component)), "");
    passed++;
  }
  auth = { user: { id: "admin" }, isAdmin: true, loading: false };
  const markup = renderToStaticMarkup(React.createElement(Component));
  assert.ok(markup.includes('type="button"'));
  assert.ok(markup.includes("Verify service account identity"));
  assert.ok(!markup.includes("HTTP status:"));
  assert.equal(calls, 0, "Rendering must never invoke the diagnostic");
  passed++;

  console.log(`PASS admin service-account diagnostic (${passed} cases; admin/AAL2, concurrency, safe output, visibility)`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
