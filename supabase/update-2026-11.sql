-- Run once in Supabase -> SQL Editor if you already ran schema.sql before November 2026.

-- ---------- Email summary, push notifications and account deletion (added Nov 2026) ----------
-- Safe to run more than once. Existing installs: run this block (or supabase/update-2026-11.sql) once.

alter table public.user_preferences add column if not exists email_digest boolean not null default true;
alter table public.user_preferences add column if not exists last_digest_on date;

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops(id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now(),
  unique (shop_id, endpoint)
);
create index if not exists push_subs_shop_idx on public.push_subscriptions(shop_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_subs_all on public.push_subscriptions;
create policy push_subs_all on public.push_subscriptions for all to authenticated
  using (shop_id = public.current_shop_id()) with check (shop_id = public.current_shop_id());

-- Lets a signed-in user permanently delete their own shop, all of its data and their login.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare
  sid uuid := public.current_shop_id();
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if sid is not null then delete from public.shops where id = sid; end if;
  delete from auth.users where id = uid;
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

notify pgrst, 'reload schema';
