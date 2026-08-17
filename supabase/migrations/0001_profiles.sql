-- 0001_profiles.sql
-- User display identity (product). No seed data.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  locale text not null default 'en',
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Product: signed-in user display identity.';

alter table public.profiles enable row level security;

create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);

create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id);

create policy profiles_insert_own on public.profiles
  for insert with check (auth.uid() = id);

grant select, insert, update on table public.profiles to authenticated;
revoke all on table public.profiles from anon;
