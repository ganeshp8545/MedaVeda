`GET /functions/v1/diagnose-play-service-account` checks the runtime
`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` against the fixed expected service account.
It uses the existing verified Supabase session, `admins` membership and
configured MFA requirement before reading the environment value.

The only JSON response field is `service_account_matches_expected`, a boolean.
On HTTP 200, `true` means an exact `client_email` match; `false` includes a
missing secret, malformed JSON, an invalid JSON shape or a different email. This
checks identity only, not key validity, Google permissions or the cause of
the 403.

HTTP 401/403 deny access, 405 rejects unsupported methods, and 500 means the
check could not complete. These responses use the same field with `false`; they
are **not evidence of an identity mismatch**. OPTIONS returns an empty 204.
Responses use `Cache-Control: no-store`. The endpoint does not log, call Google,
or write to the database; its only remote operations are session validation and
admin reads.

Local verification (uses synthetic values and mocks; no network or live
secrets):

```sh
node supabase/tests/play-service-account-diagnostic-selftest.cjs
```

Implementation and local verification alone do not establish the deployed
identity. Production deployment and invocation are outside this change's scope.
