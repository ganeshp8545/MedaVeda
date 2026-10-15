-- Play refunds/voids revoke the entitlement and referral credit with the same
-- ledger rules as Razorpay reverse_payment. No Play purchase uses a wallet debit.
alter table public.orders add column if not exists play_last_checked_at timestamptz;

create or replace function public.reverse_play_payment(p_purchase_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_order public.orders%rowtype;
  v_credit public.wallet_ledger%rowtype;
  v_restored numeric(10, 2) := 0;
  v_revoked integer := 0;
  v_avail numeric(10, 2);
  v_reversed numeric(10, 2);
  v_status jsonb;
begin
  -- Same lock order as settle_play_purchase (wallet lock, THEN the order row)
  -- so a refund cannot deadlock with a replayed capture event.
  select user_id into v_uid from public.orders where purchase_token = p_purchase_token and provider = 'play';
  if v_uid is not null then
    perform pg_advisory_xact_lock(hashtextextended('wallet:' || v_uid::text, 0));
  end if;

  select * into v_order from public.orders where purchase_token = p_purchase_token and provider = 'play' for update;
  if not found then return jsonb_build_object('status', 'unknown_payment'); end if;

  -- ---- Take the access back ----------------------------------------------
  update public.orders set status = 'refunded', updated_at = now()
   where id = v_order.id and status = 'paid';

  update public.purchases set status = 'refunded'
   where order_id = v_order.id and status not in ('refunded', 'chargeback');
  get diagnostics v_revoked = row_count;

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
                'order_id', v_order.id,
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


revoke all on function public.reverse_play_payment(text) from public, anon, authenticated;
grant execute on function public.reverse_play_payment(text) to service_role;
