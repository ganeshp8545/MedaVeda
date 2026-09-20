Runs supabase/functions/delete-account/index.ts on Node 22 against a scratch Postgres
(no Deno / Supabase CLI needed). The real `_shared/supabaseAdmin.ts` is replaced by the
mock here, which talks to a local DB named `ap_del_test` (a copy of the live-shaped
scratch DB with all migrations applied) through psql.

    S=$(mktemp -d); mkdir -p $S/_shared $S/delete-account
    cp supabase/functions/_shared/cors.ts $S/_shared/
    cp supabase/tests/delete-account-harness/supabaseAdmin.mock.ts $S/_shared/supabaseAdmin.ts
    cp supabase/functions/delete-account/index.ts $S/delete-account/
    cp supabase/tests/delete-account-harness/run.mjs $S/
    # seed users/orders as at the top of run.mjs (A, B, admin), then:
    cd $S && TOKENS='{"tokA":"<uuid A>","tokB":"<uuid B>","tokAdmin":"<uuid admin>"}' node --experimental-strip-types run.mjs
