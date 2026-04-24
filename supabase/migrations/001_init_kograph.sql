begin;

create extension if not exists pgcrypto;

-- =========================================================
-- ENUMS
-- =========================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('admin', 'operator');
  end if;

  if not exists (select 1 from pg_type where typname = 'subscription_status') then
    create type public.subscription_status as enum ('trial', 'active', 'expired', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'overlay_status') then
    create type public.overlay_status as enum ('draft', 'ready', 'archived');
  end if;

  if not exists (select 1 from pg_type where typname = 'session_status') then
    create type public.session_status as enum (
      'draft',
      'pending_payment',
      'paid',
      'processing',
      'completed',
      'failed',
      'expired'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_purpose') then
    create type public.payment_purpose as enum ('subscription', 'session');
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type public.payment_status as enum ('pending', 'completed', 'failed', 'expired', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'withdrawal_status') then
    create type public.withdrawal_status as enum ('pending', 'approved', 'rejected', 'paid');
  end if;
end $$;

-- =========================================================
-- TABLES (CREATE IF NOT EXISTS)
-- =========================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  brand_name text default 'KoGraph Studio Operator',
  role public.user_role not null default 'operator',
  avatar_url text,
  phone text,
  ads_last_shown_at timestamptz,
  trial_started_at timestamptz not null default timezone('utc', now()),
  trial_ends_at timestamptz not null default (timezone('utc', now()) + interval '3 days'),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_code text not null default 'starter_trial',
  status public.subscription_status not null default 'trial',
  started_at timestamptz not null default timezone('utc', now()),
  subscription_end timestamptz not null default (timezone('utc', now()) + interval '3 days'),
  amount_paid bigint not null default 0,
  pakasir_order_id text unique,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  balance bigint not null default 0,
  pending_withdrawal bigint not null default 0,
  total_credited bigint not null default 0,
  total_withdrawn bigint not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.overlays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled Overlay',
  description text,
  bucket_id text,
  object_path text,
  preview_path text,
  status public.overlay_status not null default 'ready',
  is_active boolean not null default true,
  frame_count smallint not null default 3,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  booth_id text not null default 'default-booth',
  overlay_id uuid references public.overlays(id) on delete set null,
  status public.session_status not null default 'draft',
  photo_count smallint not null default 3,
  photo_1_path text,
  photo_2_path text,
  photo_3_path text,
  composite_bucket_id text,
  composite_path text,
  deep_link_code text unique,
  gross_amount bigint not null default 10000,
  platform_fee bigint not null default 1000,
  net_amount bigint not null default 9000,
  started_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.pakasir_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  order_id text not null unique,
  purpose public.payment_purpose not null,
  amount bigint not null default 0,
  platform_fee bigint not null default 0,
  status public.payment_status not null default 'pending',
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount bigint not null,
  bank_name text,
  account_name text,
  account_number text,
  notes text,
  status public.withdrawal_status not null default 'pending',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.app_settings(key, value)
values (
  'platform',
  jsonb_build_object(
    'kill_switch', false,
    'ads_interval_days', 3,
    'session_price', 10000,
    'platform_fee', 1000
  )
)
on conflict (key) do nothing;

-- =========================================================
-- PATCH COLUMNS IF TABLE SUDAH ADA
-- =========================================================

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists brand_name text default 'KoGraph Studio Operator';
alter table public.profiles add column if not exists role public.user_role default 'operator';
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists ads_last_shown_at timestamptz;
alter table public.profiles add column if not exists trial_started_at timestamptz default timezone('utc', now());
alter table public.profiles add column if not exists trial_ends_at timestamptz default (timezone('utc', now()) + interval '3 days');
alter table public.profiles add column if not exists created_at timestamptz default timezone('utc', now());
alter table public.profiles add column if not exists updated_at timestamptz default timezone('utc', now());

alter table public.subscriptions add column if not exists plan_code text default 'starter_trial';
alter table public.subscriptions add column if not exists status public.subscription_status default 'trial';
alter table public.subscriptions add column if not exists started_at timestamptz default timezone('utc', now());
alter table public.subscriptions add column if not exists subscription_end timestamptz default (timezone('utc', now()) + interval '3 days');
alter table public.subscriptions add column if not exists amount_paid bigint default 0;
alter table public.subscriptions add column if not exists pakasir_order_id text;
alter table public.subscriptions add column if not exists notes text;
alter table public.subscriptions add column if not exists created_at timestamptz default timezone('utc', now());
alter table public.subscriptions add column if not exists updated_at timestamptz default timezone('utc', now());

alter table public.wallets add column if not exists balance bigint default 0;
alter table public.wallets add column if not exists pending_withdrawal bigint default 0;
alter table public.wallets add column if not exists total_credited bigint default 0;
alter table public.wallets add column if not exists total_withdrawn bigint default 0;
alter table public.wallets add column if not exists created_at timestamptz default timezone('utc', now());
alter table public.wallets add column if not exists updated_at timestamptz default timezone('utc', now());

alter table public.overlays add column if not exists title text default 'Untitled Overlay';
alter table public.overlays add column if not exists description text;
alter table public.overlays add column if not exists bucket_id text;
alter table public.overlays add column if not exists object_path text;
alter table public.overlays add column if not exists preview_path text;
alter table public.overlays add column if not exists status public.overlay_status default 'ready';
alter table public.overlays add column if not exists is_active boolean default true;
alter table public.overlays add column if not exists frame_count smallint default 3;
alter table public.overlays add column if not exists created_at timestamptz default timezone('utc', now());
alter table public.overlays add column if not exists updated_at timestamptz default timezone('utc', now());

alter table public.sessions add column if not exists booth_id text default 'default-booth';
alter table public.sessions add column if not exists overlay_id uuid;
alter table public.sessions add column if not exists status public.session_status default 'draft';
alter table public.sessions add column if not exists photo_count smallint default 3;
alter table public.sessions add column if not exists photo_1_path text;
alter table public.sessions add column if not exists photo_2_path text;
alter table public.sessions add column if not exists photo_3_path text;
alter table public.sessions add column if not exists composite_bucket_id text;
alter table public.sessions add column if not exists composite_path text;
alter table public.sessions add column if not exists deep_link_code text;
alter table public.sessions add column if not exists gross_amount bigint default 10000;
alter table public.sessions add column if not exists platform_fee bigint default 1000;
alter table public.sessions add column if not exists net_amount bigint default 9000;
alter table public.sessions add column if not exists started_at timestamptz default timezone('utc', now());
alter table public.sessions add column if not exists completed_at timestamptz;
alter table public.sessions add column if not exists expires_at timestamptz;
alter table public.sessions add column if not exists created_at timestamptz default timezone('utc', now());
alter table public.sessions add column if not exists updated_at timestamptz default timezone('utc', now());

alter table public.pakasir_orders add column if not exists session_id uuid;
alter table public.pakasir_orders add column if not exists purpose public.payment_purpose default 'subscription';
alter table public.pakasir_orders add column if not exists amount bigint default 0;
alter table public.pakasir_orders add column if not exists platform_fee bigint default 0;
alter table public.pakasir_orders add column if not exists status public.payment_status default 'pending';
alter table public.pakasir_orders add column if not exists raw_payload jsonb default '{}'::jsonb;
alter table public.pakasir_orders add column if not exists created_at timestamptz default timezone('utc', now());
alter table public.pakasir_orders add column if not exists updated_at timestamptz default timezone('utc', now());

alter table public.withdrawals add column if not exists bank_name text;
alter table public.withdrawals add column if not exists account_name text;
alter table public.withdrawals add column if not exists account_number text;
alter table public.withdrawals add column if not exists notes text;
alter table public.withdrawals add column if not exists status public.withdrawal_status default 'pending';
alter table public.withdrawals add column if not exists reviewed_by uuid;
alter table public.withdrawals add column if not exists reviewed_at timestamptz;
alter table public.withdrawals add column if not exists created_at timestamptz default timezone('utc', now());
alter table public.withdrawals add column if not exists updated_at timestamptz default timezone('utc', now());

-- =========================================================
-- DEFAULT DATA CLEANUP
-- =========================================================
update public.profiles
set
  brand_name = coalesce(brand_name, 'KoGraph Studio Operator'),
  role = coalesce(role, 'operator'::public.user_role),
  trial_started_at = coalesce(trial_started_at, timezone('utc', now())),
  trial_ends_at = coalesce(trial_ends_at, timezone('utc', now()) + interval '3 days'),
  created_at = coalesce(created_at, timezone('utc', now())),
  updated_at = coalesce(updated_at, timezone('utc', now()));

update public.subscriptions
set
  plan_code = coalesce(plan_code, 'starter_trial'),
  status = coalesce(status, 'trial'::public.subscription_status),
  started_at = coalesce(started_at, timezone('utc', now())),
  subscription_end = coalesce(subscription_end, timezone('utc', now()) + interval '3 days'),
  amount_paid = coalesce(amount_paid, 0),
  created_at = coalesce(created_at, timezone('utc', now())),
  updated_at = coalesce(updated_at, timezone('utc', now()));

update public.wallets
set
  balance = coalesce(balance, 0),
  pending_withdrawal = coalesce(pending_withdrawal, 0),
  total_credited = coalesce(total_credited, 0),
  total_withdrawn = coalesce(total_withdrawn, 0),
  created_at = coalesce(created_at, timezone('utc', now())),
  updated_at = coalesce(updated_at, timezone('utc', now()));

update public.overlays
set
  title = coalesce(title, 'Untitled Overlay'),
  status = coalesce(status, 'ready'::public.overlay_status),
  is_active = coalesce(is_active, true),
  frame_count = coalesce(frame_count, 3),
  created_at = coalesce(created_at, timezone('utc', now())),
  updated_at = coalesce(updated_at, timezone('utc', now()));

update public.sessions
set
  booth_id = coalesce(booth_id, 'default-booth'),
  status = coalesce(status, 'draft'::public.session_status),
  photo_count = coalesce(photo_count, 3),
  gross_amount = coalesce(gross_amount, 10000),
  platform_fee = coalesce(platform_fee, 1000),
  net_amount = coalesce(net_amount, coalesce(gross_amount, 10000) - coalesce(platform_fee, 1000)),
  started_at = coalesce(started_at, timezone('utc', now())),
  created_at = coalesce(created_at, timezone('utc', now())),
  updated_at = coalesce(updated_at, timezone('utc', now()));

update public.pakasir_orders
set
  purpose = coalesce(purpose, 'subscription'::public.payment_purpose),
  amount = coalesce(amount, 0),
  platform_fee = coalesce(platform_fee, 0),
  status = coalesce(status, 'pending'::public.payment_status),
  raw_payload = coalesce(raw_payload, '{}'::jsonb),
  created_at = coalesce(created_at, timezone('utc', now())),
  updated_at = coalesce(updated_at, timezone('utc', now()));

update public.withdrawals
set
  status = coalesce(status, 'pending'::public.withdrawal_status),
  created_at = coalesce(created_at, timezone('utc', now())),
  updated_at = coalesce(updated_at, timezone('utc', now()));

-- =========================================================
-- INDEXES
-- =========================================================
create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_subscriptions_user_id on public.subscriptions(user_id);
create index if not exists idx_subscriptions_status on public.subscriptions(status);
create index if not exists idx_subscriptions_end on public.subscriptions(subscription_end desc);
create unique index if not exists idx_wallets_user_id on public.wallets(user_id);
create index if not exists idx_overlays_user_id on public.overlays(user_id);
create index if not exists idx_sessions_user_id on public.sessions(user_id);
create index if not exists idx_sessions_status on public.sessions(status);
create unique index if not exists idx_sessions_deep_link_code on public.sessions(deep_link_code);
create index if not exists idx_pakasir_orders_user_id on public.pakasir_orders(user_id);
create unique index if not exists idx_pakasir_orders_order_id on public.pakasir_orders(order_id);
create index if not exists idx_withdrawals_user_id on public.withdrawals(user_id);

-- =========================================================
-- GENERIC UPDATED_AT TRIGGER
-- =========================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_subscriptions_updated_at on public.subscriptions;
create trigger trg_subscriptions_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();

drop trigger if exists trg_wallets_updated_at on public.wallets;
create trigger trg_wallets_updated_at
before update on public.wallets
for each row execute function public.set_updated_at();

drop trigger if exists trg_overlays_updated_at on public.overlays;
create trigger trg_overlays_updated_at
before update on public.overlays
for each row execute function public.set_updated_at();

drop trigger if exists trg_sessions_updated_at on public.sessions;
create trigger trg_sessions_updated_at
before update on public.sessions
for each row execute function public.set_updated_at();

drop trigger if exists trg_pakasir_orders_updated_at on public.pakasir_orders;
create trigger trg_pakasir_orders_updated_at
before update on public.pakasir_orders
for each row execute function public.set_updated_at();

drop trigger if exists trg_withdrawals_updated_at on public.withdrawals;
create trigger trg_withdrawals_updated_at
before update on public.withdrawals
for each row execute function public.set_updated_at();

drop trigger if exists trg_app_settings_updated_at on public.app_settings;
create trigger trg_app_settings_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

-- =========================================================
-- HELPER FUNCTIONS (SETELAH TABLE SUDAH ADA)
-- =========================================================
create or replace function public.bucket_id_for_user(target_user uuid default auth.uid())
returns text
language sql
stable
as $$
  select 'operator-' || replace(target_user::text, '-', '');
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$$;

create or replace function public.current_server_time_utc()
returns timestamptz
language sql
stable
as $$
  select timezone('utc', now());
$$;

create or replace function public.current_active_subscription_end(target_user uuid default auth.uid())
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select max(s.subscription_end)
  from public.subscriptions s
  where s.user_id = target_user
    and s.status in ('trial', 'active')
    and s.subscription_end > timezone('utc', now());
$$;

create or replace function public.can_use_booth(target_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.user_id = target_user
      and s.status in ('trial', 'active')
      and s.subscription_end > timezone('utc', now())
  );
$$;

create or replace function public.ensure_user_bucket(target_user uuid)
returns text
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  v_bucket text;
begin
  v_bucket := public.bucket_id_for_user(target_user);

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    v_bucket,
    v_bucket,
    false,
    52428800,
    array['image/png', 'image/jpeg', 'image/webp']
  )
  on conflict (id) do nothing;

  return v_bucket;
