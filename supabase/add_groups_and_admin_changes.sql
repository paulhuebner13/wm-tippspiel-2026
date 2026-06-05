create table if not exists player_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists group_members (
  group_id uuid not null references player_groups(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, profile_id)
);

create index if not exists idx_group_members_group on group_members(group_id);
create index if not exists idx_group_members_profile on group_members(profile_id);
