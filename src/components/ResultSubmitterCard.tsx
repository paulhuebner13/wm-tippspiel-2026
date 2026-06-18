'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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

function canSubmitProvisional(match: Match) {
  if (match.home_score !== null && match.away_score !== null) return false;
  const openAt = new Date(new Date(match.kickoff_time).getTime() + 105 * 60 * 1000).getTime();
  if (Number.isNaN(openAt)) return false;
  return Date.now() >= openAt;
}

export function ResultSubmitterCard({ match }: { match: Match }) {
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
  const lastRequestKey = useRef('');

  const knockout = isKnockoutStage(match.stage);
  const editable = canSubmitProvisional(match);
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

  const cardClass = hasOfficialResult ? 'adminResultSavedGreen' : editable ? 'adminResultUpcomingGrey' : 'adminResultUpcomingGrey';

  return (
    <article className={`card adminResultCard resultSubmitterCard ${cardClass}`}>
      <div className="matchHeader resultAdminHeader">
        <div>
          <div className="matchTitleLine resultTitleLine">
            <span>Spiel {match.match_number}</span>
            <span>{match.stage === 'group' && match.group_name ? `Gruppe ${match.group_name}` : getStageLabel(match.stage)}</span>
            <span>{formatKickoff(match.kickoff_time)}</span>
          </div>
        </div>
      </div>

      <div className="adminResultBody">
        <div className="adminResultTeam adminResultTeamHome">
          <span className="teamName">{teamName(match, 'home')}</span>
          <Flag team={match.home_team} />
        </div>

        <div className="adminResultScoreBlock">
          <input
            value={homeScore}
            onChange={(event) => setHomeScore(event.target.value)}
            inputMode="numeric"
            pattern="[0-9]*"
            disabled={!editable}
          />
          <span>:</span>
          <input
            value={awayScore}
            onChange={(event) => setAwayScore(event.target.value)}
            inputMode="numeric"
            pattern="[0-9]*"
            disabled={!editable}
          />
        </div>

        <div className="adminResultTeam adminResultTeamAway">
          <Flag team={match.away_team} />
          <span className="teamName">{teamName(match, 'away')}</span>
        </div>
      </div>

      {showWinnerChoice && (
        <div className="winnerChoice adminWinnerChoice">
          {match.home_team && (
            <label>
              <input
                type="radio"
                name={`winner-${match.id}`}
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
            <label>
              <input
                type="radio"
                name={`winner-${match.id}`}
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
      )}

      {saveState === 'error' && <p className="errorBox compactError">Speichern fehlgeschlagen.</p>}
    </article>
  );
}