end;
$$;

-- =========================================================
-- AUTH SYNC TRIGGER
-- =========================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth, storage
as $$
declare
  v_role public.user_role;
  v_full_name text;
begin
  v_role := case
    when coalesce(new.raw_user_meta_data ->> 'role', 'operator') = 'admin'
      then 'admin'::public.user_role
    else 'operator'::public.user_role
  end;

  v_full_name := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (
    id,
    email,
    full_name,
    brand_name,
    role,
    trial_started_at,
    trial_ends_at,
    created_at,
    updated_at
  )
  values (
    new.id,
    new.email,
    v_full_name,
    'KoGraph Studio Operator',
    v_role,
    timezone('utc', now()),
    timezone('utc', now()) + interval '3 days',
    timezone('utc', now()),
    timezone('utc', now())
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    role = excluded.role,
    updated_at = timezone('utc', now());

  insert into public.wallets (
    user_id,
    balance,
    pending_withdrawal,
    total_credited,
    total_withdrawn,
    created_at,
    updated_at
  )
  values (
    new.id,
    0,
    0,
    0,
    0,
    timezone('utc', now()),
    timezone('utc', now())
  )
  on conflict (user_id) do nothing;

  insert into public.subscriptions (
    user_id,
    plan_code,
    status,
    started_at,
    subscription_end,
    amount_paid,
    notes,
    created_at,
    updated_at
  )
  values (
    new.id,
    'starter_trial',
    'trial',
    timezone('utc', now()),
    timezone('utc', now()) + interval '3 days',
    0,
    'Auto trial on signup',
    timezone('utc', now()),
    timezone('utc', now())
  )
  on conflict do nothing;

  perform public.ensure_user_bucket(new.id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- =========================================================
-- BACKFILL USER LAMA
-- =========================================================

insert into public.profiles (
  id,
  email,
  full_name,
  brand_name,
  role,
  trial_started_at,
  trial_ends_at,
  created_at,
  updated_at
)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1)),
  'KoGraph Studio Operator',
  case
    when coalesce(u.raw_user_meta_data ->> 'role', 'operator') = 'admin'
      then 'admin'::public.user_role
    else 'operator'::public.user_role
  end,
  timezone('utc', now()),
  timezone('utc', now()) + interval '3 days',
  timezone('utc', now()),
  timezone('utc', now())
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

