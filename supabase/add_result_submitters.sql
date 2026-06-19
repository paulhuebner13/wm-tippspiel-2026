alter table profiles
  add column if not exists can_submit_results boolean not null default false;

alter table matches
  add column if not exists provisional_home_score integer,
  add column if not exists provisional_away_score integer,
  add column if not exists provisional_winner_team_id uuid references teams(id) on delete set null,
  add column if not exists provisional_submitted_by_name text,
  add column if not exists provisional_updated_at timestamptz;
