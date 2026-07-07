"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { savePredictionInlineAction } from "@/app/actions";
import { Flag } from "./Flag";
import { Countdown } from "./Countdown";
import { LocalDateTime } from "./LocalDateTime";
import {
  calculateTotalPoints,
  getStageLabel,
  isKnockoutStage,
} from "@/lib/scoring";
import { getTeamColor } from "@/lib/teamColors";
import { getFifaRanking } from "@/lib/fifaRankings";
import { isPredictionLocked } from "@/lib/time";
import type { Match, Prediction, Profile } from "@/lib/types";

type MatchWithPredictions = Match & {
  predictions?: Prediction[];
};

type LocalPrediction = Pick<
  Prediction,
  "id" | "predicted_home_score" | "predicted_away_score" | "advance_team_id"
>;

type DraftStatus = "empty" | "dirty" | "saving" | "saved" | "closed";

export type MatchHistoryEntry = {
  id: string;
  leftTeam: Match["home_team"];
  rightTeam: Match["away_team"];
  leftScore: number;
  rightScore: number;
  leftIsCurrent: boolean;
  rightIsCurrent: boolean;
};

type OptimizerPreviewAdvanceSide = "home" | "away" | null;
type OptimizerPreviewOutcomeSide = "home" | "away" | "draw";

type OptimizerPreviewTip = {
  home: number;
  away: number;
  label: string;
  scoreLabel: string;
  tipKey: string;
  advanceSide: OptimizerPreviewAdvanceSide;
  expectedPoints: number;
};

type OptimizerPreviewOutcomePick = {
  key: string;
  title: string;
  side: OptimizerPreviewOutcomeSide;
  advanceSide: OptimizerPreviewAdvanceSide;
  tip: OptimizerPreviewTip | null;
};

export type OptimizerMatchPreview = {
  hasOdds: boolean;
  hasProbabilities: boolean;
  outcomes: {
    home: number;
    draw: number;
    away: number;
  };
  bestThree: OptimizerPreviewTip[];
  alternativeDiffs: OptimizerPreviewTip[];
  outcomePicks: OptimizerPreviewOutcomePick[];
  topScores: {
    home: number;
    away: number;
    label: string;
    probability: number;
  }[];
  topDiffs: { diff: number; probability: number }[];
};

function teamName(match: Match, side: "home" | "away"): string {
  if (side === "home")
    return match.home_team?.name ?? match.home_placeholder ?? "Offen";
  return match.away_team?.name ?? match.away_placeholder ?? "Offen";
}

function groupOrStage(match: Match): string {
  if (match.stage === "group" && match.group_name)
    return `Gruppe ${match.group_name}`;
  return getStageLabel(match.stage);
}

function cardStateClass(status: DraftStatus) {
  if (status === "saved") return "matchCardSaved";
  if (status === "dirty") return "matchCardUnsaved";
  if (status === "saving") return "matchCardUnsaved";
  if (status === "empty") return "matchCardMissing";
  return "matchCardClosed";
}

function scoreInputToNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

function predictionMatchesDraft(
  prediction: LocalPrediction | undefined,
  home: number | null,
  away: number | null,
  advanceTeamId: string | null,
) {
  return (
    prediction?.predicted_home_score === home &&
    prediction?.predicted_away_score === away &&
    (prediction.advance_team_id ?? null) === advanceTeamId
  );
}

function scoreText(prediction: LocalPrediction | Prediction): string {
  const home = prediction.predicted_home_score ?? "-";
  const away = prediction.predicted_away_score ?? "-";
  return `${home}:${away}`;
}

function formatOptimizerPercent(value: number) {
  return `${(value * 100).toFixed(1)} %`;
}

function formatExpectedPoints(value: number) {
  return value.toFixed(2);
}

