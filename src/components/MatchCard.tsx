'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { savePredictionInlineAction } from '@/app/actions';
import { Flag } from './Flag';
import { Countdown } from './Countdown';
import { calculateTotalPoints, getStageLabel, isKnockoutStage } from '@/lib/scoring';
import { formatKickoff, isPredictionLocked } from '@/lib/time';
import type { Match, Prediction, Profile } from '@/lib/types';

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
  if (status === 'dirty') return 'matchCardUnsaved';
  if (status === 'saving') return 'matchCardUnsaved';
  if (status === 'empty') return 'matchCardMissing';
  return 'matchCardClosed';
}

function scoreInputToNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

function predictionMatchesDraft(
  prediction: LocalPrediction | undefined,
  home: number | null,
  away: number | null,
  advanceTeamId: string | null
) {
  return (
    prediction?.predicted_home_score === home &&
    prediction?.predicted_away_score === away &&
    (prediction.advance_team_id ?? null) === advanceTeamId
  );
}

function scoreText(prediction: LocalPrediction | Prediction): string {
  const home = prediction.predicted_home_score ?? '-';
  const away = prediction.predicted_away_score ?? '-';
  return `${home}:${away}`;
}

function isCompletePrediction(prediction: LocalPrediction | Prediction | undefined, knockoutStage: boolean): boolean {
  if (!prediction || prediction.predicted_home_score === null || prediction.predicted_away_score === null) return false;
  if (knockoutStage && prediction.predicted_home_score === prediction.predicted_away_score && !prediction.advance_team_id) return false;
  return true;
}