insert into public.wallets (
  user_id,
  balance,
  pending_withdrawal,
  total_credited,
  total_withdrawn,
  created_at,
  updated_at
)
select
  u.id,
  0,
  0,
  0,
  0,
  timezone('utc', now()),
  timezone('utc', now())
from auth.users u
left join public.wallets w on w.user_id = u.id
where w.user_id is null;

insert into public.subscriptions (
  user_id,
  plan_code,
  status,
  started_at,
  subscription_end,
  amount_paid,
  notes,
  created_at,
  updated_at
)
select
  u.id,
  'starter_trial',
  'trial',
  timezone('utc', now()),
  timezone('utc', now()) + interval '3 days',
  0,
  'Backfilled trial',
  timezone('utc', now()),
  timezone('utc', now())
from auth.users u
left join public.subscriptions s
  on s.user_id = u.id
 and s.status in ('trial', 'active')
where s.id is null;

do $$
declare
  r record;
begin
  for r in select id from auth.users loop
    perform public.ensure_user_bucket(r.id);
  end loop;
end $$;

-- =========================================================
-- SESSION SETTLEMENT / WALLET CREDIT
-- =========================================================
create or replace function public.settle_paid_session(input_session_id uuid)
returns public.sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.sessions%rowtype;
begin
  select *
  into v_session
  from public.sessions
  where id = input_session_id
  for update;

  if not found then
    raise exception 'Session not found: %', input_session_id;
  end if;

  if v_session.status = 'completed' then
    return v_session;
  end if;

  update public.sessions
  set
    status = 'completed',
    net_amount = coalesce(gross_amount, 10000) - coalesce(platform_fee, 1000),
    completed_at = coalesce(completed_at, timezone('utc', now())),
    updated_at = timezone('utc', now())
  where id = input_session_id
  returning * into v_session;

  insert into public.wallets (
    user_id,
    balance,
    total_credited,
    created_at,
    updated_at
  )
  values (
    v_session.user_id,
    v_session.net_amount,
    v_session.net_amount,
    timezone('utc', now()),
    timezone('utc', now())
  )
  on conflict (user_id)
  do update set
    balance = public.wallets.balance + excluded.balance,
    total_credited = public.wallets.total_credited + excluded.total_credited,
    updated_at = timezone('utc', now());

  return v_session;
