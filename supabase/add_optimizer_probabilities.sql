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