export function MatchCard({
  match,
  ownPrediction,
  showAllPredictions,
  currentUserId,
  visibleProfiles,
  current,
}: {
  match: MatchWithPredictions;
  ownPrediction?: Prediction;
  showAllPredictions: boolean;
  currentUserId: string;
  visibleProfiles: Profile[];
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
  const homeFieldEmpty = homeScore.trim() === '';
  const awayFieldEmpty = awayScore.trim() === '';

  const showAdvanceChoice = useMemo(() => {
    if (!knockoutStage) return false;
    return !homeFieldEmpty && !awayFieldEmpty && homeNumber !== null && awayNumber !== null && homeNumber === awayNumber;
  }, [awayFieldEmpty, awayNumber, homeFieldEmpty, homeNumber, knockoutStage]);

  const normalizedAdvanceTeamId = showAdvanceChoice ? advanceTeamId || null : null;
  const hasAnyInput = !homeFieldEmpty || !awayFieldEmpty || Boolean(advanceTeamId);
  const bothFieldsEmpty = homeFieldEmpty && awayFieldEmpty && !advanceTeamId;
  const hasCompleteScoreInput = !homeFieldEmpty && !awayFieldEmpty && homeNumber !== null && awayNumber !== null;
  const hasValidCompletePrediction = hasCompleteScoreInput && (!showAdvanceChoice || Boolean(advanceTeamId));
  const savedPredictionIsComplete = isCompletePrediction(savedPrediction, knockoutStage);
  const matchesSaved = predictionMatchesDraft(savedPrediction, homeNumber, awayNumber, normalizedAdvanceTeamId);

  const draftStatus: DraftStatus = !canPredict
    ? savedPredictionIsComplete
      ? 'saved'
      : savedPrediction
        ? 'dirty'
        : 'closed'
    : matchesSaved && hasValidCompletePrediction
      ? 'saved'
      : matchesSaved && savedPrediction
        ? 'dirty'
        : !hasAnyInput && !savedPrediction
          ? 'empty'
          : 'dirty';

  const effectiveStatus: DraftStatus = saveState === 'saving' ? 'saving' : draftStatus;
  const startedOrFinished = locked || Boolean(match.is_finished);
  const statusClass = !canPredict && startedOrFinished ? 'matchCardLockedBlue' : cardStateClass(effectiveStatus);

  const otherVisibleProfiles = visibleProfiles.filter((profile) => profile.id !== currentUserId);
  const predictionsByUserId = new Map((match.predictions ?? []).map((prediction) => [prediction.user_id, prediction]));

  function predictionStatusClass(prediction: Prediction | undefined) {
    if (!prediction) return 'predictionStatusMissing';
    return isCompletePrediction(prediction, knockoutStage) ? 'predictionStatusSaved' : 'predictionStatusPartial';
  }

  function predictionStatusText(prediction: Prediction | undefined) {
    if (!prediction) return 'Kein Tipp abgegeben';
    return isCompletePrediction(prediction, knockoutStage) ? 'Tipp abgegeben' : 'Tipp unvollständig';
  }

  useEffect(() => {
    setSavedPrediction(ownPrediction);
    setHomeScore(ownPrediction?.predicted_home_score?.toString() ?? '');
    setAwayScore(ownPrediction?.predicted_away_score?.toString() ?? '');
    setAdvanceTeamId(ownPrediction?.advance_team_id ?? '');
  }, [match.id, ownPrediction]);

  useEffect(() => {
    if (!canPredict) return;
    if (bothFieldsEmpty && !savedPrediction) return;
    if (matchesSaved) return;

    const requestHomeScore = homeFieldEmpty ? null : homeNumber;
    const requestAwayScore = awayFieldEmpty ? null : awayNumber;
    const requestAdvanceTeamId = normalizedAdvanceTeamId;
    const requestKey = `${match.id}:${requestHomeScore ?? ''}:${requestAwayScore ?? ''}:${requestAdvanceTeamId ?? ''}`;
    lastRequestKey.current = requestKey;

    const timeout = window.setTimeout(async () => {
      setSaveState('saving');

      const result = await savePredictionInlineAction({
        matchId: match.id,
        predictedHomeScore: requestHomeScore,
        predictedAwayScore: requestAwayScore,
        advanceTeamId: requestAdvanceTeamId,
      });

      if (lastRequestKey.current !== requestKey) return;

      if (result.ok) {
        if (result.deleted) {
          setSavedPrediction(undefined);
        } else {
          setSavedPrediction({
            id: result.predictionId ?? savedPrediction?.id ?? 'local',
            predicted_home_score: requestHomeScore,
            predicted_away_score: requestAwayScore,
            advance_team_id: requestAdvanceTeamId,
          });
        }
        setSaveState('idle');
      } else {
        setSaveState('error');
      }
    }, 325);

    return () => window.clearTimeout(timeout);
  }, [
    awayFieldEmpty,
    awayNumber,
    bothFieldsEmpty,
    canPredict,
    homeFieldEmpty,
    homeNumber,
    match.id,
    matchesSaved,
    normalizedAdvanceTeamId,
    savedPrediction,
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
                <strong>{scoreText(savedPrediction)}</strong>
              ) : (
                <strong>- : -</strong>
              )}
            </div>

            <div className="predictionTeam predictionTeamAway">
              <Flag team={match.away_team} />
              <span className="teamName">{teamName(match, 'away')}</span>
            </div>
          </div>        </div>
      )}

      {otherVisibleProfiles.length > 0 && (
        <details className="allPredictions">
          <summary>Tipps der anderen anzeigen</summary>
          <ul>
            {otherVisibleProfiles.map((profile) => {
              const prediction = predictionsByUserId.get(profile.id);
              const complete = isCompletePrediction(prediction, knockoutStage);

              return (
                <li key={profile.id} className={`predictionOverviewRow ${showAllPredictions ? 'predictionOverviewRowUnlocked' : 'predictionOverviewRowLocked'}`}>
                  <span>{profile.username}</span>
                  {showAllPredictions ? (
                    complete ? (
                      <>
                        {prediction && <strong>{scoreText(prediction)}</strong>}
                        {match.is_finished && prediction && <span className="otherPredictionPoints">{calculateTotalPoints(match, prediction)}&nbsp;Punkte</span>}
                      </>
                    ) : (
                      <span className="predictionStatus predictionStatusMissing">Kein gültiger Tipp</span>
                    )
                  ) : (
                    <span className={`predictionStatus ${predictionStatusClass(prediction)}`}>
                      {predictionStatusText(prediction)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </article>
  );
}
