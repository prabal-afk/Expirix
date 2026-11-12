-- =====================================================================
-- Expirix — database schema for Supabase (PostgreSQL)
-- Run this whole file once in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- It is safe to read top-to-bottom; every table is protected by Row Level Security
-- so a signed-in shop can only ever see and change its own rows.
-- =====================================================================

-- ---------- Tables ----------

create table if not exists public.shops (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'My Shop' check (char_length(name) between 1 and 80),
  owner_name  text not null default '',
  phone       text not null default '',
  email       text not null default '',
  address     text not null default '',
  created_at  timestamptz not null default now()
);

-- One profile per login (auth.users). Links the login to its shop.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  shop_id     uuid not null references public.shops(id) on delete cascade,
  full_name   text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists profiles_shop_idx on public.profiles(shop_id);

create table if not exists public.user_preferences (
  shop_id                uuid primary key references public.shops(id) on delete cascade,
  expiry_threshold_days  int  not null default 7  check (expiry_threshold_days between 1 and 60),
  alert_upcoming_days    int  not null default 30 check (alert_upcoming_days between 1 and 365),
  alert_warning_days     int  not null default 7  check (alert_warning_days between 1 and 365),
  alert_high_days        int  not null default 3  check (alert_high_days between 1 and 365),
  alert_critical_days    int  not null default 1  check (alert_critical_days between 1 and 365),
  low_stock_default      numeric not null default 5 check (low_stock_default >= 0),
  currency               text not null default 'INR',
  date_format            text not null default 'DD/MM/YYYY' check (date_format in ('DD/MM/YYYY','MM/DD/YYYY','YYYY-MM-DD')),
  timezone               text not null default 'Asia/Kolkata',
  in_app_alerts          boolean not null default true,
  browser_notifications  boolean not null default false
);

create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  brand       text not null default '',
  category    text not null default 'Other',
  barcode     text,
  unit        text not null default 'pieces',
  min_stock   numeric check (min_stock is null or min_stock >= 0),
  supplier    text,
  notes       text,
  created_at  timestamptz not null default now(),
  unique (id, shop_id)
);
create index if not exists products_shop_idx    on public.products(shop_id);
create index if not exists products_barcode_idx on public.products(shop_id, barcode) where barcode is not null;
create index if not exists products_name_idx    on public.products(shop_id, lower(name));

-- Each batch keeps its OWN expiry date and quantity.
create table if not exists public.batches (
  id                uuid primary key default gen_random_uuid(),
  shop_id           uuid not null,
  product_id        uuid not null,
  batch_no          text,
  quantity          numeric not null default 0 check (quantity >= 0),   -- stock can never go negative
  initial_quantity  numeric not null default 0 check (initial_quantity >= 0),
  purchase_price    numeric not null default 0 check (purchase_price >= 0),
  selling_price     numeric not null default 0 check (selling_price >= 0),
  purchase_date     date not null,
  mfg_date          date,
  expiry_date       date not null,
  created_at        timestamptz not null default now(),
  check (mfg_date is null or mfg_date <= expiry_date),
  -- the batch and its product must belong to the same shop
  foreign key (product_id, shop_id) references public.products(id, shop_id) on delete cascade
);
create index if not exists batches_shop_expiry_idx on public.batches(shop_id, expiry_date);
create index if not exists batches_product_idx     on public.batches(product_id);

-- Audit trail. Rows are never updated or deleted by the app. They keep a snapshot of the product
-- name and costs so waste reports survive even if a product or batch is later deleted.
create table if not exists public.stock_movements (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references public.shops(id) on delete cascade,
  product_id    uuid references public.products(id) on delete set null,
  batch_id      uuid references public.batches(id)  on delete set null,
  product_name  text not null,
  batch_no      text,
  unit          text not null default '',
  type          text not null check (type in ('received','sold','damaged','expired_removed','returned','adjustment')),
  qty_change    numeric not null,
  qty_after     numeric not null check (qty_after >= 0),
  unit_cost     numeric not null default 0,
  unit_price    numeric not null default 0,
  notes         text,
  created_at    timestamptz not null default now()
);
create index if not exists movements_shop_time_idx on public.stock_movements(shop_id, created_at desc);
create index if not exists movements_batch_idx     on public.stock_movements(batch_id);

create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references public.shops(id) on delete cascade,
  batch_id      uuid not null references public.batches(id) on delete cascade,
  product_id    uuid not null references public.products(id) on delete cascade,
  level         text not null check (level in ('upcoming','warning','high','critical','today','expired')),
  title         text not null,
  product_name  text not null,
  batch_no      text,
  quantity      numeric not null default 0,
  expiry_date   date not null,
  created_at    timestamptz not null default now(),
  read          boolean not null default false,
  dismissed     boolean not null default false,
  resolved      boolean not null default false,
  unique (batch_id, level)          -- never two alerts for the same batch + threshold
);
create index if not exists notifications_shop_idx on public.notifications(shop_id, created_at desc);

-- ---------- Row Level Security ----------

create or replace function public.current_shop_id() returns uuid
language sql stable security definer set search_path = public as $$
  select shop_id from public.profiles where id = auth.uid()
$$;
revoke all on function public.current_shop_id() from public, anon;
grant execute on function public.current_shop_id() to authenticated;

alter table public.shops            enable row level security;
alter table public.profiles         enable row level security;
alter table public.user_preferences enable row level security;
alter table public.products         enable row level security;
alter table public.batches          enable row level security;
alter table public.stock_movements  enable row level security;
alter table public.notifications    enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid());

