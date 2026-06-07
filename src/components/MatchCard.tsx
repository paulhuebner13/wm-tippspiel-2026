'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { savePredictionInlineAction } from '@/app/actions';
import { Flag } from './Flag';
import { Countdown } from './Countdown';
import { calculateTotalPoints, getStageLabel, isKnockoutStage } from '@/lib/scoring';
import { formatKickoff, isPredictionLocked } from '@/lib/time';
import type { Match, Prediction } from '@/lib/types';

type MatchWithPredictions = Match & {
  predictions?: Prediction[];
};

type LocalPrediction = Pick<Prediction, 'id' | 'predicted_home_score' | 'predicted_away_score' | 'advance_team_id'>;

type DraftStatus = 'empty' | 'dirty' | 'saving' | 'saved' | 'closed';

function teamName(match: Match, side: 'home' | 'away'): string {
  if (side === 'home') return match.home_team?.name ?? match.home_placeholder ?? 'Offen';
  return match.away_team?.name ?? match.away_placeholder ?? 'Offen';
}

function groupOrStage(match: Match): string {
  if (match.stage === 'group' && match.group_name) return `Gruppe ${match.group_name}`;
  return getStageLabel(match.stage);
}

function cardStateClass(status: DraftStatus) {
  if (status === 'saved') return 'matchCardSaved';
  if (status === 'dirty' || status === 'saving') return 'matchCardUnsaved';
  if (status === 'empty') return 'matchCardMissing';
  return 'matchCardClosed';
}

function scoreInputToNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

function predictionMatchesDraft(prediction: LocalPrediction | undefined, home: number, away: number, advanceTeamId: string | null) {
  return (
    prediction?.predicted_home_score === home &&
    prediction?.predicted_away_score === away &&
    (prediction.advance_team_id ?? null) === advanceTeamId
  );
}

