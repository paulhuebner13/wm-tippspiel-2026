'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { saveResultInlineAction, updateKnockoutTeamsAction } from '@/app/actions';
import { Flag } from '@/components/Flag';
import { formatKickoff } from '@/lib/time';
import { getStageLabel, isKnockoutStage } from '@/lib/scoring';
import type { Match, Team } from '@/lib/types';

type ResultSaveStatus = 'upcoming' | 'expectedMissing' | 'dirty' | 'saved';

function teamName(match: Match, side: 'home' | 'away'): string {
  if (side === 'home') return match.home_team?.name ?? match.home_placeholder ?? 'Offen';
  return match.away_team?.name ?? match.away_placeholder ?? 'Offen';
}

function scoreInputToNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

function statusClass(status: ResultSaveStatus) {
  if (status === 'saved') return 'adminResultSavedGreen';
  if (status === 'dirty') return 'adminResultDirtyYellow';
  if (status === 'expectedMissing') return 'adminResultExpectedMissingRed';
  return 'adminResultUpcomingGrey';
}

function isExpectedFinished(kickoffTime: string) {
  const kickoff = new Date(kickoffTime).getTime();
  if (Number.isNaN(kickoff)) return false;
  return Date.now() >= kickoff + 110 * 60 * 1000;
}

function hasValidFinalResult(match: Match, home: number | null, away: number | null, winnerTeamId: string | null) {
  if (home === null || away === null) return false;
  if (!isKnockoutStage(match.stage)) return true;
  if (home !== away) return true;
  return winnerTeamId === match.home_team_id || winnerTeamId === match.away_team_id;
}

