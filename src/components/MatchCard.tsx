'use client';

import { useMemo, useState } from 'react';
import { savePredictionAction } from '@/app/actions';
import { Flag } from './Flag';
import { Countdown } from './Countdown';
import { calculateTotalPoints, getStageLabel, isKnockoutStage } from '@/lib/scoring';
import { formatKickoff, isPredictionLocked } from '@/lib/time';
import type { Match, Prediction } from '@/lib/types';

type MatchWithPredictions = Match & {
  predictions?: Prediction[];
};

function teamName(match: Match, side: 'home' | 'away'): string {
  if (side === 'home') return match.home_team?.name ?? match.home_placeholder ?? 'Offen';
  return match.away_team?.name ?? match.away_placeholder ?? 'Offen';
}

function groupOrStage(match: Match): string {
  if (match.stage === 'group' && match.group_name) return `Gruppe ${match.group_name}`;
  return getStageLabel(match.stage);
}

function cardStateClass({
  ownPrediction,
  canPredict,
  locked,
  isFinished,
}: {
  ownPrediction?: Prediction;
  canPredict: boolean;
  locked: boolean;
  isFinished: boolean;
}) {
  if (isFinished) return 'matchCardFinished';
  if (ownPrediction) return 'matchCardSaved';
  if (canPredict && !locked) return 'matchCardMissing';
  return 'matchCardClosed';
}

function scoreInputToNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
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
  const canPredict = match.is_open_for_predictions && !match.is_finished && !locked && match.home_team && match.away_team;
  const knockoutStage = isKnockoutStage(match.stage);
  const knockoutDrawTip = ownPrediction?.predicted_home_score === ownPrediction?.predicted_away_score && knockoutStage;
  const statusClass = cardStateClass({ ownPrediction, canPredict: Boolean(canPredict), locked, isFinished: match.is_finished });

  const [homeScore, setHomeScore] = useState(ownPrediction?.predicted_home_score?.toString() ?? '');
  const [awayScore, setAwayScore] = useState(ownPrediction?.predicted_away_score?.toString() ?? '');
  const [advanceTeamId, setAdvanceTeamId] = useState(ownPrediction?.advance_team_id ?? '');

  const showAdvanceChoice = useMemo(() => {
    if (!knockoutStage) return false;
    const home = scoreInputToNumber(homeScore);
    const away = scoreInputToNumber(awayScore);
    return home !== null && away !== null && home === away;
  }, [awayScore, homeScore, knockoutStage]);

  const saveDisabled = Boolean(showAdvanceChoice && advanceTeamId.length === 0);

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

      <p className="venue">{match.venue}</p>

      {canPredict ? (
        <form action={savePredictionAction} className="predictionForm predictionFormCentered">
          <input type="hidden" name="matchId" value={match.id} />

          <div className="predictionMainRow">
            <div className="predictionTeam predictionTeamHome">
              <span className="teamName">{teamName(match, 'home')}</span>
              <Flag team={match.home_team} />
            </div>

            <div className="scoreInputs">
              <input
                name="predictedHomeScore"
                type="number"
                min="0"
                inputMode="numeric"
                value={homeScore}
                onChange={(event) => {
                  setHomeScore(event.target.value);
                  setAdvanceTeamId('');
                }}
                aria-label={`${teamName(match, 'home')} Tore`}
                required
              />
              <span>:</span>
              <input
                name="predictedAwayScore"
                type="number"
                min="0"
                inputMode="numeric"
                value={awayScore}
                onChange={(event) => {
                  setAwayScore(event.target.value);
                  setAdvanceTeamId('');
                }}
                aria-label={`${teamName(match, 'away')} Tore`}
                required
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
                      name="advanceTeamId"
                      value={match.home_team.id}
                      checked={advanceTeamId === match.home_team.id}
                      onChange={(event) => setAdvanceTeamId(event.target.value)}
                      required
                    />
                    <Flag team={match.home_team} />
                    <span>{match.home_team.name}</span>
                  </label>
                )}
                {match.away_team && (
                  <label className={advanceTeamId === match.away_team.id ? 'advanceChoice selected' : 'advanceChoice'}>
                    <input
                      type="radio"
                      name="advanceTeamId"
                      value={match.away_team.id}
                      checked={advanceTeamId === match.away_team.id}
                      onChange={(event) => setAdvanceTeamId(event.target.value)}
                      required
                    />
                    <Flag team={match.away_team} />
                    <span>{match.away_team.name}</span>
                  </label>
                )}
              </div>
              <p className="advanceHint">Bei K.-o.-Unentschieden musst du auswählen, wer weiterkommt.</p>
            </div>
          )}

          <button type="submit" className="saveTipButton" disabled={saveDisabled}>
            Tipp speichern
          </button>
        </form>
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
              ) : ownPrediction ? (
                <strong>{ownPrediction.predicted_home_score}:{ownPrediction.predicted_away_score}</strong>
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
            {ownPrediction ? (
              <>
                Dein Tipp: <strong>{ownPrediction.predicted_home_score}:{ownPrediction.predicted_away_score}</strong>
                {knockoutDrawTip && ownPrediction.advance_team_id && <span> · Weiterkommer ausgewählt</span>}
                {match.is_finished && <span> · Punkte: {calculateTotalPoints(match, ownPrediction)}</span>}
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
