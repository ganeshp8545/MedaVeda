-- Read-only owner inventory. Run in the intended hosted project's SQL Editor.
-- Share product IDs, titles, classifications, targets and counts; do not share
-- purchase tokens or personal identifiers. Counts do not classify a product.
select p.id, p.title, p.description, p.scope, p.product_type, p.active,
       p.price, p.course_id, p.chapter_id, p.subject_id, p.year_id, p.year_ids,
       count(distinct c.id) as covered_chapters,
       count(distinct n.id) filter (where n.active and not n.is_free_preview) as active_paid_pdfs,
       count(distinct n.id) filter (where n.active and n.is_free_preview) as active_free_previews,
       (select count(*) from public.purchases pu
        where pu.product_id=p.id and pu.status='success') as successful_purchases,
       (select count(*) from public.orders o
        where o.product_id=p.id and o.provider='play' and o.status in ('created','paid')) as play_orders
from public.products p
left join public.chapters c on c.course_id=p.course_id
 and ((p.scope='chapter' and c.id=p.chapter_id)
   or (p.scope='subject' and c.subject_id=p.subject_id)
   or (p.scope='year' and c.year_id=p.year_id)
   or (p.scope='bundle' and c.year_id=any(p.year_ids)))
left join public.notes n on n.chapter_id=c.id
group by p.id
order by p.active desc,p.scope,p.title,p.id;

-- Content names for the owner's intent review. Videos are only adjacent
-- catalog records; their presence does not prove a product sells videos.
select p.id as product_id,p.title as product_title,p.product_type,p.scope,
       array_remove(array_agg(distinct n.title) filter
         (where n.active and not n.is_free_preview),null) as paid_pdf_titles,
       (select array_agg(distinct v.title) from public.videos v
        where v.active and v.course_id=p.course_id
          and ((p.scope='chapter' and v.subject_id=(select c2.subject_id from public.chapters c2 where c2.id=p.chapter_id))
            or (p.scope='subject' and v.subject_id=p.subject_id)
            or (p.scope='year' and v.year_id=p.year_id)
            or (p.scope='bundle' and v.year_id=any(p.year_ids)))) as adjacent_video_titles
from public.products p
left join public.chapters c on c.course_id=p.course_id
 and ((p.scope='chapter' and c.id=p.chapter_id)
   or (p.scope='subject' and c.subject_id=p.subject_id)
   or (p.scope='year' and c.year_id=p.year_id)
   or (p.scope='bundle' and c.year_id=any(p.year_ids)))
left join public.notes n on n.chapter_id=c.id
group by p.id
order by p.id;

-- Verify the deployed classification rule, defaults, and scope constraints.
select column_name,data_type,column_default,is_nullable
from information_schema.columns
where table_schema='public' and table_name in ('products','notes','videos')
  and column_name in ('product_type','scope','price','active','course_id','chapter_id',
                      'subject_id','year_id','year_ids','is_free_preview')
order by table_name,column_name;
select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid in ('public.products'::regclass,'public.notes'::regclass,
                                      'public.videos'::regclass)
order by table_name,conname;

-- Confirm which migration and Play catalog data already exist; no data change.
select version from supabase_migrations.schema_migrations
where version in ('20260925100000','20261016100000') order by version;
select price_inr,play_sku,active from public.play_price_tiers order by price_inr,play_sku;
