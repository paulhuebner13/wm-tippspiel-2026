"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  saveKnockoutTeamsInlineAction,
  saveResultInlineAction,
} from "@/app/actions";
import { Flag } from "@/components/Flag";
import { formatKickoff } from "@/lib/time";
import { getStageLabel, isKnockoutStage } from "@/lib/scoring";
import type { Match, Team } from "@/lib/types";

type ResultSaveStatus = "upcoming" | "expectedMissing" | "dirty" | "saved" | "partialTeamSaved";
type TeamSaveStatus = "idle" | "dirty" | "error";

function teamName(match: Match, side: "home" | "away"): string {
  if (side === "home")
    return match.home_team?.name ?? match.home_placeholder ?? "Offen";
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
  if (status === "partialTeamSaved") return "adminResultPartialTeamBlue";
  if (status === "expectedMissing") return "adminResultExpectedMissingRed";
  return "adminResultUpcomingGrey";
}

function isExpectedFinished(kickoffTime: string) {
  const kickoff = new Date(kickoffTime).getTime();
  if (Number.isNaN(kickoff)) return false;
  return Date.now() >= kickoff + 110 * 60 * 1000;
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
  teams,
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
  const [teamHomeId, setTeamHomeId] = useState(match.home_team_id ?? "");
  const [teamAwayId, setTeamAwayId] = useState(match.away_team_id ?? "");
  const [savedTeamHomeId, setSavedTeamHomeId] = useState(match.home_team_id ?? "");
  const [savedTeamAwayId, setSavedTeamAwayId] = useState(match.away_team_id ?? "");
  const [teamSaveState, setTeamSaveState] = useState<TeamSaveStatus>("idle");
  const lastRequestKey = useRef("");
  const lastTeamRequestKey = useRef("");

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
  const canEditTeamsManually = match.stage === "round_of_32";
  const teamsMatchSaved =
    teamHomeId === savedTeamHomeId && teamAwayId === savedTeamAwayId;
  const exactlyOneSavedTeam =
    canEditTeamsManually &&
    teamsMatchSaved &&
    Boolean(savedTeamHomeId || savedTeamAwayId) &&
    !(savedTeamHomeId && savedTeamAwayId) &&
    matchesSaved &&
    bothEmpty;

  const visualStatus: ResultSaveStatus =
    completeAndValid && matchesSaved
      ? "saved"
      : !teamsMatchSaved
        ? "dirty"
        : exactlyOneSavedTeam
          ? "partialTeamSaved"
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
    setTeamHomeId(match.home_team_id ?? "");
    setTeamAwayId(match.away_team_id ?? "");
    setSavedTeamHomeId(match.home_team_id ?? "");
    setSavedTeamAwayId(match.away_team_id ?? "");
    setTeamSaveState("idle");
  }, [
    match.id,
    match.home_score,
    match.away_score,
    match.winner_team_id,
    match.home_team_id,
    match.away_team_id,
  ]);

  useEffect(() => {
    if (matchesSaved) return;

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
  ]);

  const displayHomeTeam = canEditTeamsManually
    ? (teams.find((team) => team.id === teamHomeId) ?? match.home_team)
    : match.home_team;
  const displayAwayTeam = canEditTeamsManually
    ? (teams.find((team) => team.id === teamAwayId) ?? match.away_team)
    : match.away_team;
  const displayHomeName =
    displayHomeTeam?.name ?? match.home_placeholder ?? "Offen";
  const displayAwayName =
    displayAwayTeam?.name ?? match.away_placeholder ?? "Offen";

  useEffect(() => {
    if (!canEditTeamsManually || teamsMatchSaved) return;

    const requestHomeTeamId = teamHomeId || null;
    const requestAwayTeamId = teamAwayId || null;
    const requestKey = `${match.id}:${requestHomeTeamId ?? ""}:${requestAwayTeamId ?? ""}`;
    lastTeamRequestKey.current = requestKey;
    setTeamSaveState("dirty");

    const timeout = window.setTimeout(async () => {
      const result = await saveKnockoutTeamsInlineAction({
        matchId: match.id,
        homeTeamId: requestHomeTeamId,
        awayTeamId: requestAwayTeamId,
      });

      if (lastTeamRequestKey.current !== requestKey) return;

      if (result.ok) {
        setSavedTeamHomeId(result.homeTeamId ?? "");
        setSavedTeamAwayId(result.awayTeamId ?? "");
        setTeamSaveState("idle");
      } else {
        setTeamSaveState("error");
      }
    }, 325);

    return () => window.clearTimeout(timeout);
  }, [canEditTeamsManually, match.id, teamAwayId, teamHomeId, teamsMatchSaved]);

  return (
    <article
      className={`card adminCard adminResultCard ${statusClass(visualStatus)}`}
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

      {knockoutStage && (
        <div className="adminForm knockoutTeamsForm">
          {canEditTeamsManually ? (
            <>
              <label>
                Heimteam
                <select
                  value={teamHomeId}
                  onChange={(event) => setTeamHomeId(event.target.value)}
                >
                  <option value="">Offen lassen</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Auswärtsteam
                <select
                  value={teamAwayId}
                  onChange={(event) => setTeamAwayId(event.target.value)}
                >
                  <option value="">Offen lassen</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
              {teamSaveState === "error" && (
                <div className="resultAutoSaveHint">
                  Teams konnten nicht gespeichert werden.
                </div>
              )}
            </>
          ) : null}
        </div>
      )}
    </article>
  );
}
