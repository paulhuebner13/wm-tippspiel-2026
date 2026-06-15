create table if not exists tip_optimizer_settings (
  id integer primary key default 1 check (id = 1),
  source_blend_weight numeric not null default 0.5 check (source_blend_weight >= 0 and source_blend_weight <= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into tip_optimizer_settings (id, source_blend_weight)
values (1, 0.5)
on conflict (id) do nothing;

alter table tip_optimizer_inputs
  add column if not exists probabilities_text text not null default '';
