-- A Play order snapshots the selected Notes entitlement when checkout begins.
-- Use that snapshot if catalog metadata changes before a delayed purchase settles.
-- Razorpay rows and existing purchase records are untouched.
begin;

create function public.play_purchase_entitlement_from_order()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_order public.orders%rowtype;
begin
  if new.order_id is null then return new; end if;
  select * into v_order from public.orders where id=new.order_id;
  if not found or v_order.provider <> 'play' then return new; end if;
  if new.user_id is distinct from v_order.user_id
     or new.product_id is distinct from v_order.product_id
     or new.amount is distinct from v_order.amount
     or v_order.scope not in ('chapter','subject','year','bundle') then
    raise exception 'Play purchase does not match order entitlement';
  end if;
  new.scope:=v_order.scope;
  new.chapter_id:=v_order.chapter_id;
  new.subject_id:=v_order.subject_id;
  new.year_id:=v_order.year_id;
  new.year_ids:=v_order.year_ids;
  new.course_id:=v_order.course_id;
  return new;
end $$;

revoke all on function public.play_purchase_entitlement_from_order() from public,anon,authenticated;
create trigger purchases_play_order_snapshot before insert on public.purchases
  for each row execute function public.play_purchase_entitlement_from_order();

commit;