function formatSignedDiff(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function DrawFlag() {
  return <span className="drawFlagMini">Draw</span>;
}

function predictionFlagTeam(match: Match, prediction: Prediction | undefined) {
  if (
    !prediction ||
    prediction.predicted_home_score === null ||
    prediction.predicted_away_score === null
  )
    return null;
  if (prediction.predicted_home_score > prediction.predicted_away_score)
    return match.home_team ?? null;
  if (prediction.predicted_home_score < prediction.predicted_away_score)
    return match.away_team ?? null;
  return null;
}

function predictionAdvanceTeam(match: Match, prediction: Prediction | undefined) {
  if (
    !prediction ||
    prediction.predicted_home_score === null ||
    prediction.predicted_away_score === null ||
    prediction.predicted_home_score !== prediction.predicted_away_score
  )
    return null;
  if (prediction.advance_team_id === match.home_team_id)
    return match.home_team ?? null;
  if (prediction.advance_team_id === match.away_team_id)
    return match.away_team ?? null;
  return null;
}

function resultHomeScore(match: Match): number | null {
  return match.home_score ?? match.provisional_home_score ?? null;
}

function resultAwayScore(match: Match): number | null {
  return match.away_score ?? match.provisional_away_score ?? null;
}

function hasVisibleResult(match: Match): boolean {
  return resultHomeScore(match) !== null && resultAwayScore(match) !== null;
}

function matchForScoring(match: Match): Match {
  return {
    ...match,
    home_score: resultHomeScore(match),
    away_score: resultAwayScore(match),
    winner_team_id:
      match.winner_team_id ?? match.provisional_winner_team_id ?? null,
    is_finished: match.is_finished || hasVisibleResult(match),
  };
}

function isCompletePrediction(
  prediction: LocalPrediction | Prediction | undefined,
  knockoutStage: boolean,
): boolean {
  if (
    !prediction ||
    prediction.predicted_home_score === null ||
    prediction.predicted_away_score === null
  )
    return false;
  if (
    knockoutStage &&
    prediction.predicted_home_score === prediction.predicted_away_score &&
    !prediction.advance_team_id
  )
    return false;
  return true;
}

export function MatchCard({
  match,
  ownPrediction,
  showAllPredictions,
  currentUserId,
  visibleProfiles,
  current,
  displayMatchNumber,
  showOptimizerControl,
  optimizerPreview,
  previousMatches,
}: {
  match: MatchWithPredictions;
  ownPrediction?: Prediction;
  showAllPredictions: boolean;
  currentUserId: string;
  visibleProfiles: Profile[];
  current: boolean;
  displayMatchNumber?: number;
  showOptimizerControl?: boolean;
  optimizerPreview?: OptimizerMatchPreview;
  previousMatches?: MatchHistoryEntry[];
}) {
  const locked = isPredictionLocked(match.kickoff_time);
  const canPredict = Boolean(
    match.is_open_for_predictions &&
    !match.is_finished &&
    !locked &&
    match.home_team &&
    match.away_team,
  );
  const knockoutStage = isKnockoutStage(match.stage);

  const [savedPrediction, setSavedPrediction] = useState<
    LocalPrediction | undefined
  >(ownPrediction);
  const [homeScore, setHomeScore] = useState(
    ownPrediction?.predicted_home_score?.toString() ?? "",
  );
  const [awayScore, setAwayScore] = useState(
    ownPrediction?.predicted_away_score?.toString() ?? "",
  );
  const [advanceTeamId, setAdvanceTeamId] = useState(
    ownPrediction?.advance_team_id ?? "",
  );
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">(
    "idle",
  );
  const [optimizerOpen, setOptimizerOpen] = useState(false);
  const [allPredictionsOpen, setAllPredictionsOpen] = useState(false);
  const lastRequestKey = useRef("");
  const homeColor = getTeamColor(match.home_team);
  const awayColor = getTeamColor(match.away_team);
  const hasInsightsControl = Boolean(match.home_team && match.away_team);
  const historyMatches = previousMatches ?? [];
  const homeRanking = getFifaRanking(match.home_team?.name);
  const awayRanking = getFifaRanking(match.away_team?.name);

  const homeNumber = scoreInputToNumber(homeScore);
  const awayNumber = scoreInputToNumber(awayScore);
  const homeFieldEmpty = homeScore.trim() === "";
  const awayFieldEmpty = awayScore.trim() === "";

  const showAdvanceChoice = useMemo(() => {
    if (!knockoutStage) return false;
    return (
      !homeFieldEmpty &&
      !awayFieldEmpty &&
      homeNumber !== null &&
      awayNumber !== null &&
      homeNumber === awayNumber
    );
  }, [awayFieldEmpty, awayNumber, homeFieldEmpty, homeNumber, knockoutStage]);

  const normalizedAdvanceTeamId = showAdvanceChoice
    ? advanceTeamId || null
    : null;
  const hasAnyInput =
    !homeFieldEmpty || !awayFieldEmpty || Boolean(advanceTeamId);
  const bothFieldsEmpty = homeFieldEmpty && awayFieldEmpty && !advanceTeamId;
  const hasCompleteScoreInput =
    !homeFieldEmpty &&
    !awayFieldEmpty &&
    homeNumber !== null &&
    awayNumber !== null;
  const hasValidCompletePrediction =
    hasCompleteScoreInput && (!showAdvanceChoice || Boolean(advanceTeamId));
  const savedPredictionIsComplete = isCompletePrediction(
    savedPrediction,
    knockoutStage,
  );
  const matchesSaved = predictionMatchesDraft(
    savedPrediction,
    homeNumber,
    awayNumber,
    normalizedAdvanceTeamId,
  );

  const draftStatus: DraftStatus = !canPredict
    ? savedPredictionIsComplete
      ? "saved"
      : savedPrediction
        ? "dirty"
        : "closed"
    : matchesSaved && hasValidCompletePrediction
      ? "saved"
      : matchesSaved && savedPrediction
        ? "dirty"
        : !hasAnyInput && !savedPrediction
          ? "empty"
          : "dirty";

  const effectiveStatus: DraftStatus =
    saveState === "saving" ? "saving" : draftStatus;
  const startedOrFinished = locked || Boolean(match.is_finished);
  const statusClass =
    !canPredict && startedOrFinished
      ? "matchCardLockedBlue"
      : cardStateClass(effectiveStatus);

  const predictionProfiles = [
    ...visibleProfiles.filter((profile) => profile.id === currentUserId),
    ...visibleProfiles.filter((profile) => profile.id !== currentUserId),
  ];
  const predictionsByUserId = new Map(
    (match.predictions ?? []).map((prediction) => [
      prediction.user_id,
      prediction,
    ]),
  );

  function predictionStatusClass(prediction: Prediction | undefined) {
    if (!prediction) return "predictionStatusMissing";
    return isCompletePrediction(prediction, knockoutStage)
      ? "predictionStatusSaved"
      : "predictionStatusPartial";
  }

  function predictionStatusText(prediction: Prediction | undefined) {
    if (!prediction) return "Kein Tipp abgegeben";
    return isCompletePrediction(prediction, knockoutStage)
      ? "Tipp abgegeben"
      : "Tipp unvollständig";
  }

  function scoreOutcomeClass(score: { home: number; away: number }) {
    if (score.home > score.away) return "home";
    if (score.home < score.away) return "away";
    return "draw";
  }

  useEffect(() => {
    setSavedPrediction(ownPrediction);
    setHomeScore(ownPrediction?.predicted_home_score?.toString() ?? "");
    setAwayScore(ownPrediction?.predicted_away_score?.toString() ?? "");
    setAdvanceTeamId(ownPrediction?.advance_team_id ?? "");
  }, [match.id, ownPrediction]);

  useEffect(() => {
    if (!canPredict) return;

    const shouldDeleteExistingPrediction =
      bothFieldsEmpty && Boolean(savedPrediction);
    const shouldSaveCompletePrediction =
      !bothFieldsEmpty && hasValidCompletePrediction;

    if (!shouldDeleteExistingPrediction && !shouldSaveCompletePrediction)
      return;
    if (matchesSaved) return;

    const requestHomeScore = shouldDeleteExistingPrediction ? null : homeNumber;
    const requestAwayScore = shouldDeleteExistingPrediction ? null : awayNumber;
    const requestAdvanceTeamId = shouldDeleteExistingPrediction
      ? null
      : normalizedAdvanceTeamId;
    const requestKey = `${match.id}:${requestHomeScore ?? ""}:${requestAwayScore ?? ""}:${requestAdvanceTeamId ?? ""}`;
    lastRequestKey.current = requestKey;

    const timeout = window.setTimeout(async () => {
      setSaveState("saving");

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
            id: result.predictionId ?? savedPrediction?.id ?? "local",
            predicted_home_score: result.predictedHomeScore ?? requestHomeScore,
            predicted_away_score: result.predictedAwayScore ?? requestAwayScore,
            advance_team_id: result.advanceTeamId ?? null,
          });
        }
        setSaveState("idle");
      } else {
        setSaveState("error");
      }
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [
    bothFieldsEmpty,
    canPredict,
    hasValidCompletePrediction,
    homeNumber,
    awayNumber,
    match.id,
    matchesSaved,
    normalizedAdvanceTeamId,
    savedPrediction,
  ]);

  return (
    <article
      className={`card matchCard ${statusClass}`}
      data-current-match={current ? "true" : undefined}
    >
      <div className="matchHeader">
        <div>
          <div className="matchTitleLine">
            <span>Spiel Nr. {match.match_number}</span>
            <span>{groupOrStage(match)}</span>
          </div>
          <div className="kickoffLine">
            Spielbeginn: <LocalDateTime value={match.kickoff_time} />
          </div>
        </div>

        <div className="countdownBox">
          {hasVisibleResult(match) ? (
            <span className="badge finished">Beendet</span>
          ) : (
            <Countdown kickoffTime={match.kickoff_time} />
          )}
        </div>
      </div>

      {canPredict ? (
        <div
          className="predictionForm predictionFormCentered"
          aria-label="Tipp eingeben"
        >
          <div className="predictionMainRow">
            <div className="predictionTeam predictionTeamHome">
              <span className="teamName">{teamName(match, "home")}</span>
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
                  setAdvanceTeamId("");
                  setSaveState("idle");
                }}
                aria-label={`${teamName(match, "home")} Tore`}
              />
              <span>:</span>
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={awayScore}
                onChange={(event) => {
                  setAwayScore(event.target.value);
                  setAdvanceTeamId("");
                  setSaveState("idle");
                }}
                aria-label={`${teamName(match, "away")} Tore`}
              />
            </div>

            <div className="predictionTeam predictionTeamAway">
              <Flag team={match.away_team} />
              <span className="teamName">{teamName(match, "away")}</span>
            </div>
          </div>

          {knockoutStage && (
            <p className="knockoutTipHint">Getippt wird immer das Ergebnis nach 90 Minuten.</p>
          )}

          {showAdvanceChoice && (
            <div className="advanceChoiceBox">
              <div className="advanceChoiceTitle">Wer kommt weiter?</div>
              <div className="advanceChoices">
                {match.home_team && (
                  <label
                    className={
                      advanceTeamId === match.home_team.id
                        ? "advanceChoice selected"
                        : "advanceChoice"
                    }
                  >
                    <input
                      type="radio"
                      name={`advanceTeamId-${match.id}`}
                      value={match.home_team.id}
                      checked={advanceTeamId === match.home_team.id}
                      onChange={(event) => {
                        setAdvanceTeamId(event.target.value);
                        setSaveState("idle");
                      }}
                    />
                    <Flag team={match.home_team} />
                    <span>{match.home_team.name}</span>
                  </label>
                )}
                {match.away_team && (
                  <label
                    className={
                      advanceTeamId === match.away_team.id
                        ? "advanceChoice selected"
                        : "advanceChoice"
                    }
                  >
                    <input
                      type="radio"
                      name={`advanceTeamId-${match.id}`}
                      value={match.away_team.id}
                      checked={advanceTeamId === match.away_team.id}
                      onChange={(event) => {
                        setAdvanceTeamId(event.target.value);
                        setSaveState("idle");
                      }}
                    />
                    <Flag team={match.away_team} />
                    <span>{match.away_team.name}</span>
                  </label>
                )}
              </div>
              <p className="advanceHint">
                Bei K.-o.-Unentschieden musst du auswählen, wer weiterkommt.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="lockedMatchContent">
          <div className="lockedTeamsRow">
            <div className="predictionTeam predictionTeamHome">
              <span className="teamName">{teamName(match, "home")}</span>
              <Flag team={match.home_team} />
            </div>

            <div className="lockedScoreBox">
              {savedPrediction ? (
                <strong>{scoreText(savedPrediction)}</strong>
              ) : (
                <strong>- : -</strong>
              )}
            </div>

            <div className="predictionTeam predictionTeamAway">
              <Flag team={match.away_team} />
              <span className="teamName">{teamName(match, "away")}</span>
            </div>
          </div>{" "}
        </div>
      )}

      {saveState === "error" && (
        <p className="predictionSaveError">
          Speichern fehlgeschlagen. Bitte kurz neu laden oder nochmal ändern.
        </p>
      )}

      {(predictionProfiles.length > 0 || hasInsightsControl) && (
        <>
          <div className="matchCardActions">
            {predictionProfiles.length > 0 && (
              <details
                className="allPredictions"
                open={allPredictionsOpen}
                onToggle={(event) => {
                  const open = event.currentTarget.open;
                  setAllPredictionsOpen(open);
                  if (open) setOptimizerOpen(false);
                }}
              >
                <summary>Alle Tipps anzeigen</summary>
                <ul>
                  {predictionProfiles.map((profile) => {
                    const prediction = predictionsByUserId.get(profile.id);
                    const complete = isCompletePrediction(
                      prediction,
                      knockoutStage,
                    );
                    const self = profile.id === currentUserId;
                    const mainTipTeam = predictionFlagTeam(match, prediction);
                    const advanceTipTeam = predictionAdvanceTeam(match, prediction);

                    return (
                      <li
                        key={profile.id}
                        className={`predictionOverviewRow ${self ? "predictionOverviewRowSelf" : ""} ${showAllPredictions ? "predictionOverviewRowUnlocked" : "predictionOverviewRowLocked"}`}
                      >
                        <span>
                          {self ? `Du (${profile.username})` : profile.username}
                        </span>
                        {showAllPredictions ? (
                          complete ? (
                            <>
                              <span className="predictionOverviewTipCenter">
                                <span className="predictionOverviewTipFlag predictionOverviewTipFlagStack">
                                  <span className="predictionOverviewMainFlag">
                                    {mainTipTeam ? (
                                      <Flag team={mainTipTeam} />
                                    ) : (
                                      <DrawFlag />
                                    )}
                                  </span>
                                  {advanceTipTeam && (
                                    <span className="predictionOverviewAdvanceFlag">
                                      <Flag team={advanceTipTeam} />
                                    </span>
                                  )}
                                </span>
                                {prediction && (
                                  <strong>{scoreText(prediction)}</strong>
                                )}
                              </span>
                              {hasVisibleResult(match) && prediction && (
                                <span className="otherPredictionPoints">
                                  {calculateTotalPoints(
                                    matchForScoring(match),
                                    prediction,
                                  )}
                                  &nbsp;Punkte
                                </span>
                              )}
                            </>
                          ) : hasVisibleResult(match) ? (
                            <>
                              <span className="predictionStatus predictionStatusMissing predictionStatusNoTipUnlocked">
                                Kein Tipp abgegeben
                              </span>
                              <span className="otherPredictionPoints">
                                0&nbsp;Punkte
                              </span>
                            </>
                          ) : (
                            <span className="predictionStatus predictionStatusMissing predictionStatusNoTipUnlocked">
                              Kein Tipp abgegeben
                            </span>
                          )
                        ) : (
                          <span
                            className={`predictionStatus ${predictionStatusClass(prediction)}`}
                          >
                            {predictionStatusText(prediction)}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </details>
            )}

            {hasInsightsControl && (
              <button
                type="button"
                className={`matchOptimizerToggle ${optimizerOpen ? "matchOptimizerToggleActive" : ""}`}
                onClick={() => {
                  const nextOpen = !optimizerOpen;
                  setOptimizerOpen(nextOpen);
                  if (nextOpen) setAllPredictionsOpen(false);
                }}
                aria-expanded={optimizerOpen}
                aria-label="Bisherige Spiele anzeigen"
              >
                <span aria-hidden="true" />
              </button>
            )}
          </div>

          {hasInsightsControl && optimizerOpen && (
            <div className="matchOptimizerPanel">
              <div
                className="matchFifaRankings"
                aria-label="FIFA-Weltrangliste"
              >
                <div className="matchFifaRankingTeam">
                  {match.home_team && <Flag team={match.home_team} />}
                  <strong>Rang {homeRanking?.rank ?? "-"}</strong>
                  <span>
                    {homeRanking ? Math.round(homeRanking.points) : "-"} Punkte
                  </span>
                </div>
                <div className="matchFifaRankingTeam">
                  {match.away_team && <Flag team={match.away_team} />}
                  <strong>Rang {awayRanking?.rank ?? "-"}</strong>
                  <span>
                    {awayRanking ? Math.round(awayRanking.points) : "-"} Punkte
                  </span>
                </div>
              </div>

              {showOptimizerControl && optimizerPreview ? (
                <>
                  {(!optimizerPreview.hasOdds ||
                    !optimizerPreview.hasProbabilities) && (
                    <div className="matchOptimizerWarning">
                      {!optimizerPreview.hasOdds &&
                      !optimizerPreview.hasProbabilities
                        ? "Es fehlen noch Quoten und CSV-Daten."
                        : !optimizerPreview.hasOdds
                          ? "Es fehlen noch Quoten. Die Anzeige basiert nur auf CSV-Daten."
                          : "Es fehlen noch CSV-Daten. Die Anzeige basiert nur auf Quoten."}
                    </div>
                  )}

                  <div
                    className="matchOptimizerOutcomeBlock"
                    aria-label="Optimierer 1X2-Wahrscheinlichkeiten"
                  >
                    <div className="matchOptimizerOutcomeHeader">
                      <div>
                        {match.home_team && <Flag team={match.home_team} />}
                        <strong>
                          {formatOptimizerPercent(
                            optimizerPreview.outcomes.home,
                          )}
                        </strong>
                      </div>
                      <div>
                        <DrawFlag />
                        <strong>
                          {formatOptimizerPercent(
                            optimizerPreview.outcomes.draw,
                          )}
                        </strong>
                      </div>
                      <div>
                        {match.away_team && <Flag team={match.away_team} />}
                        <strong>
                          {formatOptimizerPercent(
                            optimizerPreview.outcomes.away,
                          )}
                        </strong>
                      </div>
                    </div>
                    <div className="matchOptimizerOutcomeBar">
                      <div
                        className="matchOptimizerOutcomeSegment matchOptimizerOutcomeHome"
                        style={{
                          flexGrow: Math.max(
                            optimizerPreview.outcomes.home,
                            0.01,
                          ),
                          backgroundColor: homeColor,
                        }}
                      />
                      <div
                        className="matchOptimizerOutcomeSegment matchOptimizerOutcomeDraw"
                        style={{
                          flexGrow: Math.max(
                            optimizerPreview.outcomes.draw,
                            0.01,
                          ),
                        }}
                      />
                      <div
                        className="matchOptimizerOutcomeSegment matchOptimizerOutcomeAway"
                        style={{
                          flexGrow: Math.max(
                            optimizerPreview.outcomes.away,
                            0.01,
                          ),
                          backgroundColor: awayColor,
                        }}
                      />
                    </div>
                  </div>

                  <div className="matchOptimizerTips">
                    {optimizerPreview.bestThree.map((tip, index) => (
                      <div
                        className="matchOptimizerTip matchOptimizerBestTip"
                        key={tip.label}
                      >
                        <span>#{index + 1}</span>
                        <strong>{tip.label}</strong>
                        <em>{formatExpectedPoints(tip.expectedPoints)} EP</em>
                      </div>
                    ))}
                  </div>

                  {optimizerPreview.alternativeDiffs.length > 0 && (
                    <div className="matchOptimizerTips matchOptimizerAltTips">
                      {optimizerPreview.alternativeDiffs.map((tip) => (
                        <div className="matchOptimizerTip" key={tip.tipKey}>
                          <strong>{tip.label}</strong>
                          <em>{formatExpectedPoints(tip.expectedPoints)} EP</em>
                        </div>
                      ))}
                    </div>
                  )}

                  {optimizerPreview.outcomePicks.length > 0 && (
                    <div className="matchOptimizerTips matchOptimizerAltTips">
                      {optimizerPreview.outcomePicks.map((pick) =>
                        pick.tip ? (
                          <div className="matchOptimizerTip" key={pick.key}>
                            <span className="predictionOverviewTipFlag predictionOverviewTipFlagStack">
                              <span className="predictionOverviewMainFlag">
                                {pick.side === "home" && <Flag team={match.home_team} />}
                                {pick.side === "away" && <Flag team={match.away_team} />}
                                {pick.side === "draw" && <DrawFlag />}
                              </span>
                              {pick.side === "draw" && pick.advanceSide === "home" && (
                                <span className="predictionOverviewAdvanceFlag">
                                  <Flag team={match.home_team} />
                                </span>
                              )}
                              {pick.side === "draw" && pick.advanceSide === "away" && (
                                <span className="predictionOverviewAdvanceFlag">
                                  <Flag team={match.away_team} />
                                </span>
                              )}
                            </span>
                            <span>{pick.title}</span>
                            <strong>{pick.tip.label}</strong>
                            <em>{formatExpectedPoints(pick.tip.expectedPoints)} EP</em>
                          </div>
                        ) : null,
                      )}
                    </div>
                  )}

                  <div className="matchOptimizerLists">
                    <div>
                      <h4>Wahrscheinlichste Ergebnisse</h4>
                      <div className="matchOptimizerList">
                        {optimizerPreview.topScores.map((score) => {
                          const outcome = scoreOutcomeClass(score);
                          return (
                            <div
                              className="matchOptimizerProbabilityRow"
                              key={score.label}
                            >
                              <span
                                className={`matchOptimizerScoreFlag matchOptimizerScoreFlag${outcome}`}
                              >
                                {outcome === "home" && (
                                  <Flag team={match.home_team} />
                                )}
                                {outcome === "away" && (
                                  <Flag team={match.away_team} />
                                )}
                                {outcome === "draw" && <DrawFlag />}
                              </span>
                              <strong>{score.label}</strong>
                              <span>
                                {formatOptimizerPercent(score.probability)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <h4>Wahrscheinlichste Tordifferenzen</h4>
                      <div className="matchOptimizerList">
                        {optimizerPreview.topDiffs.map((diff) => (
                          <div
                            className="matchOptimizerProbabilityRow matchOptimizerDiffRow"
                            key={diff.diff}
                          >
                            <span className="matchOptimizerScoreFlag">
                              {diff.diff > 0 && <Flag team={match.home_team} />}
                              {diff.diff < 0 && <Flag team={match.away_team} />}
                              {diff.diff === 0 && <DrawFlag />}
                            </span>
                            <strong>{formatSignedDiff(diff.diff)}</strong>
                            <span>
                              {formatOptimizerPercent(diff.probability)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              ) : showOptimizerControl ? (
                <p className="subtle smallText matchOptimizerEmpty">
                  Für dieses Spiel sind noch keine Optimierer-Daten gespeichert.
                </p>
              ) : null}

              <div className="matchOptimizerHistory">
                <h4>Bisherige WM-Spiele</h4>
                {historyMatches.length > 0 ? (
                  <div className="matchOptimizerList">
                    {historyMatches.map((previousMatch) => (
                      <div
                        className="matchOptimizerHistoryRow"
                        key={previousMatch.id}
                      >
                        <span
                          className={`matchOptimizerHistoryTeam ${previousMatch.leftIsCurrent ? "matchOptimizerHistoryTeamCurrent" : ""}`}
                        >
                          <Flag team={previousMatch.leftTeam} />
                          <span>{previousMatch.leftTeam?.name ?? "Offen"}</span>
                        </span>
                        <strong>
                          {previousMatch.leftScore}:{previousMatch.rightScore}
                        </strong>
                        <span
                          className={`matchOptimizerHistoryTeam matchOptimizerHistoryTeamAway ${previousMatch.rightIsCurrent ? "matchOptimizerHistoryTeamCurrent" : ""}`}
                        >
                          <span>
                            {previousMatch.rightTeam?.name ?? "Offen"}
                          </span>
                          <Flag team={previousMatch.rightTeam} />
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="subtle smallText matchOptimizerEmpty">
                    Noch keine Spiele gespielt.
                  </p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </article>
  );
}