end;
$$;

-- =========================================================
-- ENABLE RLS
-- =========================================================
alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.wallets enable row level security;
alter table public.overlays enable row level security;
alter table public.sessions enable row level security;
alter table public.pakasir_orders enable row level security;
alter table public.withdrawals enable row level security;
alter table public.app_settings enable row level security;

-- =========================================================
-- DROP OLD POLICIES
-- =========================================================
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists "profiles_update_own_or_admin" on public.profiles;
drop policy if exists "profiles_insert_self_or_admin" on public.profiles;

drop policy if exists "subscriptions_select_own_or_admin" on public.subscriptions;
drop policy if exists "subscriptions_admin_insert" on public.subscriptions;
drop policy if exists "subscriptions_admin_update" on public.subscriptions;
drop policy if exists "subscriptions_admin_delete" on public.subscriptions;

drop policy if exists "wallets_select_own_or_admin" on public.wallets;
drop policy if exists "wallets_admin_update_only" on public.wallets;
drop policy if exists "wallets_admin_insert_only" on public.wallets;

drop policy if exists "overlays_select_own_or_admin" on public.overlays;
drop policy if exists "overlays_insert_own_or_admin" on public.overlays;
drop policy if exists "overlays_update_own_or_admin" on public.overlays;
drop policy if exists "overlays_delete_own_or_admin" on public.overlays;

