#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo 'Usage: scripts/ucb-deploy.sh [--dry-run | --yes]'
}

execute=false
case "${1:---dry-run}" in
  --dry-run) ;;
  --yes) execute=true ;;
  *) usage >&2; exit 2 ;;
esac
if (( $# > 1 )); then usage >&2; exit 2; fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

project_ref_file='supabase/.temp/project-ref'
if [[ -r "$project_ref_file" ]]; then
  project_ref="$(< "$project_ref_file")"
else
  project_ref='NOT LINKED'
fi
printf 'Linked Supabase project ref: %s\n' "$project_ref"

# The four user functions retain gateway JWT verification. The other three
# authenticate with a cron secret, Razorpay webhook HMAC, or payment signature.
commands=(
  'create-order'
  'create-play-order'
  'verify-play-purchase'
  'attach-external-token'
  'report-external-transaction --no-verify-jwt'
  'razorpay-webhook --no-verify-jwt'
  'verify-payment --no-verify-jwt'
)

for command in "${commands[@]}"; do
  printf 'supabase functions deploy %s --project-ref %s\n' "$command" "$project_ref"
done

if [[ "$execute" != true ]]; then
  echo 'Dry run only. Link and verify the intended project, then use --yes.'
  exit 0
fi

if [[ ! "$project_ref" =~ ^[a-z0-9]{20}$ ]]; then
  echo 'Refusing deployment: no valid linked project ref in supabase/.temp/project-ref.' >&2
  exit 1
fi
if ! command -v supabase >/dev/null 2>&1; then
  echo 'Refusing deployment: supabase CLI is unavailable.' >&2
  exit 1
fi
if [[ ! -t 0 ]]; then
  echo 'Refusing deployment: interactive project-ref confirmation is required.' >&2
  exit 1
fi
read -r -p "Type the linked project ref ($project_ref) to deploy: " confirmed_ref
if [[ "$confirmed_ref" != "$project_ref" ]]; then
  echo 'Project-ref confirmation did not match; no deployment started.' >&2
  exit 1
fi

for command in "${commands[@]}"; do
  read -r -a args <<< "$command"
  supabase functions deploy "${args[@]}" --project-ref "$project_ref"
done
