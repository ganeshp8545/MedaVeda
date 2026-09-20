-- READ-ONLY. How many active students have moved to the new build?
-- Needs the build that logs `app_open` (version 1.1.0). Builds released earlier never
-- log it, so "active but no app_open" = still on an older build.
with active as (
  select distinct user_id from public.analytics_events
  where user_id is not null and created_at > now() - interval '14 days'
),
new_build as (
  select distinct user_id from public.analytics_events
  where name = 'app_open' and user_id is not null and created_at > now() - interval '14 days'
    and string_to_array(params->>'version', '.')::int[] >= array[1,1,0]
)
select (select count(*) from active)                                            as active_users_14d,
       (select count(*) from active a join new_build n using (user_id))         as on_new_build,
       (select count(*) from active a left join new_build n using (user_id) where n.user_id is null) as still_on_old_build,
       round(100.0 * (select count(*) from active a join new_build n using (user_id))
             / nullif((select count(*) from active), 0), 1)                     as pct_on_new_build;
