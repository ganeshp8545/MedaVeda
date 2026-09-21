-- ============================================================================
-- Batch 1 / F2 + F3: a refund or a lost dispute must take the access back, and
-- must take the referrer's credit back in EVERY state it can be in.
--
-- Before this migration handle_payment_refund():
--   * marked the order 'refunded' but left purchases.status = 'success', so the
--     student kept the content after a full refund (F2);
--   * found the referrer's credit through referrals.first_order_id, so a friend
--     who had deleted their account (referrals row gone) left the credit alive;
--   * only cancelled a credit with status 'pending' AND available_at > now(), so
--     a credit that was due but not yet released by the 15-minute job fell into
--     the "already released" branch and was then released anyway;
--   * only WARNED when the credit had already been released (F3).
--
-- After it:
--   * purchases.status leaves 'success' on a FULL refund (-> 'refunded') and on a
--     lost dispute (-> 'chargeback'); an open dispute suspends access
--     (-> 'disputed') and a won dispute restores it. Every entitlement check in
--     the database already tests status = 'success', so nothing else changes.
--   * a PARTIAL refund still does nothing at all (no revoke, no wallet, no credit).
--   * the credit is found through wallet_ledger.order_id (survives the friend's
--     account deletion), a pending credit is cancelled whatever its available_at,
--     a released credit gets a reversal row (clamped to what the referrer still
--     has, so the wallet never goes negative) and any part that cannot be
--     recovered is put in order_review_flags for a manual decision.
--   * credits attached to a disputed payment are not released while it is open.
-- ============================================================================

-- ---- 1. purchases.status: a real, closed vocabulary -------------------------
-- Live data: 13 rows, all 'success', none NULL.
update public.purchases set status = 'success' where status is null;   -- no-op on live; keeps the migration re-runnable on other copies
alter table public.purchases alter column status set default 'success';
alter table public.purchases alter column status set not null;
alter table public.purchases drop constraint if exists purchases_status_check;
alter table public.purchases add constraint purchases_status_check
  check (status in ('success', 'refunded', 'disputed', 'chargeback', 'duplicate'));

comment on column public.purchases.status is
  'success = grants access. refunded / chargeback = payment reversed, no access. disputed = open dispute, access suspended. duplicate = a second paid purchase of a product the student already owned (no access of its own; refund it).';

-- ---- 2. review flag for a credit that could not be fully recovered ----------
alter table public.order_review_flags drop constraint if exists order_review_flags_reason_check;
alter table public.order_review_flags add constraint order_review_flags_reason_check
  check (reason in ('stale_order_paid', 'discount_reused', 'referral_credit_unrecovered'));

