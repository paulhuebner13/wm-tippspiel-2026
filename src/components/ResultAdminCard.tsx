"use client";

import { useEffect, useRef, useState } from "react";
import { saveResultInlineAction } from "@/app/actions";
import { Flag } from "@/components/Flag";
import { formatKickoff } from "@/lib/time";
import { getStageLabel, isKnockoutStage } from "@/lib/scoring";
import type { Match, Team } from "@/lib/types";

type ResultSaveStatus = "upcoming" | "expectedMissing" | "dirty" | "saved";

function teamName(match: Match, side: "home" | "away"): string {
  if (side === "home") {
    return match.home_team?.name ?? match.home_placeholder ?? "Offen";
  }
  return match.away_team?.name ?? match.away_placeholder ?? "Offen";
}

function scoreInputToNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

function statusClass(status: ResultSaveStatus) {
  if (status === "saved") return "adminResultSavedGreen";
  if (status === "dirty") return "adminResultDirtyYellow";
  if (status === "expectedMissing") return "adminResultExpectedMissingRed";
  return "adminResultUpcomingGrey";
}

function isExpectedFinished(kickoffTime: string) {
  const kickoff = new Date(kickoffTime).getTime();
  if (Number.isNaN(kickoff)) return false;
  return Date.now() >= kickoff + 110 * 60 * 1000;
}

function formatProvisionalSubmissionTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const datePart = new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Vienna",
  }).format(date);
  const timePart = new Intl.DateTimeFormat("de-AT", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Vienna",
  }).format(date);

  return `${datePart} um ${timePart}`;
}

function hasValidFinalResult(
  match: Match,
  home: number | null,
  away: number | null,
  winnerTeamId: string | null,
) {
  if (home === null || away === null) return false;
  if (!isKnockoutStage(match.stage)) return true;
  if (home !== away) return true;
  return (
    winnerTeamId === match.home_team_id || winnerTeamId === match.away_team_id
  );
}

