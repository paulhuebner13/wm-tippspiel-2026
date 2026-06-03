-- TEST 1: Spiel 1 ist noch 20 Minuten offen. Tipp soll möglich sein.
update matches
set kickoff_time = now() + interval '35 minutes',
    is_open_for_predictions = true,
    is_finished = false,
    home_score = null,
    away_score = null,
    winner_team_id = null
where match_number = 1;

-- TEST 2: Spiel 1 ist nur noch 10 Minuten entfernt. Tipp soll gesperrt sein.
update matches
set kickoff_time = now() + interval '10 minutes',
    is_open_for_predictions = true,
    is_finished = false
where match_number = 1;

-- TEST 3: Spiel 1 ist beendet. Ergebnis 2:1 eintragen.
update matches
set kickoff_time = now() - interval '2 hours',
    home_score = 2,
    away_score = 1,
    is_finished = true
where match_number = 1;

-- TEST 4: KO-Spiel 73 testweise öffnen und auf gleich starten setzen.
update matches
set kickoff_time = now() + interval '40 minutes',
    home_team_id = (select id from teams where name = 'Mexiko'),
    away_team_id = (select id from teams where name = 'Kanada'),
    home_placeholder = null,
    away_placeholder = null,
    is_open_for_predictions = true,
    is_finished = false,
    home_score = null,
    away_score = null,
    winner_team_id = null
where match_number = 73;

-- TEST 5: KO-Spiel 73 als Remis beenden, Kanada kommt weiter.
update matches
set kickoff_time = now() - interval '2 hours',
    home_score = 1,
    away_score = 1,
    winner_team_id = (select id from teams where name = 'Kanada'),
    is_finished = true
where match_number = 73;

-- RESET: Spiel 1 wieder auf ursprünglichen Termin setzen.
update matches
set kickoff_time = '2026-06-11 21:00:00+02',
    home_score = null,
    away_score = null,
    winner_team_id = null,
    is_finished = false,
    is_open_for_predictions = true
where match_number = 1;
