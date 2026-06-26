"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { overridePredictionInlineAction } from "@/app/actions";
import { Flag } from "@/components/Flag";
import { getStageLabel, isKnockoutStage } from "@/lib/scoring";
import { formatKickoff, isPredictionLocked } from "@/lib/time";
import type { Match, Prediction, Profile, Team } from "@/lib/types";

type MatchWithTeams = Match & {
  home_team?: Team | null;
  away_team?: Team | null;
};

type ChangePredictionEditorProps = {
  match: MatchWithTeams;
  selectedProfile: Profile;
  prediction?: Prediction;
  scrollTarget: boolean;
};

function teamName(match: MatchWithTeams, side: "home" | "away") {
  if (side === "home")
    return match.home_team?.name ?? match.home_placeholder ?? "Offen";
  return match.away_team?.name ?? match.away_placeholder ?? "Offen";
}

function scoreText(home: number | null, away: number | null) {
  if (home === null || away === null) return "vs";
  return `${home}:${away}`;
}

function inputToNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

function hasCompletePredictionValues(
  match: MatchWithTeams,
  home: number | null,
  away: number | null,
  advanceTeamId: string | null,
) {
  if (home === null || away === null) return false;
  if (isKnockoutStage(match.stage) && home === away && !advanceTeamId)
    return false;
  return true;
}

function hasCompletePrediction(
  prediction: Prediction | undefined,
  match: MatchWithTeams,
) {
  if (!prediction) return false;
  return hasCompletePredictionValues(
    match,
    prediction.predicted_home_score,
    prediction.predicted_away_score,
    prediction.advance_team_id ?? null,
  );
}

function predictionClass(started: boolean, submitted: boolean) {
  if (started && submitted) return "changeMatchStartedSubmitted";
  if (started && !submitted) return "changeMatchStartedMissing";
  if (!started && submitted) return "changeMatchFutureSubmitted";
  return "changeMatchFutureMissing";
}

export function ChangePredictionEditor({
  match,
  selectedProfile,
  prediction,
  scrollTarget,
}: ChangePredictionEditorProps) {
  const started = isPredictionLocked(match.kickoff_time);
  const knockout = isKnockoutStage(match.stage);
  const initiallySubmitted = hasCompletePrediction(prediction, match);
  const hideExistingTip = initiallySubmitted && !started;

  const [homeScore, setHomeScore] = useState(
    hideExistingTip ? "" : (prediction?.predicted_home_score?.toString() ?? ""),
  );
  const [awayScore, setAwayScore] = useState(
    hideExistingTip ? "" : (prediction?.predicted_away_score?.toString() ?? ""),
  );
  const [advanceTeamId, setAdvanceTeamId] = useState(
    hideExistingTip ? "" : (prediction?.advance_team_id ?? ""),
  );
  const [touched, setTouched] = useState(false);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const lastSavedKey = useRef("");
  const firstRender = useRef(true);

  const homeNumber = inputToNumber(homeScore);
  const awayNumber = inputToNumber(awayScore);
  const advanceValue = advanceTeamId || null;
  const currentSubmitted = hasCompletePredictionValues(
    match,
    homeNumber,
    awayNumber,
    advanceValue,
  );
  const effectiveSubmitted = touched ? currentSubmitted : initiallySubmitted;

  const saveKey = useMemo(() => {
    return `${homeScore.trim()}|${awayScore.trim()}|${advanceTeamId}`;
  }, [homeScore, awayScore, advanceTeamId]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      lastSavedKey.current = saveKey;
      return;
    }

    if (!touched || saveKey === lastSavedKey.current) return;

    const bothFieldsEmpty =
      homeScore.trim() === "" &&
      awayScore.trim() === "" &&
      advanceTeamId === "";
    const shouldDeleteExistingPrediction =
      bothFieldsEmpty && Boolean(prediction);
    const shouldSaveCompletePrediction = currentSubmitted;

    if (!shouldDeleteExistingPrediction && !shouldSaveCompletePrediction)
      return;

    const timeoutId = window.setTimeout(async () => {
      lastSavedKey.current = saveKey;
      setSaveState("saving");

      const result = await overridePredictionInlineAction({
        userId: selectedProfile.id,
        matchId: match.id,
        predictedHomeScore: shouldDeleteExistingPrediction ? null : homeNumber,
        predictedAwayScore: shouldDeleteExistingPrediction ? null : awayNumber,
        advanceTeamId: shouldDeleteExistingPrediction ? null : advanceValue,
      });

      setSaveState(result.ok ? "saved" : "error");
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [
    advanceTeamId,
    advanceValue,
    awayNumber,
    awayScore,
    currentSubmitted,
    homeNumber,
    homeScore,
    match.id,
    prediction,
    saveKey,
    selectedProfile.id,
    touched,
  ]);

  function markTouched() {
    setTouched(true);
    setSaveState("idle");
  }

  return (
    <section
      className={`card changeMatchCard ${predictionClass(started, effectiveSubmitted)}`}
      data-change-scroll-target={scrollTarget ? "true" : "false"}
    >
      <div className="matchTitleLine">
        <span>Spiel {match.match_number}</span>
        <span>
          {match.stage === "group" && match.group_name
            ? `Gruppe ${match.group_name}`
            : getStageLabel(match.stage)}
        </span>
        <span>{formatKickoff(match.kickoff_time)}</span>
      </div>

      <div className="lockedTeamsRow">
        <div className="predictionTeam predictionTeamHome">
          <span className="teamName">{teamName(match, "home")}</span>
          <Flag team={match.home_team} />
        </div>
        <strong className="lockedScoreBox">
          {scoreText(
            match.home_score ?? match.provisional_home_score ?? null,
            match.away_score ?? match.provisional_away_score ?? null,
          )}
        </strong>
        <div className="predictionTeam predictionTeamAway">
          <Flag team={match.away_team} />
          <span className="teamName">{teamName(match, "away")}</span>
        </div>
      </div>

      <div className="changePredictionForm">
        <input
          className="scoreLeft"
          inputMode="numeric"
          min="0"
          type="number"
          placeholder={hideExistingTip ? "neu" : "0"}
          value={homeScore}
          onChange={(event) => {
            markTouched();
            setHomeScore(event.target.value);
          }}
        />
        <span className="scoreSep">:</span>
        <input
          className="scoreRight"
          inputMode="numeric"
          min="0"
          type="number"
          placeholder={hideExistingTip ? "neu" : "0"}
          value={awayScore}
          onChange={(event) => {
            markTouched();
            setAwayScore(event.target.value);
          }}
        />

        {knockout && match.home_team_id && match.away_team_id && (
          <select
            className="changeAdvanceSelect"
            value={advanceTeamId}
            onChange={(event) => {
              markTouched();
              setAdvanceTeamId(event.target.value);
            }}
          >
            <option value="">
              Wer kommt weiter? Nur bei Unentschieden nötig
            </option>
            <option value={match.home_team_id}>
              {teamName(match, "home")}
            </option>
            <option value={match.away_team_id}>
              {teamName(match, "away")}
            </option>
          </select>
        )}
      </div>

      <div className={`changeAutoSaveState changeAutoSaveState${saveState}`}>
        {saveState === "saving" && "speichert..."}
        {saveState === "saved" && "gespeichert"}
        {saveState === "error" && "Fehler beim Speichern"}
      </div>
    </section>
  );
}
