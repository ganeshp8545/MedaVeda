# Pricing conversion diagnostic (prepared; not deployed)

The gateway requires a JWT. The handler independently requires a verified
Supabase user session, `admins` membership, and AAL2 MFA. One authorized POST
obtains a token through the production Google Play service-account helper and
makes exactly one `pricing:convertRegionPrices` call for INR 1. The Google
operation only calculates prices. This handler does not call the catalog worker,
create products, change prices, or write to the database. It has no retry loop
and emits no credentials, tokens, raw Google response, or exception text to
logs.

The response returns Google's HTTP status, numeric error code, reason, redacted
message, and bounded structured details. A successful conversion returns only
`google_http_status`. An OAuth failure is reported separately. HTTP 200 from
this function means the diagnostic ran; `google_http_status` is Google's pricing
response status. Browser CORS access is disabled; use a server-side or
command-line request with a current admin AAL2 session.

Local sanitizer verification:

```sh
deno test supabase/functions/diagnose-play-pricing/*_test.ts
```

**Approval boundary:** Deploying this function and invoking it against
production each require the user's explicit approval. After approval, invoke it
once with an authenticated admin AAL2 session and record only its returned
sanitized JSON. Do not invoke `sync-play-catalog` as a diagnostic.
