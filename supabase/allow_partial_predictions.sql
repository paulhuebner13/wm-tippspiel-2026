-- Allows automatic saving of partial predictions.
-- Existing users and existing complete predictions stay unchanged.

alter table predictions
  alter column predicted_home_score drop not null,
  alter column predicted_away_score drop not null;
