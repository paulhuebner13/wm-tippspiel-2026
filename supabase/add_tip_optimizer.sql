create table if not exists tip_optimizer_inputs (
  match_id uuid primary key references matches(id) on delete cascade,
  odds_text text not null default '',
  probabilities_text text not null default '',
  input_mode text not null default 'odds' check (input_mode in ('odds','probabilities')),
  max_goals integer not null default 7,
  ranking_weight numeric not null default 0.15,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table tip_optimizer_inputs
  add column if not exists probabilities_text text not null default '',
  add column if not exists input_mode text not null default 'odds';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tip_optimizer_inputs_input_mode_check'
  ) then
    alter table tip_optimizer_inputs
      add constraint tip_optimizer_inputs_input_mode_check
      check (input_mode in ('odds','probabilities'));
  end if;
end $$;

create table if not exists team_ratings (
  team_id uuid primary key references teams(id) on delete cascade,
  fifa_points numeric not null,
  source text not null default 'FIFA live ranking 2026-06-11',
  updated_at timestamptz not null default now()
);

create table if not exists tip_optimizer_settings (
  id integer primary key default 1 check (id = 1),
  source_blend_weight numeric not null default 0.5 check (source_blend_weight >= 0 and source_blend_weight <= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into tip_optimizer_settings (id, source_blend_weight)
values (1, 0.5)
on conflict (id) do nothing;

insert into team_ratings (team_id, fifa_points)
select id, points
from (
  values
    ('Argentinien', 1877.27),
    ('Spanien', 1874.71),
    ('Frankreich', 1870.70),
    ('England', 1828.02),
    ('Portugal', 1767.85),
    ('Brasilien', 1765.34),
    ('Marokko', 1755.62),
    ('Niederlande', 1753.57),
    ('Deutschland', 1743.54),
    ('Belgien', 1742.24),
    ('Kroatien', 1714.87),
    ('Mexiko', 1700.98),
    ('Kolumbien', 1698.35),
    ('USA', 1688.53),
    ('Senegal', 1684.07),
    ('Uruguay', 1673.07),
    ('Japan', 1661.58),
    ('Schweiz', 1640.92),
    ('IR Iran', 1619.58),
    ('Republik Korea', 1612.55),
    ('Australien', 1605.61),
    ('Ecuador', 1598.52),
    ('Österreich', 1597.40),
    ('Türkei', 1579.47),
    ('Algerien', 1571.03),
    ('Ägypten', 1562.37),
    ('Norwegen', 1557.44),
    ('Kanada', 1551.50),
    ('Elfenbeinküste', 1540.87),
    ('Panama', 1539.16),
    ('Schottland', 1518.77),
    ('Schweden', 1509.79),
    ('Paraguay', 1488.05),
    ('Tschechien', 1484.82),
    ('Tunesien', 1476.41),
    ('DR Kongo', 1474.43),
    ('Katar', 1459.45),
    ('Usbekistan', 1458.73),
    ('Irak', 1446.28),
    ('Saudi-Arabien', 1423.88),
    ('Südafrika', 1414.88),
    ('Bosnien und Herzegowina', 1395.19),
    ('Jordanien', 1387.74),
    ('Kap Verde', 1371.11),
    ('Ghana', 1346.88),
    ('Curaçao', 1287.00),
    ('Haiti', 1277.67),
    ('Neuseeland', 1275.58)
) as ranking(team_name, points)
join teams on teams.name = ranking.team_name
on conflict (team_id) do update set
  fifa_points = excluded.fifa_points,
  updated_at = now();
