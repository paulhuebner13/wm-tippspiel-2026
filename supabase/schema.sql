create extension if not exists pgcrypto;

drop table if exists group_members cascade;
drop table if exists player_groups cascade;
drop table if exists tip_optimizer_inputs cascade;
drop table if exists team_ratings cascade;
drop table if exists predictions cascade;
drop table if exists matches cascade;
drop table if exists teams cascade;
drop table if exists profiles cascade;

create table profiles (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  short_name text not null,
  flag_path text not null,
  group_name text,
  created_at timestamptz not null default now()
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  match_number integer not null unique,
  stage text not null check (stage in ('group','round_of_32','round_of_16','quarter_final','semi_final','third_place','final')),
  group_name text,
  kickoff_time timestamptz not null,
  venue text not null,
  home_team_id uuid references teams(id),
  away_team_id uuid references teams(id),
  home_placeholder text,
  away_placeholder text,
  home_score integer,
  away_score integer,
  winner_team_id uuid references teams(id),
  is_finished boolean not null default false,
  is_open_for_predictions boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint match_has_home check (home_team_id is not null or home_placeholder is not null),
  constraint match_has_away check (away_team_id is not null or away_placeholder is not null)
);


create table team_ratings (
  team_id uuid primary key references teams(id) on delete cascade,
  fifa_points numeric not null,
  source text not null default 'FIFA live ranking 2026-06-11',
  updated_at timestamptz not null default now()
);

create table tip_optimizer_inputs (
  match_id uuid primary key references matches(id) on delete cascade,
  odds_text text not null default '',
  probabilities_text text not null default '',
  input_mode text not null default 'odds' check (input_mode in ('odds','probabilities')),
  max_goals integer not null default 7,
  ranking_weight numeric not null default 0.15,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tip_optimizer_settings (
  id integer primary key default 1 check (id = 1),
  source_blend_weight numeric not null default 0.5 check (source_blend_weight >= 0 and source_blend_weight <= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into tip_optimizer_settings (id, source_blend_weight)
values (1, 0.5)
on conflict (id) do nothing;

create table player_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table group_members (
  group_id uuid not null references player_groups(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, profile_id)
);

create table predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  match_id uuid not null references matches(id) on delete cascade,
  predicted_home_score integer check (predicted_home_score >= 0),
  predicted_away_score integer check (predicted_away_score >= 0),
  advance_team_id uuid references teams(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, match_id)
);

create index idx_group_members_group on group_members(group_id);
create index idx_group_members_profile on group_members(profile_id);
create index idx_matches_kickoff on matches(kickoff_time);
create index idx_tip_optimizer_updated on tip_optimizer_inputs(updated_at);
create index idx_predictions_user on predictions(user_id);
create index idx_predictions_match on predictions(match_id);
