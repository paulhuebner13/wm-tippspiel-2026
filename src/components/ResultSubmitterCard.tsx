'use client';

import { useEffect, useRef, useState } from 'react';
import { saveProvisionalResultInlineAction } from '@/app/actions';
import { Flag } from '@/components/Flag';
import { formatKickoff } from '@/lib/time';
import { getStageLabel, isKnockoutStage } from '@/lib/scoring';
import type { Match } from '@/lib/types';

function teamName(match: Match, side: 'home' | 'away') {
  if (side === 'home') return match.home_team?.name ?? match.home_placeholder ?? 'Offen';
  return match.away_team?.name ?? match.away_placeholder ?? 'Offen';
}

function scoreInputToNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

function canSubmitProvisional(match: Match, now: number) {
  if (isKnockoutStage(match.stage)) return false;
  if (match.home_score !== null && match.away_score !== null) return false;
  const openAt = new Date(new Date(match.kickoff_time).getTime() + 105 * 60 * 1000).getTime();
  if (Number.isNaN(openAt)) return false;
  return now >= openAt;
}

export function ResultSubmitterCard({ match, current = false }: { match: Match; current?: boolean }) {
  const officialHome = match.home_score;
  const officialAway = match.away_score;
  const hasOfficialResult = officialHome !== null && officialAway !== null;
  const initialHome = hasOfficialResult ? officialHome : match.provisional_home_score ?? null;
  const initialAway = hasOfficialResult ? officialAway : match.provisional_away_score ?? null;
  const initialWinner = hasOfficialResult ? match.winner_team_id ?? null : match.provisional_winner_team_id ?? null;

  const [homeScore, setHomeScore] = useState(initialHome?.toString() ?? '');
  const [awayScore, setAwayScore] = useState(initialAway?.toString() ?? '');
  const [winnerTeamId, setWinnerTeamId] = useState(initialWinner ?? '');
  const [savedHome, setSavedHome] = useState(initialHome);
  const [savedAway, setSavedAway] = useState(initialAway);
  const [savedWinner, setSavedWinner] = useState(initialWinner);
  const [saveState, setSaveState] = useState<'idle' | 'error'>('idle');
  const [now, setNow] = useState(0);
  const lastRequestKey = useRef('');

  const knockout = isKnockoutStage(match.stage);
  const editable = now > 0 && canSubmitProvisional(match, now);
  const homeNumber = scoreInputToNumber(homeScore);
  const awayNumber = scoreInputToNumber(awayScore);
  const homeEmpty = homeScore.trim() === '';
  const awayEmpty = awayScore.trim() === '';
  const bothScoresFilled = !homeEmpty && !awayEmpty && homeNumber !== null && awayNumber !== null;
  const showWinnerChoice = knockout && bothScoresFilled && homeNumber === awayNumber;
  const normalizedWinner = showWinnerChoice ? winnerTeamId || null : null;

  const matchesSaved =
    savedHome === (homeEmpty ? null : homeNumber) &&
    savedAway === (awayEmpty ? null : awayNumber) &&
    (savedWinner ?? null) === normalizedWinner;

  useEffect(() => {
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    setHomeScore(initialHome?.toString() ?? '');
    setAwayScore(initialAway?.toString() ?? '');
    setWinnerTeamId(initialWinner ?? '');
    setSavedHome(initialHome);
    setSavedAway(initialAway);
    setSavedWinner(initialWinner);
  }, [match.id, initialHome, initialAway, initialWinner]);

  useEffect(() => {
    if (!editable || matchesSaved) return;

    const requestHome = homeEmpty ? null : homeNumber;
    const requestAway = awayEmpty ? null : awayNumber;
    const requestWinner = normalizedWinner;
    const requestKey = `${match.id}:${requestHome ?? ''}:${requestAway ?? ''}:${requestWinner ?? ''}`;
    lastRequestKey.current = requestKey;

    const timeout = window.setTimeout(async () => {
      const result = await saveProvisionalResultInlineAction({
        matchId: match.id,
        homeScore: requestHome,
        awayScore: requestAway,
        winnerTeamId: requestWinner,
      });

      if (lastRequestKey.current !== requestKey) return;

      if (result.ok) {
        setSavedHome(requestHome);
        setSavedAway(requestAway);
        setSavedWinner(result.winnerTeamId ?? null);
        setSaveState('idle');
      } else {
        setSaveState('error');
      }
    }, 650);

    return () => window.clearTimeout(timeout);
  }, [awayEmpty, awayNumber, editable, homeEmpty, homeNumber, match.id, matchesSaved, normalizedWinner]);

  const hasProvisionalResult = !hasOfficialResult && savedHome !== null && savedAway !== null;
  const cardClass = hasOfficialResult
    ? 'adminResultSavedGreen'
    : hasProvisionalResult
      ? 'adminResultProvisionalPurple'
      : editable
        ? 'adminResultSubmitterOpenBlue'
        : 'adminResultUpcomingGrey';

  return (
    <article
      className={`card adminCard adminResultCard resultSubmitterCard ${cardClass}`}
      data-current-match={current ? 'true' : undefined}
    >
      <div className="matchHeader">
        <div>
          <div className="matchTitleLine">
            <span>Spiel {match.match_number}</span>
            <span>{match.stage === 'group' && match.group_name ? `Gruppe ${match.group_name}` : getStageLabel(match.stage)}</span>
          </div>
          <div className="kickoffLine">
            Spielbeginn: {formatKickoff(match.kickoff_time)}
          </div>
        </div>
      </div>

      <div className="resultAdminMain" aria-label="Resultat eintragen">
        <div className="predictionMainRow">
          <div className="predictionTeam predictionTeamHome">
            <span className="teamName">{teamName(match, 'home')}</span>
            <Flag team={match.home_team} />
          </div>

          <div className="scoreInputs resultScoreInputs">
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={homeScore}
              onChange={(event) => setHomeScore(event.target.value)}
              aria-label={`${teamName(match, 'home')} Tore`}
              disabled={!editable}
            />
            <span>:</span>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={awayScore}
              onChange={(event) => setAwayScore(event.target.value)}
              aria-label={`${teamName(match, 'away')} Tore`}
              disabled={!editable}
            />
          </div>

          <div className="predictionTeam predictionTeamAway">
            <Flag team={match.away_team} />
            <span className="teamName">{teamName(match, 'away')}</span>
          </div>
        </div>

        {showWinnerChoice && (
          <div className="advanceChoiceBox">
            <div className="advanceChoiceTitle">Wer kommt weiter?</div>
            <div className="advanceChoices">
              {match.home_team && (
                <label className={winnerTeamId === match.home_team.id ? 'advanceChoice selected' : 'advanceChoice'}>
                  <input
                    type="radio"
                    name={`winnerTeamId-${match.id}`}
                    value={match.home_team.id}
                    checked={winnerTeamId === match.home_team.id}
                    disabled={!editable}
                    onChange={(event) => setWinnerTeamId(event.target.value)}
                  />
                  <Flag team={match.home_team} />
                  <span>{teamName(match, 'home')}</span>
                </label>
              )}
              {match.away_team && (
                <label className={winnerTeamId === match.away_team.id ? 'advanceChoice selected' : 'advanceChoice'}>
                  <input
                    type="radio"
                    name={`winnerTeamId-${match.id}`}
                    value={match.away_team.id}
                    checked={winnerTeamId === match.away_team.id}
                    disabled={!editable}
                    onChange={(event) => setWinnerTeamId(event.target.value)}
                  />
                  <Flag team={match.away_team} />
                  <span>{teamName(match, 'away')}</span>
                </label>
              )}
            </div>
          </div>
        )}
      </div>
      {saveState === 'error' && <p className="errorBox compactError">Speichern fehlgeschlagen.</p>}
    </article>
  );
}
