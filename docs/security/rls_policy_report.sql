-- Every RLS policy, table by table (run AFTER the migrations; paste the output for review).
select schemaname as schema, tablename as "table", policyname as policy, cmd,
       roles::text as roles, qual as using_expr, with_check
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, cmd, policyname;

-- Tables with RLS disabled (should be empty for anything holding user data)
select n.nspname, c.relname
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r' and n.nspname = 'public' and not c.relrowsecurity
order by 1, 2;

-- Client write privileges on the money tables (all four must be 'f')
select t, has_table_privilege('authenticated', t, 'insert') as ins,
          has_table_privilege('authenticated', t, 'update') as upd,
          has_table_privilege('authenticated', t, 'delete') as del
from (values ('public.orders'), ('public.purchases'), ('public.payments'), ('public.payment_sessions')) v(t);

-- Functions callable by clients that are SECURITY DEFINER (review each one)
select p.oid::regprocedure as fn
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
order by 1;

select id, public from storage.buckets order by id;   -- notes must be false