drop policy if exists shops_select on public.shops;
drop policy if exists shops_update on public.shops;
create policy shops_select on public.shops for select to authenticated using (id = public.current_shop_id());
create policy shops_update on public.shops for update to authenticated
  using (id = public.current_shop_id()) with check (id = public.current_shop_id());

drop policy if exists prefs_all on public.user_preferences;
create policy prefs_all on public.user_preferences for all to authenticated
  using (shop_id = public.current_shop_id()) with check (shop_id = public.current_shop_id());

drop policy if exists products_all on public.products;
create policy products_all on public.products for all to authenticated
  using (shop_id = public.current_shop_id()) with check (shop_id = public.current_shop_id());

drop policy if exists batches_all on public.batches;
create policy batches_all on public.batches for all to authenticated
  using (shop_id = public.current_shop_id()) with check (shop_id = public.current_shop_id());

drop policy if exists notifications_all on public.notifications;
create policy notifications_all on public.notifications for all to authenticated
  using (shop_id = public.current_shop_id()) with check (shop_id = public.current_shop_id());

-- movements: read + add only (history cannot be edited or erased from the app)
drop policy if exists movements_select on public.stock_movements;
drop policy if exists movements_insert on public.stock_movements;
create policy movements_select on public.stock_movements for select to authenticated using (shop_id = public.current_shop_id());
create policy movements_insert on public.stock_movements for insert to authenticated with check (shop_id = public.current_shop_id());

-- ---------- New sign-up -> create the shop, preferences and profile ----------

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  new_shop uuid;
  shop_label text := left(coalesce(nullif(trim(new.raw_user_meta_data->>'shop_name'), ''), 'My Shop'), 80);
  owner_label text := left(coalesce(nullif(trim(new.raw_user_meta_data->>'owner_name'), ''), ''), 80);
begin
  insert into public.shops (name, owner_name, email)
    values (shop_label, owner_label, coalesce(new.email, '')) returning id into new_shop;
  insert into public.user_preferences (shop_id) values (new_shop);
  insert into public.profiles (id, shop_id, full_name) values (new.id, new_shop, owner_label);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Stock movements: one safe, atomic function ----------
-- Mirrors lib/movements.ts. The server re-checks every rule, so the browser cannot bypass them:
--   * quantity must be positive; stock can never go below zero
--   * expired stock cannot be sold or received into
--   * "expired removed" only applies to batches that really have expired
-- "Today" is calculated on the server in the shop's time zone.

create or replace function public.record_movement(
  p_batch_id uuid, p_type text, p_quantity numeric, p_notes text default null
) returns json
language plpgsql security invoker set search_path = public as $$
declare
  b public.batches;
  prod public.products;
  tz text;
  today date;
  is_expired boolean;
  change numeric;
  after_qty numeric;
  m public.stock_movements;
begin
  select * into b from public.batches where id = p_batch_id for update;
  if not found then raise exception 'That batch does not exist.'; end if;
  select * into prod from public.products where id = b.product_id;
  select timezone into tz from public.user_preferences where shop_id = b.shop_id;
  today := (now() at time zone coalesce(tz, 'Asia/Kolkata'))::date;
  is_expired := b.expiry_date < today;

  if p_type not in ('received','sold','damaged','expired_removed','returned','adjustment') then
    raise exception 'Unknown movement type.';
  end if;
  if p_quantity is null then raise exception 'Enter a valid quantity.'; end if;

  if p_type = 'adjustment' then
    if p_quantity < 0 then raise exception 'Counted quantity cannot be negative.'; end if;
    change := round(p_quantity - b.quantity, 3);
    if change = 0 then raise exception 'That is already the current quantity.'; end if;
    after_qty := round(p_quantity, 3);
  else
    if p_quantity <= 0 then raise exception 'Quantity must be greater than zero.'; end if;
    if p_type = 'received' then
      if is_expired then raise exception 'This batch has expired. Add new stock as a new batch instead.'; end if;
      change := round(p_quantity, 3);
    else
      if p_type = 'sold' and is_expired then
        raise exception 'Expired stock cannot be sold. Use "Expired stock removed".';
      end if;
      if p_type = 'expired_removed' and not is_expired then
        raise exception 'This batch has not expired yet. Use "Damaged" or "Returned" instead.';
      end if;
      if p_quantity > b.quantity then
        raise exception 'Only % in stock - you cannot remove %.', trim_scale(b.quantity), trim_scale(p_quantity);
      end if;
      change := -round(p_quantity, 3);
    end if;
    after_qty := round(b.quantity + change, 3);
  end if;

  update public.batches set quantity = after_qty where id = b.id returning * into b;

  insert into public.stock_movements
    (shop_id, product_id, batch_id, product_name, batch_no, unit, type, qty_change, qty_after, unit_cost, unit_price, notes)
  values
    (b.shop_id, b.product_id, b.id, coalesce(prod.name, 'Unknown product'), b.batch_no, coalesce(prod.unit, ''),
     p_type, change, after_qty, b.purchase_price, b.selling_price, nullif(trim(coalesce(p_notes, '')), ''))
  returning * into m;

  return json_build_object('batch', row_to_json(b), 'movement', row_to_json(m));
end $$;

revoke all on function public.record_movement(uuid, text, numeric, text) from public, anon;
grant execute on function public.record_movement(uuid, text, numeric, text) to authenticated;