drop policy if exists "sessions_select_own_or_admin" on public.sessions;
drop policy if exists "sessions_insert_own_or_admin" on public.sessions;
drop policy if exists "sessions_update_own_or_admin" on public.sessions;
drop policy if exists "sessions_delete_admin_only" on public.sessions;

drop policy if exists "pakasir_orders_select_own_or_admin" on public.pakasir_orders;
drop policy if exists "pakasir_orders_admin_update_only" on public.pakasir_orders;
drop policy if exists "pakasir_orders_admin_insert_only" on public.pakasir_orders;

drop policy if exists "withdrawals_select_own_or_admin" on public.withdrawals;
drop policy if exists "withdrawals_insert_own_only" on public.withdrawals;
drop policy if exists "withdrawals_update_admin_only" on public.withdrawals;
drop policy if exists "withdrawals_delete_admin_only" on public.withdrawals;

drop policy if exists "app_settings_admin_select" on public.app_settings;
drop policy if exists "app_settings_admin_update" on public.app_settings;
drop policy if exists "app_settings_admin_insert" on public.app_settings;

-- =========================================================
-- CREATE POLICIES
-- =========================================================

create policy "profiles_select_own_or_admin"
on public.profiles
for select
to authenticated
using (auth.uid() = id or public.is_admin());

create policy "profiles_update_own_or_admin"
on public.profiles
for update
to authenticated
using (auth.uid() = id or public.is_admin())
with check (auth.uid() = id or public.is_admin());

