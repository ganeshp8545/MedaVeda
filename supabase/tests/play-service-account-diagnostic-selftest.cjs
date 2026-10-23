// Runs the real endpoint and shared auth helper in an isolated VM. Only the
// Supabase client boundary is mocked; no process environment or network is used.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const ts = require("../../mobile-app/node_modules/typescript");
const root = path.resolve(__dirname, "../..");
const compile = (file) =>
  ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
const sources = {
  auth: compile("supabase/functions/_shared/supabaseAdmin.ts"),
  cors: compile("supabase/functions/_shared/cors.ts"),
  endpoint: compile(
    "supabase/functions/diagnose-play-service-account/index.ts",
  ),
};
const expectedEmail =
  "medveda-play-billing@medveda-play-billing.iam.gserviceaccount.com";
const secretName = "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON";
const userId = "00000000-0000-4000-8000-000000000001";
const sentinel = "SENSITIVE_TEST_SENTINEL";
const credential = (email) =>
  JSON.stringify({
    client_email: email,
    private_key: sentinel,
    private_key_id: sentinel,
    access_token: sentinel,
    unrelated: { value: sentinel },
  });
const jwt = (aal) =>
  `fixture.${
    Buffer.from(JSON.stringify({ sub: userId, aal })).toString("base64url")
  }.signature`;

