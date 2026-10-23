-- Disposable database only. Every scenario rolls back its synthetic changes.
begin;
do $$
declare j record;
begin
  select * into j from public.claim_play_price_sync();
  assert j.price_inr=49, 'expected seeded price';
  update public.notes set pdf_url='replacement.pdf' where id='seed_note';
  assert (select status='running' and lease_id=j.lease_id from public.play_price_sync where price_inr=49),
    'PDF update invalidated an active catalog lease';
  assert (select count(*)=0 from public.claim_play_price_sync()), 'catalog job claimed concurrently';
  assert public.finish_play_price_sync(49,j.lease_id,j.candidate_sku,'buy'), 'original worker lost its lease';
end $$;
rollback;

begin;
do $$
declare j record; due timestamptz;
begin
  select * into j from public.claim_play_price_sync();
  assert public.fail_play_price_sync(49,j.lease_id,'Google API 429',true);
  select next_attempt_at into due from public.play_price_sync where price_inr=49;
  update public.notes set pdf_url='replacement.pdf' where id='seed_note';
  assert (select next_attempt_at=due from public.play_price_sync where price_inr=49),
    'PDF update bypassed catalog retry backoff';
  assert (select count(*)=0 from public.claim_play_price_sync()), 'backoff was not respected';
end $$;
rollback;

begin;
do $$
declare j record; events bigint;
begin
  select * into j from public.claim_play_price_sync();
  assert public.fail_play_price_sync(49,j.lease_id,'Google Play API 403',false);
  select count(*) into events from public.play_price_sync_logs;
  update public.notes set pdf_url='replacement.pdf' where id='seed_note';
  assert (select status='failed' and attempts=1 and last_error='Google Play API 403'
    from public.play_price_sync where price_inr=49), 'PDF update automatically retried permanent 403';
  assert (select count(*)=events from public.play_price_sync_logs), 'no-op enqueue produced misleading event';
  assert (select count(*)=0 from public.claim_play_price_sync()), 'permanent failure was claimed again';
end $$;
rollback;

begin;
do $$
declare j record;
begin
  select * into j from public.claim_play_price_sync();
  update public.play_price_sync set lease_until=now()-interval '1 second' where price_inr=49;
  assert not public.fail_play_price_sync(49,j.lease_id,'late worker failure',false),
    'expired worker changed catalog state';
end $$;
rollback;
