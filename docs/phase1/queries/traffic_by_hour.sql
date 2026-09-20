-- READ-ONLY. When is the app quietest? Pick the lowest hours for the migration.
-- Time zone: India (IST). Uses the last 30 days of app events and order creation.
with ev as (
  select extract(hour from created_at at time zone 'Asia/Kolkata')::int as hour_ist,
         extract(isodow from created_at at time zone 'Asia/Kolkata')::int as dow, -- 1=Mon .. 7=Sun
         user_id
  from public.analytics_events
  where created_at > now() - interval '30 days'
),
ord as (
  select extract(hour from created_at at time zone 'Asia/Kolkata')::int as hour_ist, count(*) as orders_started
  from public.orders where created_at > now() - interval '30 days' group by 1
)
select lpad(g.h::text, 2, '0') || ':00' as hour_ist,
       count(ev.*)                       as events_30d,
       count(distinct ev.user_id)        as distinct_users_30d,
       coalesce(max(o.orders_started),0) as orders_started_30d
from generate_series(0, 23) g(h)
left join ev  on ev.hour_ist = g.h
left join ord o on o.hour_ist = g.h
group by g.h order by g.h;
-- Weekday view (1=Mon .. 7=Sun) - run separately if you want it:
--   select dow, count(*) from (…the ev CTE above…) group by 1 order by 1;
