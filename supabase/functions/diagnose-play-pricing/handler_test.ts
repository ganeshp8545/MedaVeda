import { createHandler, type Dependencies } from "./handler.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function fixture(
  options: {
    user?: boolean;
    admin?: boolean;
    aal?: string;
    googleStatus?: number;
  } = {},
) {
  const calls: string[] = [];
  const deps: Dependencies = {
    getUser: () => {
      calls.push("auth");
      return Promise.resolve(
        options.user === false ? null : { id: "admin-id" },
      );
    },
    getAdmin: () => {
      calls.push("admin");
      return Promise.resolve(options.admin !== false);
    },
    getAal: () => {
      calls.push("aal");
      return options.aal ?? "aal2";
    },
    getPackageName: () => {
      calls.push("package");
      return "in.medveda.app";
    },
    getToken: () => {
      calls.push("token");
      return Promise.resolve("SECRET_TOKEN");
    },
    fetchGoogle: (input, init) => {
      calls.push("google");
      assert(
        String(input) ===
          "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/in.medveda.app/pricing:convertRegionPrices",
        "wrong endpoint",
      );
      assert(init?.method === "POST", "wrong method");
      assert(
        init?.body === '{"price":{"currencyCode":"INR","units":"1","nanos":0}}',
        "wrong body",
      );
      const headers = new Headers(init?.headers);
      assert(
        headers.get("Authorization") === "Bearer SECRET_TOKEN",
        "missing bearer token",
      );
      return Promise.resolve(Response.json(
        options.googleStatus === 200 ? { convertedRegionPrices: { IN: {} } } : {
          error: {
            code: 403,
            status: "PERMISSION_DENIED",
            message: "The caller does not have permission",
            details: [],
          },
        },
        { status: options.googleStatus ?? 403 },
      ));
    },
  };
  return { handler: createHandler(deps), calls };
}

const request = () =>
  new Request("https://example.invalid/functions/v1/diagnose-play-pricing", {
    method: "POST",
  });

Deno.test("requires a verified Auth user before admin, credential, or Google access", async () => {
  const { handler, calls } = fixture({ user: false });
  const response = await handler(request());
  assert(response.status === 401, "missing 401");
  assert(calls.join(",") === "auth", "unauthorized side effect");
});

Deno.test("requires admin membership before credential or Google access", async () => {
  const { handler, calls } = fixture({ admin: false });
  const response = await handler(request());
  assert(response.status === 403, "missing 403");
  assert(calls.join(",") === "auth,admin", "non-admin side effect");
});

Deno.test("admin lookup failure fails closed before credential access", async () => {
  const calls: string[] = [];
  const response = await createHandler({
    getUser: () => {
      calls.push("auth");
      return Promise.resolve({ id: "admin-id" });
    },
    getAdmin: () => {
      calls.push("admin");
      throw new Error("database returned SECRET_TOKEN");
    },
    getAal: () => "aal2",
    getPackageName: () => "in.medveda.app",
    getToken: () => {
      calls.push("token");
      return Promise.resolve("SECRET_TOKEN");
    },
    fetchGoogle: fetch,
  })(request());
  assert(response.status === 500, "lookup error must fail closed");
  assert(
    calls.join(",") === "auth,admin",
    "credential reached after lookup failure",
  );
  assert(!(await response.text()).includes("SECRET_TOKEN"), "exception leaked");
});

Deno.test("requires AAL2 unconditionally before credential or Google access", async () => {
  for (const aal of ["aal1", ""]) {
    const { handler, calls } = fixture({ aal });
    const response = await handler(request());
    assert(response.status === 403, "missing MFA 403");
    assert(calls.join(",") === "auth,admin,aal", "low-AAL side effect");
  }
});

Deno.test("only POST is allowed and no browser CORS access is granted", async () => {
  const { handler, calls } = fixture();
  const response = await handler(
    new Request("https://example.invalid", { method: "OPTIONS" }),
  );
  assert(
    response.status === 405 && response.headers.get("Allow") === "POST",
    "method restriction failed",
  );
  assert(!response.headers.has("Access-Control-Allow-Origin"), "wildcard CORS");
  assert(calls.length === 0, "OPTIONS side effect");
});

Deno.test("authorized invocation makes exactly one fixed Google call and sanitizes the response", async () => {
  const { handler, calls } = fixture();
  const response = await handler(request());
  const body = await response.json();
  assert(
    response.status === 200 && body.google_http_status === 403 &&
      body.error_code === 403 &&
      body.reason === "PERMISSION_DENIED" &&
      body.message === "The caller does not have permission",
    "denial fields lost",
  );
  assert(
    calls.join(",") === "auth,admin,aal,package,token,google",
    "call count or order wrong",
  );
  assert(!JSON.stringify(body).includes("SECRET_TOKEN"), "token leaked");
  assert(
    response.headers.get("Cache-Control") === "no-store",
    "response cacheable",
  );
  assert(
    !response.headers.has("Access-Control-Allow-Origin"),
    "browser CORS access granted",
  );
});

Deno.test("successful conversion returns status without prices", async () => {
  const { handler, calls } = fixture({ googleStatus: 200 });
  const response = await handler(request());
  const body = await response.json();
  assert(
    JSON.stringify(body) === '{"google_http_status":200}',
    "Google prices leaked",
  );
  assert(
    calls.filter((call) => call === "google").length === 1,
    "Google retry detected",
  );
});
