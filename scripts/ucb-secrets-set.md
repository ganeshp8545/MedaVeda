# Set UCB Edge Function secrets

Keep the real environment file and service-account JSON outside git. The example file lists secret names and the non-secret Play package `in.medveda.app`. Do not put `SUPABASE_SERVICE_ROLE_KEY` in a client or EAS variable; Supabase provides it to Edge Functions.

First verify the linked project and validate the key file locally, without printing its contents:

```bash
read -r -p 'Expected Supabase project ref: ' expected_ref
test "$(cat supabase/.temp/project-ref)" = "$expected_ref" || exit 1
read -r -p 'Path to Google service-account JSON: ' key_file
test -r "$key_file" || exit 1
node -e 'const fs=require("fs"); const p=process.argv[1]; const v=JSON.parse(fs.readFileSync(p,"utf8")); if(v.type!=="service_account" || !v.client_email || !v.private_key) process.exit(1)' "$key_file" || exit 1
```

Set the JSON secret from that file through a temporary, owner-readable env file. The JSON value never enters shell history or a process argument:

```bash
tmp_env="$(mktemp)"
chmod 600 "$tmp_env"
trap 'rm -f "$tmp_env"' EXIT
node -e 'const fs=require("fs"); const v=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const line="GOOGLE_PLAY_SERVICE_ACCOUNT_JSON="+JSON.stringify(v)+"\n"; if(line.includes("#")) process.exit(1); fs.writeFileSync(process.argv[2],line,{mode:0o600})' "$key_file" "$tmp_env" || exit 1
supabase secrets set --env-file "$tmp_env" --project-ref "$expected_ref"
rm -f "$tmp_env"
trap - EXIT
```

Set the other names with `supabase secrets set --env-file scripts/ucb-secrets.env --project-ref "$expected_ref"` after filling that ignored file securely. Verify names with `supabase secrets list --project-ref "$expected_ref"`; do not display values. Remove any temporary key file after successful setup according to your credential policy. The Supabase Dashboard secret editor is an alternative if the CLI's env-file parser rejects the JSON format.

Set `APP_ENV=production` only in the confirmed production project and `APP_ENV=staging` only in the isolated staging project. It is required for all Razorpay calls; `ALLOW_TEST_MODE` is ignored. Confirm the target project reference before setting either marker. Do not print key or secret values.