create policy "profiles_insert_self_or_admin"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id or public.is_admin());

create policy "subscriptions_select_own_or_admin"
on public.subscriptions
for select
to authenticated
using (auth.uid() = user_id or public.is_admin());

create policy "subscriptions_admin_insert"
on public.subscriptions
for insert
to authenticated
with check (public.is_admin());

create policy "subscriptions_admin_update"
on public.subscriptions
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "subscriptions_admin_delete"
on public.subscriptions
for delete
to authenticated
using (public.is_admin());

create policy "wallets_select_own_or_admin"
on public.wallets
for select
to authenticated
using (auth.uid() = user_id or public.is_admin());

create policy "wallets_admin_update_only"
on public.wallets
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "wallets_admin_insert_only"
on public.wallets
for insert
to authenticated
with check (public.is_admin());

create policy "overlays_select_own_or_admin"
on public.overlays
for select
to authenticated
using (auth.uid() = user_id or public.is_admin());

create policy "overlays_insert_own_or_admin"
on public.overlays
for insert
to authenticated
with check (
  (auth.uid() = user_id and bucket_id = public.bucket_id_for_user(auth.uid()))
  or public.is_admin()
);

create policy "overlays_update_own_or_admin"
on public.overlays
for update
to authenticated
using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());

create policy "overlays_delete_own_or_admin"
on public.overlays
for delete
to authenticated
using (auth.uid() = user_id or public.is_admin());

create policy "sessions_select_own_or_admin"
on public.sessions
for select
to authenticated
using (auth.uid() = user_id or public.is_admin());

create policy "sessions_insert_own_or_admin"
on public.sessions
for insert
to authenticated
with check (auth.uid() = user_id or public.is_admin());

create policy "sessions_update_own_or_admin"
on public.sessions
for update
to authenticated
using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());

create policy "sessions_delete_admin_only"
on public.sessions
for delete
to authenticated
using (public.is_admin());

create policy "pakasir_orders_select_own_or_admin"
on public.pakasir_orders
for select
to authenticated
using (auth.uid() = user_id or public.is_admin());

create policy "pakasir_orders_admin_update_only"
on public.pakasir_orders
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "pakasir_orders_admin_insert_only"
on public.pakasir_orders
for insert
to authenticated
with check (public.is_admin());

create policy "withdrawals_select_own_or_admin"
on public.withdrawals
for select
to authenticated
using (auth.uid() = user_id or public.is_admin());

create policy "withdrawals_insert_own_only"
on public.withdrawals
for insert
to authenticated
with check (
  auth.uid() = user_id
  and amount >= 15000
);

create policy "withdrawals_update_admin_only"
on public.withdrawals
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "withdrawals_delete_admin_only"
on public.withdrawals
for delete
to authenticated
using (public.is_admin());

create policy "app_settings_admin_select"
on public.app_settings
for select
to authenticated
using (public.is_admin());

create policy "app_settings_admin_update"
on public.app_settings
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "app_settings_admin_insert"
on public.app_settings
for insert
to authenticated
with check (public.is_admin());

-- =========================================================
-- STORAGE POLICIES
-- =========================================================

drop policy if exists "objects_select_own_bucket_or_admin" on storage.objects;
drop policy if exists "objects_insert_own_bucket_or_admin" on storage.objects;
drop policy if exists "objects_update_own_bucket_or_admin" on storage.objects;
drop policy if exists "objects_delete_own_bucket_or_admin" on storage.objects;

create policy "objects_select_own_bucket_or_admin"
on storage.objects
for select
to authenticated
using (
  bucket_id = public.bucket_id_for_user(auth.uid())
  or public.is_admin()
);

create policy "objects_insert_own_bucket_or_admin"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = public.bucket_id_for_user(auth.uid())
  or public.is_admin()
);

create policy "objects_update_own_bucket_or_admin"
on storage.objects
for update
to authenticated
using (
  bucket_id = public.bucket_id_for_user(auth.uid())
  or public.is_admin()
)
with check (
  bucket_id = public.bucket_id_for_user(auth.uid())
  or public.is_admin()
);

create policy "objects_delete_own_bucket_or_admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = public.bucket_id_for_user(auth.uid())
  or public.is_admin()
);

commit;

-- =========================================================
-- OPTIONAL: JADIKAN USER ADMIN
-- =========================================================
-- update public.profiles
-- set role = 'admin'
-- where id = 'UUID-USER-KAMU'::uuid;