-- ---- 3. one internal reversal routine ---------------------------------------
create or replace function public.reverse_payment(
  p_razorpay_payment_id text,
  p_purchase_status text,      -- 'refunded' | 'chargeback'
  p_restore_wallet boolean     -- give the student's own wallet amount back?
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_order public.orders%rowtype;
  v_credit public.wallet_ledger%rowtype;
  v_debit public.wallet_ledger%rowtype;
  v_restored numeric(10, 2) := 0;
  v_revoked integer := 0;
  v_rows integer := 0;
  v_avail numeric(10, 2);
  v_reversed numeric(10, 2);
  v_status jsonb;
begin
  if p_purchase_status not in ('refunded', 'chargeback') then
    raise exception 'reverse_payment: bad purchase status %', p_purchase_status;
  end if;

  -- Same lock order as settle_razorpay_payment (wallet lock, THEN the order row)
  -- so a refund cannot deadlock with a replayed capture event.
  select user_id into v_uid from public.orders where razorpay_payment_id = p_razorpay_payment_id;
  if v_uid is not null then
    perform pg_advisory_xact_lock(hashtextextended('wallet:' || v_uid::text, 0));
  end if;

  select * into v_order from public.orders where razorpay_payment_id = p_razorpay_payment_id for update;
  if not found then return jsonb_build_object('status', 'unknown_payment'); end if;

  -- ---- Take the access back ----------------------------------------------
  update public.orders set status = 'refunded', updated_at = now()
   where id = v_order.id and status = 'paid';

  update public.purchases set status = p_purchase_status
   where order_id = v_order.id and status not in ('refunded', 'chargeback');
  get diagnostics v_revoked = row_count;

  -- ---- Give the wallet amount this order used back to the student ---------
  if p_restore_wallet then
    select * into v_debit from public.wallet_ledger
     where order_id = v_order.id and entry_type = 'debit' and source = 'order_payment';
    if found and v_debit.user_id is not null then
      perform set_config('app.trusted_order_write', 'true', true);
      insert into public.wallet_ledger (user_id, entry_type, status, amount, source, order_id, note)
      values (v_debit.user_id, 'credit', 'available', v_debit.amount, 'order_refund', v_order.id,
              'Wallet amount restored after refund')
      on conflict (order_id) where entry_type = 'credit' and source = 'order_refund' do nothing;
      get diagnostics v_rows = row_count;   -- 1 on first insert, 0 on replay
      perform set_config('app.trusted_order_write', 'false', true);
      v_restored := case when v_rows > 0 then v_debit.amount else 0 end;
    end if;
  end if;

  -- ---- The referrer's credit for this friend's purchase --------------------
  -- Looked up by the ledger row's own order_id, NOT through referrals: the
  -- referrals row is deleted when the friend deletes their account.
  select * into v_credit from public.wallet_ledger
   where order_id = v_order.id and entry_type = 'credit' and source = 'referral_reward'
   for update;

  if not found then
    v_status := jsonb_build_object('status', 'no_referral_credit');

  elsif v_credit.status = 'cancelled' then
    v_status := jsonb_build_object('status', 'already_cancelled');

  elsif v_credit.status = 'pending' then
    -- Still held (even if the hold has technically run out but the release job
    -- has not run yet): cancel it.
    perform set_config('app.trusted_order_write', 'true', true);
    update public.wallet_ledger set status = 'cancelled' where id = v_credit.id;
    perform set_config('app.trusted_order_write', 'false', true);
    update public.referrals
       set status = 'rejected', reject_reason = 'friend_payment_reversed'
     where id = v_credit.referral_id and status <> 'rejected';
    v_status := jsonb_build_object('status', 'credit_cancelled', 'amount', v_credit.amount);

  elsif exists (select 1 from public.wallet_ledger
                 where entry_type = 'reversal' and reverses_id = v_credit.id) then
    v_status := jsonb_build_object('status', 'already_reversed', 'ledger_id', v_credit.id);

  elsif v_credit.user_id is null then
    v_status := jsonb_build_object('status', 'referrer_gone', 'ledger_id', v_credit.id);

  elsif v_credit.expires_at is not null and v_credit.expires_at <= now() then
    v_status := jsonb_build_object('status', 'credit_expired', 'ledger_id', v_credit.id);

  else
    -- Released ('available'): reverse it with a ledger row, but never by more
    -- than the referrer still has (the ledger refuses to overdraw). What cannot
    -- be recovered is flagged for a manual decision.
    perform pg_advisory_xact_lock(hashtextextended('wallet:' || v_credit.user_id::text, 0));
    select available into v_avail from public.wallet_balance_of(v_credit.user_id);
    v_reversed := least(v_credit.amount, coalesce(v_avail, 0));
    if v_reversed > 0 then
      perform set_config('app.trusted_order_write', 'true', true);
      insert into public.wallet_ledger (user_id, entry_type, status, amount, source, reverses_id, referral_id, order_id, note)
      values (v_credit.user_id, 'reversal', 'available', v_reversed, 'order_refund', v_credit.id, v_credit.referral_id, v_order.id,
              'Friend''s payment was reversed')
      on conflict (reverses_id) where entry_type = 'reversal' do nothing;
      perform set_config('app.trusted_order_write', 'false', true);
    end if;
    update public.referrals
       set status = 'rejected', reject_reason = 'friend_payment_reversed'
     where id = v_credit.referral_id and status <> 'rejected';
    if v_reversed < v_credit.amount then
      insert into public.order_review_flags (order_id, user_id, reason, wallet_amount, referral_discount, details)
      values (v_order.id, v_credit.user_id, 'referral_credit_unrecovered', 0, 0,
              jsonb_build_object(
                'credit_ledger_id', v_credit.id,
                'credit_amount', v_credit.amount,
                'reversed', v_reversed,
                'unrecovered', v_credit.amount - v_reversed,
                'razorpay_payment_id', p_razorpay_payment_id,
                'recommended_action',
                  'The friend''s payment was reversed but the referrer had already spent part of the credit. '
                  || 'Only what was still in their wallet was taken back; decide whether to recover the rest.'))
      on conflict (order_id, reason) where order_id is not null do nothing;
    end if;
    v_status := jsonb_build_object('status', 'credit_reversed', 'ledger_id', v_credit.id,
                                   'amount', v_credit.amount, 'reversed', v_reversed);
  end if;

  return v_status || jsonb_build_object('wallet_restored', v_restored, 'purchases_revoked', v_revoked);
end;
$$;

revoke all on function public.reverse_payment(text, text, boolean) from public, anon, authenticated;
grant execute on function public.reverse_payment(text, text, boolean) to service_role;

-- ---- 4. refund: a FULL refund reverses, a partial one does nothing -----------
create or replace function public.handle_payment_refund(p_razorpay_payment_id text, p_full_refund boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.orders where razorpay_payment_id = p_razorpay_payment_id) then
    return jsonb_build_object('status', 'unknown_payment');
  end if;
  if not coalesce(p_full_refund, false) then
    return jsonb_build_object('status', 'partial_refund_ignored');
  end if;
  return public.reverse_payment(p_razorpay_payment_id, 'refunded', true);
end;
$$;

revoke all on function public.handle_payment_refund(text, boolean) from public, anon, authenticated;
grant execute on function public.handle_payment_refund(text, boolean) to service_role;

-- ---- 5. disputes / chargebacks ----------------------------------------------
--   opened : suspend access while the dispute is open (nothing else moves)
--   won    : give the access back
--   lost   : the money is gone - same as a full refund, except the student's
--            wallet amount is NOT given back
create or replace function public.handle_payment_dispute(p_razorpay_payment_id text, p_outcome text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_uid uuid;
  v_n integer := 0;
begin
  if p_outcome not in ('opened', 'won', 'lost') then
    raise exception 'handle_payment_dispute: unknown outcome %', p_outcome;
  end if;

  if p_outcome = 'lost' then
    return public.reverse_payment(p_razorpay_payment_id, 'chargeback', false)
           || jsonb_build_object('dispute', 'lost');
  end if;

  select user_id into v_uid from public.orders where razorpay_payment_id = p_razorpay_payment_id;
  if v_uid is not null then
    perform pg_advisory_xact_lock(hashtextextended('wallet:' || v_uid::text, 0));
  end if;
  select * into v_order from public.orders where razorpay_payment_id = p_razorpay_payment_id for update;
  if not found then return jsonb_build_object('status', 'unknown_payment'); end if;

  if p_outcome = 'opened' then
    update public.purchases set status = 'disputed' where order_id = v_order.id and status = 'success';
    get diagnostics v_n = row_count;
    return jsonb_build_object('status', case when v_n > 0 then 'access_suspended' else 'nothing_to_suspend' end,
                              'purchases_suspended', v_n);
  end if;

  -- won: restore, unless the student bought the same product again meanwhile
  -- (then this one is the duplicate; it keeps no access of its own).
  update public.purchases pu
     set status = case when exists (select 1 from public.purchases o
                                     where o.user_id = pu.user_id and o.product_id = pu.product_id
                                       and o.id <> pu.id and o.status = 'success')
                       then 'duplicate' else 'success' end
   where pu.order_id = v_order.id and pu.status = 'disputed';
  get diagnostics v_n = row_count;
  return jsonb_build_object('status', case when v_n > 0 then 'access_restored' else 'nothing_to_restore' end,
                            'purchases_restored', v_n);
end;
$$;

revoke all on function public.handle_payment_dispute(text, text) from public, anon, authenticated;
grant execute on function public.handle_payment_dispute(text, text) to service_role;

-- ---- 6. do not release credits that belong to a disputed payment -------------
create or replace function public.release_due_wallet_credits(p_user uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  n integer;
begin
  -- Called from get_my_wallet() under the student's role: tell the
  -- block_client_writes backstop this write is ours (transaction-local).
  perform set_config('app.trusted_order_write', 'true', true);
  with due as (
    update public.wallet_ledger l
       set status = 'available'
     where l.entry_type = 'credit'
       and l.status = 'pending'
       and l.available_at <= now()
       and (p_user is null or l.user_id = p_user)
       -- a credit earned by a payment that is being disputed stays held
       and not exists (select 1 from public.purchases pu
                        where pu.order_id = l.order_id and pu.status = 'disputed')
    returning l.id, l.referral_id
  )
  select array_agg(id), count(*) into v_ids, n from due;

  update public.referrals r
     set status = 'rewarded', rewarded_at = now()
   where r.status = 'qualified'
     and exists (
       select 1 from public.wallet_ledger l
        where l.referral_id = r.id and l.source = 'referral_reward'
          and l.entry_type = 'credit' and l.status = 'available'
     );

  perform set_config('app.trusted_order_write', 'false', true);
  return coalesce(n, 0);
end;
$$;

revoke all on function public.release_due_wallet_credits(uuid) from public, anon, authenticated;
grant execute on function public.release_due_wallet_credits(uuid) to service_role;