export function MatchCard({
  match,
  ownPrediction,
  showAllPredictions,
  current,
}: {
  match: MatchWithPredictions;
  ownPrediction?: Prediction;
  showAllPredictions: boolean;
  current: boolean;
}) {
  const locked = isPredictionLocked(match.kickoff_time);
  const canPredict = Boolean(match.is_open_for_predictions && !match.is_finished && !locked && match.home_team && match.away_team);
  const knockoutStage = isKnockoutStage(match.stage);

  const [savedPrediction, setSavedPrediction] = useState<LocalPrediction | undefined>(ownPrediction);
  const [homeScore, setHomeScore] = useState(ownPrediction?.predicted_home_score?.toString() ?? '');
  const [awayScore, setAwayScore] = useState(ownPrediction?.predicted_away_score?.toString() ?? '');
  const [advanceTeamId, setAdvanceTeamId] = useState(ownPrediction?.advance_team_id ?? '');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'error'>('idle');
  const lastRequestKey = useRef('');

  const homeNumber = scoreInputToNumber(homeScore);
  const awayNumber = scoreInputToNumber(awayScore);

  const showAdvanceChoice = useMemo(() => {
    if (!knockoutStage) return false;
    return homeNumber !== null && awayNumber !== null && homeNumber === awayNumber;
  }, [awayNumber, homeNumber, knockoutStage]);

  const normalizedAdvanceTeamId = showAdvanceChoice ? advanceTeamId || null : null;
  const hasAnyInput = homeScore.trim() !== '' || awayScore.trim() !== '' || Boolean(advanceTeamId);
  const hasCompleteScoreInput = homeNumber !== null && awayNumber !== null;
  const hasCompletePrediction = hasCompleteScoreInput && (!showAdvanceChoice || Boolean(advanceTeamId));
  const matchesSaved = hasCompletePrediction
    ? predictionMatchesDraft(savedPrediction, homeNumber, awayNumber, normalizedAdvanceTeamId)
    : false;

  const draftStatus: DraftStatus = !canPredict
    ? savedPrediction
      ? 'saved'
      : 'closed'
    : matchesSaved
      ? 'saved'
      : !hasAnyInput && !savedPrediction
        ? 'empty'
        : 'dirty';

  const effectiveStatus: DraftStatus = saveState === 'saving' ? 'saving' : draftStatus;
  const statusClass = cardStateClass(effectiveStatus);
  const knockoutDrawTip = savedPrediction?.predicted_home_score === savedPrediction?.predicted_away_score && knockoutStage;

  useEffect(() => {
    setSavedPrediction(ownPrediction);
    setHomeScore(ownPrediction?.predicted_home_score?.toString() ?? '');
    setAwayScore(ownPrediction?.predicted_away_score?.toString() ?? '');
    setAdvanceTeamId(ownPrediction?.advance_team_id ?? '');
  }, [match.id, ownPrediction]);

  useEffect(() => {
    if (!canPredict || !hasCompletePrediction || homeNumber === null || awayNumber === null) return;
    if (matchesSaved) return;

    const requestKey = `${match.id}:${homeNumber}:${awayNumber}:${normalizedAdvanceTeamId ?? ''}`;
    lastRequestKey.current = requestKey;

    const timeout = window.setTimeout(async () => {
      setSaveState('saving');

      const result = await savePredictionInlineAction({
        matchId: match.id,
        predictedHomeScore: homeNumber,
        predictedAwayScore: awayNumber,
        advanceTeamId: normalizedAdvanceTeamId,
      });

      if (lastRequestKey.current !== requestKey) return;

      if (result.ok) {
        setSavedPrediction({
          id: result.predictionId ?? savedPrediction?.id ?? 'local',
          predicted_home_score: homeNumber,
          predicted_away_score: awayNumber,
          advance_team_id: normalizedAdvanceTeamId,
        });
        setSaveState('idle');
      } else {
        setSaveState('error');
      }
    }, 650);

    return () => window.clearTimeout(timeout);
  }, [
    advanceTeamId,
    awayNumber,
    canPredict,
    hasCompletePrediction,
    homeNumber,
    match.id,
    matchesSaved,
    normalizedAdvanceTeamId,
    savedPrediction?.id,
  ]);

  return (
    <article className={`card matchCard ${statusClass}`} data-current-match={current ? 'true' : undefined}>
      <div className="matchHeader">
        <div>
          <div className="matchTitleLine">
            <span>Spiel {match.match_number}</span>
            <span>{groupOrStage(match)}</span>
          </div>
          <div className="kickoffLine">Spielbeginn: {formatKickoff(match.kickoff_time)}</div>
        </div>

        <div className="countdownBox">
          {match.is_finished ? <span className="badge finished">Beendet</span> : <Countdown kickoffTime={match.kickoff_time} />}
        </div>
      </div>

      {canPredict ? (
        <div className="predictionForm predictionFormCentered" aria-label="Tipp eingeben">
          <div className="predictionMainRow">
            <div className="predictionTeam predictionTeamHome">
              <span className="teamName">{teamName(match, 'home')}</span>
              <Flag team={match.home_team} />
            </div>

            <div className="scoreInputs">
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={homeScore}
                onChange={(event) => {
                  setHomeScore(event.target.value);
                  setAdvanceTeamId('');
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
                  setAdvanceTeamId('');
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

          {showAdvanceChoice && (
            <div className="advanceChoiceBox">
              <div className="advanceChoiceTitle">Wer kommt weiter?</div>
              <div className="advanceChoices">
                {match.home_team && (
                  <label className={advanceTeamId === match.home_team.id ? 'advanceChoice selected' : 'advanceChoice'}>
                    <input
                      type="radio"
                      name={`advanceTeamId-${match.id}`}
                      value={match.home_team.id}
                      checked={advanceTeamId === match.home_team.id}
                      onChange={(event) => {
                        setAdvanceTeamId(event.target.value);
                        setSaveState('idle');
                      }}
                    />
                    <Flag team={match.home_team} />
                    <span>{match.home_team.name}</span>
                  </label>
                )}
                {match.away_team && (
                  <label className={advanceTeamId === match.away_team.id ? 'advanceChoice selected' : 'advanceChoice'}>
                    <input
                      type="radio"
                      name={`advanceTeamId-${match.id}`}
                      value={match.away_team.id}
                      checked={advanceTeamId === match.away_team.id}
                      onChange={(event) => {
                        setAdvanceTeamId(event.target.value);
                        setSaveState('idle');
                      }}
                    />
                    <Flag team={match.away_team} />
                    <span>{match.away_team.name}</span>
                  </label>
                )}
              </div>
              <p className="advanceHint">Bei K.-o.-Unentschieden musst du auswählen, wer weiterkommt.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="lockedMatchContent">
          <div className="lockedTeamsRow">
            <div className="predictionTeam predictionTeamHome">
              <span className="teamName">{teamName(match, 'home')}</span>
              <Flag team={match.home_team} />
            </div>

            <div className="lockedScoreBox">
              {match.is_finished ? (
                <strong>{match.home_score}:{match.away_score}</strong>
              ) : savedPrediction ? (
                <strong>{savedPrediction.predicted_home_score}:{savedPrediction.predicted_away_score}</strong>
              ) : (
                <strong>- : -</strong>
              )}
            </div>

            <div className="predictionTeam predictionTeamAway">
              <Flag team={match.away_team} />
              <span className="teamName">{teamName(match, 'away')}</span>
            </div>
          </div>

          <div className="predictionLockedBox">
            {savedPrediction ? (
              <>
                Dein Tipp: <strong>{savedPrediction.predicted_home_score}:{savedPrediction.predicted_away_score}</strong>
                {knockoutDrawTip && savedPrediction.advance_team_id && <span> · Weiterkommer ausgewählt</span>}
                {match.is_finished && <span> · Punkte: {calculateTotalPoints(match, savedPrediction as Prediction)}</span>}
              </>
            ) : (
              <span>{match.is_open_for_predictions ? 'Kein Tipp abgegeben' : 'Tipps noch nicht geöffnet'}</span>
            )}
          </div>
        </div>
      )}

      {showAllPredictions && match.predictions && match.predictions.length > 0 && (
        <details className="allPredictions">
          <summary>Tipps der anderen anzeigen</summary>
          <ul>
            {match.predictions.map((prediction) => (
              <li key={prediction.id}>
                <span>{prediction.profile?.username ?? 'User'}</span>
                <strong>{prediction.predicted_home_score}:{prediction.predicted_away_score}</strong>
                {match.is_finished && <span>{calculateTotalPoints(match, prediction)} Punkte</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
