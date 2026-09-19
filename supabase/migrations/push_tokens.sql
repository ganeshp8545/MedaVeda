-- NOTIFICATIONS SYSTEM - push_tokens table.
-- Stores one row per device (a user with 2 phones gets 2 rows). The
-- send-push-notification Edge Function reads from here to know which
-- Expo push tokens belong to which user (for targeted sends) or reads
-- all of them (for a broadcast).

create table if not exists push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null check (platform in ('ios', 'android', 'web')),
  updated_at timestamptz not null default now()
);

create index if not exists idx_push_tokens_user_id on push_tokens(user_id);

alter table push_tokens enable row level security;

-- A user can only manage their own device tokens.
create policy "Users manage their own push tokens"
  on push_tokens
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- The Edge Function (using the service role key, which bypasses RLS)
-- reads across all users for broadcast/segmented sends - no separate
-- policy needed for that since service-role calls skip RLS entirely.

-- OFFLINE MODE cross-reference: quiz_scores also needs this if not
-- already applied (see OFFLINE_MODE_SETUP.md) -
--   alter table quiz_scores add column if not exists id text primary key;