function fixture(options = {}) {
  const events = [];
  let handler, logCalls = 0, networkCalls = 0, unexpectedCalls = 0;
  const unexpected = () => {
    unexpectedCalls++;
    throw new Error("Unexpected operation");
  };
  const client = {
    auth: {
      // Preserve Supabase's asynchronous success/rejection boundary in the mock.
      // deno-lint-ignore require-await
      getUser: async (token) => {
        events.push("auth");
        if (options.authThrows) throw new Error(sentinel);
        if (
          options.invalidSession || options.expiredSession ||
          token !== jwt(options.aal ?? "aal2")
        ) {
          return { data: { user: null }, error: { message: sentinel } };
        }
        return { data: { user: { id: userId, email: sentinel } }, error: null };
      },
    },
    from: (table) => {
      if (!["admins", "admin_settings"].includes(table)) return unexpected();
      return {
        select: (column) => {
          assert.equal(column, table === "admins" ? "id" : "require_mfa");
          return {
            eq: (column, value) => {
              assert.equal(column, "id");
              assert.equal(value, table === "admins" ? userId : true);
              return {
                // Preserve Supabase's asynchronous database boundary in the mock.
                // deno-lint-ignore require-await
                maybeSingle: async () => {
                  events.push(table);
                  if (options.throwAt === table) throw new Error(sentinel);
                  if (options.errorAt === table) {
                    return { data: null, error: { message: sentinel } };
                  }
                  return {
                    data: table === "admins"
                      ? (options.nonAdmin ? null : { id: userId })
                      : (options.noSettings
                        ? null
                        : { require_mfa: options.requireMfa ?? true }),
                    error: null,
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  // Reject every operation outside the two read chains, even if the handler
  // catches the resulting exception. This includes RPCs, storage and mutations.
  const guard = (value) =>
    new Proxy(value, {
      get(target, key) {
        if (!(key in target)) return unexpected();
        const item = target[key];
        if (typeof item === "function") {
          return (...args) => {
            const result = item(...args);
            return result && typeof result === "object" &&
                !(result instanceof Promise)
              ? guard(result)
              : result;
          };
        }
        return item && typeof item === "object" ? guard(item) : item;
      },
    });
  const runtime = {
    Request,
    Response,
    atob,
    fetch: () => {
      networkCalls++;
      throw new Error("Network disabled");
    },
    console: new Proxy({}, {
      get: () => () => {
        logCalls++;
      },
    }),
    Deno: {
      env: {
        get: (name) => {
          if (name === "SUPABASE_URL") return "https://fixture.invalid";
          if (name === "SUPABASE_SERVICE_ROLE_KEY") {
            return "fixture-service-role";
          }
          if (name !== secretName) return unexpected();
          events.push("secret");
          if (options.envThrows) throw new Error(sentinel);
          return Object.hasOwn(options, "raw")
            ? options.raw
            : credential(expectedEmail);
        },
      },
      serve: (fn) => {
        handler = fn;
      },
    },
  };
  function load(source, modules) {
    const mod = { exports: {} };
    vm.runInNewContext(source, {
      ...runtime,
      module: mod,
      exports: mod.exports,
      require: (name) =>
        Object.hasOwn(modules, name) ? modules[name] : unexpected(),
    });
    return mod.exports;
  }
  const auth = load(sources.auth, {
    "npm:@supabase/supabase-js@2": {
      createClient: (url, key, config) => {
        assert.ok(
          url === "https://fixture.invalid" && key === "fixture-service-role",
        );
        assert.equal(config.auth.persistSession, false);
        assert.equal(config.auth.autoRefreshToken, false);
        return guard(client);
      },
    },
  });
  load(sources.endpoint, {
    "../_shared/supabaseAdmin.ts": auth,
    "../_shared/cors.ts": load(sources.cors, {}),
  });
  return {
    events,
    run: async (
      {
        method = "GET",
        authorization = `Bearer ${jwt(options.aal ?? "aal2")}`,
        query = "",
      } = {},
    ) => {
      const response = await handler(
        new Request(`https://fixture.invalid/diagnostic${query}`, {
          method,
          headers: authorization ? { Authorization: authorization } : {},
        }),
      );
      assert.equal(networkCalls, 0, "Unexpected network call");
      assert.equal(
        unexpectedCalls,
        0,
        "Unexpected import, environment access or database operation",
      );
      assert.equal(logCalls, 0, "Diagnostic must never log");
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      assert.equal(
        response.headers.get("Access-Control-Allow-Methods"),
        "GET, OPTIONS",
      );
      for (const value of response.headers.values()) {
        assert.ok(
          !value.includes(sentinel) && !value.includes(expectedEmail),
          "Sensitive response header",
        );
      }
      return response;
    },
  };
}

let passed = 0;
async function check(name, options, request, status, matches, events) {
  const test = fixture(options);
  const response = await test.run(request);
  assert.equal(response.status, status, name);
  const body = await response.text();
  // Avoid printing any returned value on a failure, including parser errors.
  assert.ok(
    body ===
      (status === 204
        ? ""
        : JSON.stringify({ service_account_matches_expected: matches })),
    `${name}: response must contain only the expected boolean`,
  );
  assert.deepEqual(test.events, events, `${name}: authorization/read order`);
  if (status === 401 || status === 403) {
    assert.ok(
      !test.events.includes("secret"),
      `${name}: denied request must not read credentials`,
    );
  }
  passed++;
}

(async () => {
  await check(
    "MFA disabled still requires aal2",
    { requireMfa: false, aal: "aal1" },
    {},
    403,
    false,
    ["auth", "admins"],
  );
  await check(
    "missing MFA settings still requires aal2",
    { noSettings: true, aal: "aal1" },
    {},
    403,
    false,
    ["auth", "admins"],
  );
  const authorized = ["auth", "admins", "secret"];
  await check("admin with valid aal2", {}, {}, 200, true, authorized);
  await check(
    "admin with aal2 and MFA settings disabled",
    { requireMfa: false },
    {},
    200,
    true,
    authorized,
  );
  await check(
    "admin with aal2 and missing MFA settings",
    { noSettings: true },
    {},
    200,
    true,
    authorized,
  );
  // No private key is required: this diagnostic checks only the configured identity.
  await check(
    "email only",
    { raw: JSON.stringify({ client_email: expectedEmail }) },
    {},
    200,
    true,
    authorized,
  );
  const nonMatches = [
    ["different email", credential("different@example.invalid")],
    ["case difference", credential(expectedEmail.toUpperCase())],
    ["whitespace difference", credential(` ${expectedEmail} `)],
    ["missing secret", undefined],
    ["empty secret", ""],
    [
      "invalid JSON",
      `{"client_email":"${expectedEmail}","private_key":"${sentinel}`,
    ],
    ["null", "null"],
    ["array", JSON.stringify([{ client_email: expectedEmail }])],
    ["string", JSON.stringify(expectedEmail)],
    ["number", "42"],
    ["boolean", "true"],
    ["missing field", "{}"],
    ["null field", '{"client_email":null}'],
    ["array field", JSON.stringify({ client_email: [expectedEmail] })],
    ["object field", '{"client_email":{}}'],
    ["numeric field", '{"client_email":42}'],
    [
      "nested field",
      JSON.stringify({ account: { client_email: expectedEmail } }),
    ],
  ];
  for (const [name, raw] of nonMatches) {
    await check(name, { raw }, {}, 200, false, authorized);
  }
  await check(
    "query cannot supply identity",
    { raw: "{}" },
    { query: `?client_email=${encodeURIComponent(expectedEmail)}` },
    200,
    false,
    authorized,
  );
  await check("no session", {}, { authorization: null }, 401, false, []);
  await check("invalid session", { invalidSession: true }, {}, 401, false, [
    "auth",
  ]);
  await check("expired session", { expiredSession: true }, {}, 401, false, [
    "auth",
  ]);
  await check(
    "malformed token",
    {},
    { authorization: "Bearer invalid" },
    401,
    false,
    ["auth"],
  );
  await check(
    "forged aal2 token",
    {},
    { authorization: `Bearer ${jwt("aal2")}forged` },
    401,
    false,
    ["auth"],
  );
  await check("auth throws", { authThrows: true }, {}, 500, false, ["auth"]);
  await check("non-admin with aal2", { nonAdmin: true }, {}, 403, false, [
    "auth",
    "admins",
  ]);
  await check("admin lookup error", { errorAt: "admins" }, {}, 500, false, [
    "auth",
    "admins",
  ]);
  await check("admin lookup throws", { throwAt: "admins" }, {}, 500, false, [
    "auth",
    "admins",
  ]);
  for (const aal of ["aal1", "", "aal3"]) {
    await check("MFA required", { aal }, {}, 403, false, ["auth", "admins"]);
  }
  await check(
    "environment failure",
    { envThrows: true },
    {},
    500,
    false,
    authorized,
  );
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD"]) {
    await check("unsupported method", {}, { method }, 405, false, []);
  }
  await check(
    "preflight",
    {},
    { method: "OPTIONS", authorization: null },
    204,
    false,
    [],
  );
  console.log(
    `PASS play service-account diagnostic (${passed} cases; auth/MFA, exact match, safe output, read-only)`,
  );
})().catch(() => {
  // Keep failures sanitized too; assertion values can contain fixture data.
  console.error(
    `FAIL play service-account diagnostic after ${passed} passing cases`,
  );
  process.exitCode = 1;
});
