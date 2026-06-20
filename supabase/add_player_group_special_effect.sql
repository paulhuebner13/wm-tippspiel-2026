alter table public.player_groups
  add column if not exists special_effect_active boolean not null default false;