export function ResultAdminCard({
  match,
  teams,
  current,
}: {
  match: Match;
  teams: Team[];
  current: boolean;
}) {
  const knockoutStage = isKnockoutStage(match.stage);
  const [savedHomeScore, setSavedHomeScore] = useState<number | null>(match.home_score);
  const [savedAwayScore, setSavedAwayScore] = useState<number | null>(match.away_score);
  const [savedWinnerTeamId, setSavedWinnerTeamId] = useState<string | null>(match.winner_team_id ?? null);

  const [homeScore, setHomeScore] = useState(match.home_score?.toString() ?? '');
  const [awayScore, setAwayScore] = useState(match.away_score?.toString() ?? '');
  const [winnerTeamId, setWinnerTeamId] = useState(match.winner_team_id ?? '');
  const [saveState, setSaveState] = useState<'idle' | 'error'>('idle');
  const lastRequestKey = useRef('');

  const homeNumber = scoreInputToNumber(homeScore);
  const awayNumber = scoreInputToNumber(awayScore);
  const homeEmpty = homeScore.trim() === '';
  const awayEmpty = awayScore.trim() === '';
  const bothEmpty = homeEmpty && awayEmpty && !winnerTeamId;
  const bothScoresFilled = !homeEmpty && !awayEmpty && homeNumber !== null && awayNumber !== null;
  const isDraw = bothScoresFilled && homeNumber === awayNumber;
  const showWinnerChoice = knockoutStage && isDraw;
  const normalizedWinnerTeamId = showWinnerChoice ? winnerTeamId || null : null;

  const matchesSaved =
    savedHomeScore === (homeEmpty ? null : homeNumber) &&
    savedAwayScore === (awayEmpty ? null : awayNumber) &&
    (savedWinnerTeamId ?? null) === normalizedWinnerTeamId;

  const completeAndValid = hasValidFinalResult(match, homeEmpty ? null : homeNumber, awayEmpty ? null : awayNumber, normalizedWinnerTeamId);

  const expectedFinished = isExpectedFinished(match.kickoff_time);

  const visualStatus: ResultSaveStatus = completeAndValid && matchesSaved
    ? 'saved'
    : matchesSaved && bothEmpty
      ? expectedFinished ? 'expectedMissing' : 'upcoming'
      : 'dirty';

  useEffect(() => {
    setSavedHomeScore(match.home_score);
    setSavedAwayScore(match.away_score);
    setSavedWinnerTeamId(match.winner_team_id ?? null);
    setHomeScore(match.home_score?.toString() ?? '');
    setAwayScore(match.away_score?.toString() ?? '');
    setWinnerTeamId(match.winner_team_id ?? '');
  }, [match.id, match.home_score, match.away_score, match.winner_team_id]);

  useEffect(() => {
    if (matchesSaved) return;

    const requestHomeScore = homeEmpty ? null : homeNumber;
    const requestAwayScore = awayEmpty ? null : awayNumber;
    const requestWinnerTeamId = normalizedWinnerTeamId;
    const requestKey = `${match.id}:${requestHomeScore ?? ''}:${requestAwayScore ?? ''}:${requestWinnerTeamId ?? ''}`;
    lastRequestKey.current = requestKey;

    const timeout = window.setTimeout(async () => {
      const result = await saveResultInlineAction({
        matchId: match.id,
        homeScore: requestHomeScore,
        awayScore: requestAwayScore,
        winnerTeamId: requestWinnerTeamId,
      });

      if (lastRequestKey.current !== requestKey) return;

      if (result.ok) {
        setSavedHomeScore(requestHomeScore);
        setSavedAwayScore(requestAwayScore);
        setSavedWinnerTeamId(result.winnerTeamId ?? null);
        if (!showWinnerChoice && result.winnerTeamId) {
          setWinnerTeamId(result.winnerTeamId);
        }
        setSaveState('idle');
      } else {
        setSaveState('error');
      }
    }, 650);

    return () => window.clearTimeout(timeout);
  }, [
    awayEmpty,
    awayNumber,
    homeEmpty,
    homeNumber,
    match.id,
    matchesSaved,
    normalizedWinnerTeamId,
    showWinnerChoice,
  ]);

  return (
    <article className={`card adminCard adminResultCard ${statusClass(visualStatus)}`} data-current-match={current ? 'true' : undefined}>
      <div className="matchHeader">
        <div>
          <div className="matchTitleLine">
            <span>Spiel {match.match_number}</span>
            <span>{match.stage === 'group' && match.group_name ? `Gruppe ${match.group_name}` : getStageLabel(match.stage)}</span>
          </div>
          <div className="kickoffLine">Spielbeginn: {formatKickoff(match.kickoff_time)}</div>
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
              onChange={(event) => {
                setHomeScore(event.target.value);
                setSaveState('idle');
              }}
              aria-label={`${teamName(match, 'home')} Tore`}
            />
            <span>:</span>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={awayScore}
              onChange={(event) => {
                setAwayScore(event.target.value);
                setSaveState('idle');
              }}
              aria-label={`${teamName(match, 'away')} Tore`}
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
                    onChange={(event) => {
                      setWinnerTeamId(event.target.value);
                      setSaveState('idle');
                    }}
                  />
                  <Flag team={match.home_team} />
                  <span>{match.home_team.name}</span>
                </label>
              )}
              {match.away_team && (
                <label className={winnerTeamId === match.away_team.id ? 'advanceChoice selected' : 'advanceChoice'}>
                  <input
                    type="radio"
                    name={`winnerTeamId-${match.id}`}
                    value={match.away_team.id}
                    checked={winnerTeamId === match.away_team.id}
                    onChange={(event) => {
                      setWinnerTeamId(event.target.value);
                      setSaveState('idle');
                    }}
                  />
                  <Flag team={match.away_team} />
                  <span>{match.away_team.name}</span>
                </label>
              )}
            </div>
          </div>
        )}

        {saveState === 'error' && (
          <div className="resultAutoSaveHint" aria-live="polite">
            Konnte nicht gespeichert werden.
          </div>
        )}
      </div>

      {knockoutStage && (
        <form action={updateKnockoutTeamsAction} className="adminForm knockoutTeamsForm">
          <input type="hidden" name="matchId" value={match.id} />
          <label>
            Heimteam
            <select name="homeTeamId" defaultValue={match.home_team_id ?? ''}>
              <option value="">Offen lassen</option>
              {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </label>
          <label>
            Auswärtsteam
            <select name="awayTeamId" defaultValue={match.away_team_id ?? ''}>
              <option value="">Offen lassen</option>
              {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </label>
          <label className="checkboxLabel">
            <input name="openForPredictions" type="checkbox" defaultChecked={match.is_open_for_predictions} />
            Tipps öffnen
          </label>
          <button type="submit">Teams speichern</button>
        </form>
      )}
    </article>
  );
}
