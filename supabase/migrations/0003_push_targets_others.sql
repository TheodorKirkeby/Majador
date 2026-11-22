-- MajaDor 0003: push targets for "someone else did something" notifications.
--
-- SHARED OBJECTS: none. One new function inside `majador`.
--
-- "Vare tilføjet" must never go to the person who added the item, only to the
-- rest of the household. push_targets() (0001) returns every device and stays
-- as it is for the test notification; this one leaves the caller's own
-- devices out.
--
-- One transaction: if any statement fails, nothing is applied.

begin;

create function majador.push_targets_others()
returns table (id bigint, endpoint text, p256dh text, auth text)
language sql
stable
security definer
set search_path = majador
as $$
  select s.id, s.endpoint, s.p256dh, s.auth
  from majador.push_subscriptions s
  where majador.is_member()
    and s.user_id <> auth.uid();
$$;

-- New functions are executable by PUBLIC by default; close that.
revoke all on function majador.push_targets_others() from public;
grant execute on function majador.push_targets_others() to authenticated;

commit;