export function ResultAdminCard({
  match,
  current,
}: {
  match: Match;
  teams: Team[];
  current: boolean;
}) {
  const knockoutStage = isKnockoutStage(match.stage);
  const [savedHomeScore, setSavedHomeScore] = useState<number | null>(
    match.home_score,
  );
  const [savedAwayScore, setSavedAwayScore] = useState<number | null>(
    match.away_score,
  );
  const [savedWinnerTeamId, setSavedWinnerTeamId] = useState<string | null>(
    match.winner_team_id ?? null,
  );

  const [homeScore, setHomeScore] = useState(
    match.home_score?.toString() ?? "",
  );
  const [awayScore, setAwayScore] = useState(
    match.away_score?.toString() ?? "",
  );
  const [winnerTeamId, setWinnerTeamId] = useState(match.winner_team_id ?? "");
  const [saveState, setSaveState] = useState<"idle" | "error">("idle");
  const lastRequestKey = useRef("");

  const homeNumber = scoreInputToNumber(homeScore);
  const awayNumber = scoreInputToNumber(awayScore);
  const homeEmpty = homeScore.trim() === "";
  const awayEmpty = awayScore.trim() === "";
  const bothEmpty = homeEmpty && awayEmpty && !winnerTeamId;
  const bothScoresFilled =
    !homeEmpty && !awayEmpty && homeNumber !== null && awayNumber !== null;
  const isDraw = bothScoresFilled && homeNumber === awayNumber;
  const showWinnerChoice = knockoutStage && isDraw;
  const normalizedWinnerTeamId = showWinnerChoice ? winnerTeamId || null : null;

  const matchesSaved =
    savedHomeScore === (homeEmpty ? null : homeNumber) &&
    savedAwayScore === (awayEmpty ? null : awayNumber) &&
    (savedWinnerTeamId ?? null) === normalizedWinnerTeamId;

  const completeAndValid = hasValidFinalResult(
    match,
    homeEmpty ? null : homeNumber,
    awayEmpty ? null : awayNumber,
    normalizedWinnerTeamId,
  );

  const expectedFinished = isExpectedFinished(match.kickoff_time);
  const hasOfficialResult = savedHomeScore !== null && savedAwayScore !== null;
  const hasProvisionalResult =
    !hasOfficialResult &&
    match.provisional_home_score !== null &&
    match.provisional_home_score !== undefined &&
    match.provisional_away_score !== null &&
    match.provisional_away_score !== undefined;
  const provisionalSubmissionTime = match.provisional_updated_at
    ? formatProvisionalSubmissionTime(match.provisional_updated_at)
    : null;

  const visualStatus: ResultSaveStatus =
    completeAndValid && matchesSaved
      ? "saved"
      : matchesSaved && bothEmpty
        ? expectedFinished
          ? "expectedMissing"
          : "upcoming"
        : "dirty";

  useEffect(() => {
    setSavedHomeScore(match.home_score);
    setSavedAwayScore(match.away_score);
    setSavedWinnerTeamId(match.winner_team_id ?? null);
    setHomeScore(match.home_score?.toString() ?? "");
    setAwayScore(match.away_score?.toString() ?? "");
    setWinnerTeamId(match.winner_team_id ?? "");
  }, [match.id, match.home_score, match.away_score, match.winner_team_id]);

  useEffect(() => {
    if (matchesSaved) return;
    if (showWinnerChoice && !winnerTeamId) return;

    const requestHomeScore = homeEmpty ? null : homeNumber;
    const requestAwayScore = awayEmpty ? null : awayNumber;
    const requestWinnerTeamId = normalizedWinnerTeamId;
    const requestKey = `${match.id}:${requestHomeScore ?? ""}:${requestAwayScore ?? ""}:${requestWinnerTeamId ?? ""}`;
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
        setSaveState("idle");
      } else {
        setSaveState("error");
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
    winnerTeamId,
  ]);

  const displayHomeTeam = match.home_team ?? null;
  const displayAwayTeam = match.away_team ?? null;
  const displayHomeName = teamName(match, "home");
  const displayAwayName = teamName(match, "away");

  return (
    <article
      className={`card adminCard adminResultCard ${statusClass(visualStatus)} ${hasProvisionalResult ? "adminResultProvisionalPurple" : ""}`}
      data-current-match={current ? "true" : undefined}
    >
      <div className="matchHeader">
        <div>
          <div className="matchTitleLine">
            <span>Spiel {match.match_number}</span>
            <span>
              {match.stage === "group" && match.group_name
                ? `Gruppe ${match.group_name}`
                : getStageLabel(match.stage)}
            </span>
          </div>
          <div className="kickoffLine">
            Spielbeginn: {formatKickoff(match.kickoff_time)}
          </div>
        </div>
      </div>

      <div className="resultAdminMain" aria-label="Resultat eintragen">
        <div className="predictionMainRow">
          <div className="predictionTeam predictionTeamHome">
            <span className="teamName">{displayHomeName}</span>
            <Flag team={displayHomeTeam} />
          </div>

          <div className="scoreInputs resultScoreInputs">
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={homeScore}
              placeholder={
                hasProvisionalResult
                  ? String(match.provisional_home_score ?? "")
                  : undefined
              }
              onChange={(event) => {
                setHomeScore(event.target.value);
                setSaveState("idle");
              }}
              aria-label={`${displayHomeName} Tore`}
            />
            <span>:</span>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={awayScore}
              placeholder={
                hasProvisionalResult
                  ? String(match.provisional_away_score ?? "")
                  : undefined
              }
              onChange={(event) => {
                setAwayScore(event.target.value);
                setSaveState("idle");
              }}
              aria-label={`${displayAwayName} Tore`}
            />
          </div>

          <div className="predictionTeam predictionTeamAway">
            <Flag team={displayAwayTeam} />
            <span className="teamName">{displayAwayName}</span>
          </div>
        </div>

        {hasProvisionalResult && provisionalSubmissionTime && (
          <div className="provisionalResultAttribution">
            Eingetragen von{" "}
            <strong>{match.provisional_submitted_by_name ?? "unbekannt"}</strong>{" "}
            am {provisionalSubmissionTime}
          </div>
        )}

        {showWinnerChoice && (
          <div className="advanceChoiceBox">
            <div className="advanceChoiceTitle">Wer kommt weiter?</div>
            <div className="advanceChoices">
              {displayHomeTeam && (
                <label
                  className={
                    winnerTeamId === displayHomeTeam.id
                      ? "advanceChoice selected"
                      : "advanceChoice"
                  }
                >
                  <input
                    type="radio"
                    name={`winnerTeamId-${match.id}`}
                    value={displayHomeTeam.id}
                    checked={winnerTeamId === displayHomeTeam.id}
                    onChange={(event) => {
                      setWinnerTeamId(event.target.value);
                      setSaveState("idle");
                    }}
                  />
                  <Flag team={displayHomeTeam} />
                  <span>{displayHomeTeam.name}</span>
                </label>
              )}
              {displayAwayTeam && (
                <label
                  className={
                    winnerTeamId === displayAwayTeam.id
                      ? "advanceChoice selected"
                      : "advanceChoice"
                  }
                >
                  <input
                    type="radio"
                    name={`winnerTeamId-${match.id}`}
                    value={displayAwayTeam.id}
                    checked={winnerTeamId === displayAwayTeam.id}
                    onChange={(event) => {
                      setWinnerTeamId(event.target.value);
                      setSaveState("idle");
                    }}
                  />
                  <Flag team={displayAwayTeam} />
                  <span>{displayAwayTeam.name}</span>
                </label>
              )}
            </div>
          </div>
        )}

        {saveState === "error" && (
          <div className="resultAutoSaveHint" aria-live="polite">
            Konnte nicht gespeichert werden.
          </div>
        )}
      </div>
    </article>
  );
}
