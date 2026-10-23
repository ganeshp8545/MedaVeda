// Synthetic Auth, RPC and HTTP only. This test never invokes production.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const sentinel = "SENSITIVE_TEST_SENTINEL";
let passed = 0;

function load(relative, imports, globals = {}) {
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
    module, exports: module.exports, ...globals,
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
    auth: {
      getSession: async () => {
        events.push("session");
        return { data: { session: options.noSession ? null : { access_token: token, user } },
          error: options.sessionError ? new Error(sentinel) : null };
      },
      getUser: async (received) => {
        events.push("user");
        assert.equal(received, token);
        return { data: { user: options.noUser ? null : options.otherUser ? { id: "other" } : user },
          error: options.userError ? { code: options.userError } : null };
      },
      signOut: async (config) => {
        events.push("signout");
        assert.equal(config.scope, "local");
        return { error: null };
      },
      mfa: { getAuthenticatorAssuranceLevel: async () => {
        events.push("aal");
        await options.aalWait;
        return { data: { currentLevel: options.aal ?? "aal2" },
          error: options.aalError ? new Error(sentinel) : null };
      } },
    },
    rpc: async (name) => {
      assert.equal(name, "am_i_admin");
      events.push("admin");
      await options.adminWait;
      return { data: options.admin ?? true,
        error: options.adminError ? new Error(sentinel) : null };
    },
  };
  const fetch = async (url, request) => {
    events.push("invoke");
    assert.equal(url, "/api/diagnose-play-pricing");
    assert.equal(request.method, "POST");
    assert.equal(request.body, "{}");
    assert.equal(request.headers.Authorization, `Bearer ${token}`);
    assert.equal(request.headers.apikey, "synthetic-anon-key");
    assert.equal(request.cache, "no-store");
    assert.equal(request.credentials, "omit");
    await options.invokeWait;
    if (options.networkError) throw new Error(sentinel);
    return new Response(JSON.stringify(options.body ?? {
      google_http_status: 403,
      error_code: 403,
      reason: "PERMISSION_DENIED",
      message: `Denied Bearer ${sentinel}`,
      details: [{ reason: "PERMISSION_DENIED", message: `access_token=${sentinel}` }],
      access_token: sentinel,
      private_key: sentinel,
    }), { status: options.status ?? 200 });
  };
  const service = load("services/playPricingDiagnostic.ts", {
    "../config/supabase": { supabase: client, supabaseAnonKey: "synthetic-anon-key" },
  }, { fetch });
  return { events, run: service.diagnosePlayPricing };
}

async function check(options, expected) {
  const { events, run } = fixture(options);
  assert.deepEqual(events, []);
  const result = await run(() => true);
  assert.deepEqual(events, expected);
  assert.ok(!JSON.stringify(result).includes(sentinel));
  passed++;
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

(async () => {
  for (const options of [{ noSession: true }, { sessionError: true }]) {
    await check(options, ["session"]);
  }
  for (const options of [{ noUser: true }, { otherUser: true }, { userError: "network_error" }]) {
    await check(options, ["session", "user"]);
  }
  await check({ userError: "session_not_found" }, ["session", "user", "signout"]);
  for (const options of [{ admin: false }, { admin: "true" }, { adminError: true }]) {
    await check(options, ["session", "user", "admin"]);
  }
  for (const options of [{ aal: "aal1" }, { aal: "aal3" }, { aalError: true }]) {
    await check(options, ["session", "user", "admin", "aal"]);
  }
  const invoked = ["session", "user", "admin", "aal", "invoke"];
  await check({}, invoked);
  await check({ status: 403, body: { error: sentinel } }, invoked);
  await check({ networkError: true }, invoked);
  const { run } = fixture({ body: {
    google_http_status: 403, error_code: 403, reason: "PERMISSION_DENIED",
    message: "The caller does not have permission",
    details: Array.from({ length: 20 }, () => ({ reason: "PERMISSION_DENIED", secret: sentinel })),
    secret: sentinel,
  } });
  const result = await run(() => true);
  assert.equal(result.functionHttpStatus, 200);
  assert.equal(result.googleHttpStatus, 403);
  assert.equal(result.googleErrorCode, 403);
  assert.equal(result.googleReason, "PERMISSION_DENIED");
  assert.equal(result.details.length, 8);
  assert.ok(!JSON.stringify(result).includes(sentinel));
  passed++;

  const denied = fixture();
  assert.equal(await denied.run(() => false), null);
  assert.deepEqual(denied.events, []);
  passed++;

  for (const waitAt of ["adminWait", "aalWait", "invokeWait"]) {
    const gate = deferred();
    const test = fixture({ [waitAt]: gate.promise });
    const first = test.run(() => true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(await test.run(() => true), null);
    gate.resolve();
    await first;
    assert.deepEqual(test.events, invoked);
    passed++;
  }
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

  let auth;
  let calls = 0;
  const Button = load("components/Button.tsx", {
    "react/jsx-runtime": require("react/jsx-runtime"),
  });
  const Component = load("components/PlayPricingDiagnostic.tsx", {
    react: React,
    "react/jsx-runtime": require("react/jsx-runtime"),
    "../context/AuthContext": { useAuth: () => auth },
    "../services/playPricingDiagnostic": {
      diagnosePlayPricing: async () => { calls++; return null; },
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
  assert.ok(markup.includes("Test Google Play Pricing API"));
  assert.ok(!markup.includes("Function HTTP status:"));
  assert.equal(calls, 0);
  passed++;

  const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../vercel.json")));
  assert.equal(config.rewrites[0].source, "/api/diagnose-play-pricing");
  assert.equal(config.rewrites[0].destination,
    "https://xbvenkfmesugrbjuufyw.supabase.co/functions/v1/diagnose-play-pricing");
  passed++;
  console.log(`PASS admin pricing diagnostic (${passed} cases; synthetic only)`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
