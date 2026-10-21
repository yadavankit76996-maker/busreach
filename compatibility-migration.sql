-- Run this ONCE in Supabase SQL Editor because the tables were created
-- using the earlier setup instructions in this chat. This adds columns
-- the current website's admin dashboard expects. Safe to re-run.

alter table public.services
  add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.suggestions
  add column if not exists created_at timestamptz not null default now();

-- Keep the website's suggestion ordering aligned with existing timestamps.
update public.suggestions
set created_at = submitted_at
where submitted_at is not null;
