create table if not exists public.special_effect_groups (
  group_name text primary key,
  active boolean not null default false,
  updated_at timestamptz not null default now()
);
