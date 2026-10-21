-- BusReach database setup. Run in Supabase SQL Editor.
-- Public visitors can read published stops/timings and submit suggestions.
-- Only user IDs in admin_users can manage public records.
create extension if not exists pgcrypto;

create table if not exists public.busreach_admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.bus_stops (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 160),
  address text not null check (length(trim(address)) between 1 and 500),
  area text not null check (length(trim(area)) between 1 and 120),
  landmark text,
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  photo_url text,
  accessibility_notes text,
  verification_status text not null default 'Needs recheck' check (verification_status in ('Needs recheck','Field verified','Contact verified','Field and contact verified')),
  verification_notes text not null default '',
  survey_date date,
  published boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitude is null and longitude is null) or (latitude is not null and longitude is not null))
);

create table if not exists public.bus_timings (
  id uuid primary key default gen_random_uuid(),
  stop_id uuid not null references public.bus_stops(id) on delete cascade,
  route_number text not null,
  destination text not null,
  scheduled_time time not null,
  service_days text not null default 'Daily',
  timing_type text not null default 'Scheduled' check (timing_type in ('Scheduled','Live estimate')),
  source text not null default 'Not recorded',
  last_verified date,
  notes text,
  published boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.bus_stop_suggestions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 160),
  address text not null check (length(trim(address)) between 1 and 500),
  area text not null check (length(trim(area)) between 1 and 120),
  landmark text,
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  photo_url text,
  accessibility_notes text,
  source_details text not null check (length(trim(source_details)) between 1 and 1000),
  notes text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check ((latitude is null and longitude is null) or (latitude is not null and longitude is not null))
);

create or replace function public.is_busreach_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.busreach_admin_users where user_id = auth.uid());
$$;
revoke all on function public.is_busreach_admin() from public;
grant execute on function public.is_busreach_admin() to anon, authenticated;

grant select on public.bus_stops, public.bus_timings to anon, authenticated;
grant insert, update, delete on public.bus_stops, public.bus_timings to authenticated;
grant insert on public.bus_stop_suggestions to anon, authenticated;
grant select, update, delete on public.bus_stop_suggestions to authenticated;
grant select on public.busreach_admin_users to authenticated;

alter table public.busreach_admin_users enable row level security;
alter table public.bus_stops enable row level security;
alter table public.bus_timings enable row level security;
alter table public.bus_stop_suggestions enable row level security;

drop policy if exists "admins can read own admin record" on public.busreach_admin_users;
create policy "admins can read own admin record" on public.busreach_admin_users for select to authenticated using (user_id = auth.uid());
drop policy if exists "public reads published bus stops and admins read all" on public.bus_stops;
create policy "public reads published bus stops and admins read all" on public.bus_stops for select to anon, authenticated using (published = true or public.is_busreach_admin());
drop policy if exists "admins insert bus stops" on public.bus_stops;
create policy "admins insert bus stops" on public.bus_stops for insert to authenticated with check (public.is_busreach_admin());
drop policy if exists "admins update bus stops" on public.bus_stops;
create policy "admins update bus stops" on public.bus_stops for update to authenticated using (public.is_busreach_admin()) with check (public.is_busreach_admin());
drop policy if exists "admins delete bus stops" on public.bus_stops;
create policy "admins delete bus stops" on public.bus_stops for delete to authenticated using (public.is_busreach_admin());

drop policy if exists "public reads published bus timings and admins read all" on public.bus_timings;
create policy "public reads published bus timings and admins read all" on public.bus_timings for select to anon, authenticated using (published = true or public.is_busreach_admin());
drop policy if exists "admins insert bus timings" on public.bus_timings;
create policy "admins insert bus timings" on public.bus_timings for insert to authenticated with check (public.is_busreach_admin());
drop policy if exists "admins update bus timings" on public.bus_timings;
create policy "admins update bus timings" on public.bus_timings for update to authenticated using (public.is_busreach_admin()) with check (public.is_busreach_admin());
drop policy if exists "admins delete bus timings" on public.bus_timings;
create policy "admins delete bus timings" on public.bus_timings for delete to authenticated using (public.is_busreach_admin());

drop policy if exists "public submits pending bus stop suggestions" on public.bus_stop_suggestions;
create policy "public submits pending bus stop suggestions" on public.bus_stop_suggestions for insert to anon, authenticated with check (status = 'pending' and reviewed_at is null and reviewed_by is null);
drop policy if exists "admins read bus stop suggestions" on public.bus_stop_suggestions;
create policy "admins read bus stop suggestions" on public.bus_stop_suggestions for select to authenticated using (public.is_busreach_admin());
drop policy if exists "admins review bus stop suggestions" on public.bus_stop_suggestions;
create policy "admins review bus stop suggestions" on public.bus_stop_suggestions for update to authenticated using (public.is_busreach_admin()) with check (public.is_busreach_admin());
drop policy if exists "admins delete bus stop suggestions" on public.bus_stop_suggestions;
create policy "admins delete bus stop suggestions" on public.bus_stop_suggestions for delete to authenticated using (public.is_busreach_admin());

-- Public image bucket for project photos. Upload only non-sensitive location photos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bus-stop-photos', 'bus-stop-photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists "Public can view BusReach photos" on storage.objects;
create policy "Public can view BusReach photos" on storage.objects for select to anon, authenticated using (bucket_id = 'bus-stop-photos');
drop policy if exists "Authenticated admins upload BusReach photos" on storage.objects;
create policy "Authenticated admins upload BusReach photos" on storage.objects for insert to authenticated with check (bucket_id = 'bus-stop-photos' and public.is_busreach_admin());
drop policy if exists "Authenticated admins update BusReach photos" on storage.objects;
create policy "Authenticated admins update BusReach photos" on storage.objects for update to authenticated using (bucket_id = 'bus-stop-photos' and public.is_busreach_admin()) with check (bucket_id = 'bus-stop-photos' and public.is_busreach_admin());
