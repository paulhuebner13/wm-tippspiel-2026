import type { CSSProperties, ReactNode } from "react";
import { redirect } from "next/navigation";
import { Flag } from "@/components/Flag";
import { Nav } from "@/components/Nav";
import { LongPressReveal } from "@/components/LongPressReveal";
import { requireUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  calculateTotalPoints,
  getStageLabel,
  isKnockoutStage,
  STAGE_MULTIPLIERS,
} from "@/lib/scoring";
import { loadRankingContextForUser } from "@/lib/rankingPoints";
import { getFifaRanking } from "@/lib/fifaRankings";
import { runTipOptimizer, type OptimizerTipRow } from "@/lib/optimizer";
import type { Match, Prediction, Profile, Team } from "@/lib/types";

type MatchWithTeams = Match & {
  home_team?: Team | null;
  away_team?: Team | null;
};

type OptimizerInputRow = {
  match_id: string;
  odds_text?: string | null;
  probabilities_text?: string | null;
  max_goals?: number | null;
};

type ScoreOption = {
  home: number;
  away: number;
  probability: number;
};

type ActualScenario = {
  home: number;
  away: number;
  winnerTeamId: string | null;
};

type WinRow = {
  profile: Profile;
  currentPoints: number;
  winProbability: number;
  averagePoints: number;
  possible: boolean;
};

type TipCandidate = {
  row: OptimizerTipRow;
  winProbability: number;
};

type RivalTipRow = {
  profile: Profile;
  points: number;
  prediction: Prediction | null;
};

type RecommendationRow = {
  match: MatchWithTeams;
  best: TipCandidate;
  candidates: TipCandidate[];
  currentPrediction: Prediction | null;
  rivalTips: RivalTipRow[];
};

type SimulationContext = {
  currentUserId: string;
  profiles: Profile[];
  matches: MatchWithTeams[];
  predictionsByKey: Map<string, Prediction>;
  scorePoolsByMatchId: Map<string, ScoreOption[]>;
  fallbackTipsByMatchId: Map<string, OptimizerTipRow[]>;
  currentDefaultTipsByMatchId: Map<string, OptimizerTipRow>;
  startingPointsByProfileId: Map<string, number>;
  profileSkillById: Map<string, number>;
};

const BASE_RUNS = 5000;
const TIP_RUNS = 900;
const MAX_RECOMMENDED_MATCHES = 120;
const PIE_COLORS = [
  "#2563eb",
  "#16a34a",
  "#f97316",
  "#9333ea",
  "#dc2626",
  "#0891b2",
  "#a16207",
  "#4f46e5",
  "#be123c",
  "#0f766e",
];

const pageWide: CSSProperties = {
  maxWidth: 1180,
};

const gridTwo: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 14,
  alignItems: "stretch",
};

const mutedSmall: CSSProperties = {
  color: "var(--muted)",
  fontSize: 13,
};

const sectionTitle: CSSProperties = {
  margin: "0 0 10px",
  fontSize: 18,
};

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function formatPercent(value: number) {
  if (value > 0 && value < 0.005) return "<1 %";
  if (value > 0.995 && value < 1) return ">99 %";
  return `${(value * 100).toFixed(1).replace(".", ",")} %`;
}

function formatPoints(value: number) {
  return value.toFixed(1).replace(".", ",");
}

function predictionKey(userId: string, matchId: string) {
  return `${userId}:${matchId}`;
}

function simulatedHomeTeamId(match: MatchWithTeams) {
  return match.home_team_id ?? `virtual-home-${match.id}`;
}

function simulatedAwayTeamId(match: MatchWithTeams) {
  return match.away_team_id ?? `virtual-away-${match.id}`;
}

function matchWithSimulationTeamIds(match: MatchWithTeams): MatchWithTeams {
  return {
    ...match,
    home_team_id: simulatedHomeTeamId(match),
    away_team_id: simulatedAwayTeamId(match),
  };
}

function resultHomeScore(match: MatchWithTeams) {
  return match.home_score ?? match.provisional_home_score ?? null;
}

function resultAwayScore(match: MatchWithTeams) {
  return match.away_score ?? match.provisional_away_score ?? null;
}

function hasVisibleResult(match: MatchWithTeams) {
  return resultHomeScore(match) !== null && resultAwayScore(match) !== null;
}

function hasStarted(match: MatchWithTeams, now = Date.now()) {
  const kickoff = new Date(match.kickoff_time).getTime();
  if (Number.isNaN(kickoff)) return false;
  return kickoff <= now;
}

function hasCompletePrediction(
  match: MatchWithTeams,
  prediction: Prediction | undefined | null,
) {
  if (!prediction) return false;
  if (
    prediction.predicted_home_score === null ||
    prediction.predicted_away_score === null
  )
    return false;
  if (
    isKnockoutStage(match.stage) &&
    prediction.predicted_home_score === prediction.predicted_away_score &&
    !prediction.advance_team_id
  ) {
    return false;
  }
  return true;
}

function sideWinnerTeamId(
  match: MatchWithTeams,
  home: number,
  away: number,
  rng: () => number,
) {
  if (home > away) return simulatedHomeTeamId(match);
  if (away > home) return simulatedAwayTeamId(match);
  if (!isKnockoutStage(match.stage)) return null;
  const homeRank = match.home_team
    ? (getFifaRanking(match.home_team.name)?.rank ?? 80)
    : 80;
  const awayRank = match.away_team
    ? (getFifaRanking(match.away_team.name)?.rank ?? 80)
    : 80;
  const homeAdvanceProbability =
    match.home_team && match.away_team
      ? Math.max(0.35, Math.min(0.65, 0.5 + (awayRank - homeRank) / 180))
      : 0.5;
  return rng() <= homeAdvanceProbability
    ? simulatedHomeTeamId(match)
    : simulatedAwayTeamId(match);
}

function fixedScenario(match: MatchWithTeams): ActualScenario | null {
  if (!hasVisibleResult(match)) return null;
  const home = resultHomeScore(match) as number;
  const away = resultAwayScore(match) as number;
  let winnerTeamId =
    match.winner_team_id ?? match.provisional_winner_team_id ?? null;
  if (!winnerTeamId && home > away) winnerTeamId = simulatedHomeTeamId(match);
  if (!winnerTeamId && away > home) winnerTeamId = simulatedAwayTeamId(match);
  if (winnerTeamId === match.home_team_id)
    winnerTeamId = simulatedHomeTeamId(match);
  if (winnerTeamId === match.away_team_id)
    winnerTeamId = simulatedAwayTeamId(match);
  return { home, away, winnerTeamId };
}

function normalizeScorePool(pool: ScoreOption[]) {
  const filtered = pool.filter((score) => score.probability > 0);
  const total = filtered.reduce((sum, score) => sum + score.probability, 0);
  if (total <= 0) return [{ home: 1, away: 1, probability: 1 }];
  return filtered.map((score) => ({
    ...score,
    probability: score.probability / total,
  }));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function fallbackScorePool(match: MatchWithTeams): ScoreOption[] {
  const homeRank = match.home_team
    ? (getFifaRanking(match.home_team.name)?.rank ?? 80)
    : 80;
  const awayRank = match.away_team
    ? (getFifaRanking(match.away_team.name)?.rank ?? 80)
    : 80;
  const edge = clamp((awayRank - homeRank) / 130, -0.24, 0.24);
  const drawProbability = isKnockoutStage(match.stage) ? 0.27 : 0.25;
  const homeProbability = clamp(0.375 + edge, 0.15, 0.68);
  const awayProbability = clamp(
    1 - drawProbability - homeProbability,
    0.15,
    0.68,
  );

  return normalizeScorePool([
    { home: 1, away: 0, probability: homeProbability * 0.38 },
    { home: 2, away: 1, probability: homeProbability * 0.3 },
    { home: 2, away: 0, probability: homeProbability * 0.2 },
    { home: 3, away: 1, probability: homeProbability * 0.12 },
    { home: 0, away: 0, probability: drawProbability * 0.3 },
    { home: 1, away: 1, probability: drawProbability * 0.52 },
    { home: 2, away: 2, probability: drawProbability * 0.18 },
    { home: 0, away: 1, probability: awayProbability * 0.38 },
    { home: 1, away: 2, probability: awayProbability * 0.3 },
    { home: 0, away: 2, probability: awayProbability * 0.2 },
    { home: 1, away: 3, probability: awayProbability * 0.12 },
  ]);
}

function hasOptimizerInput(input: OptimizerInputRow | undefined) {
  return Boolean(
    input &&
    ((input.odds_text ?? "").trim() !== "" ||
      (input.probabilities_text ?? "").trim() !== ""),
  );
}

function optimizerRowsForMatch(
  match: MatchWithTeams,
  input: OptimizerInputRow | undefined,
  sourceBlendWeight: number,
) {
  if (!match.home_team || !match.away_team || !hasOptimizerInput(input))
    return [];
  const result = runTipOptimizer({
    oddsText: input?.odds_text ?? "",
    probabilitiesText: input?.probabilities_text ?? "",
    sourceMode: "odds",
    match,
    homeRating: null,
    awayRating: null,
    maxGoals: Number(input?.max_goals ?? 7),
    sourceBlendWeight,
  });
  return result;
}

function scorePoolForMatch(
  match: MatchWithTeams,
  input: OptimizerInputRow | undefined,
  sourceBlendWeight: number,
) {
  const result = optimizerRowsForMatch(match, input, sourceBlendWeight);
  if (
    !Array.isArray((result as any).possibleResults) ||
    (result as any).possibleResults.length === 0
  ) {
    return fallbackScorePool(match);
  }
  return normalizeScorePool(
    (result as ReturnType<typeof runTipOptimizer>).possibleResults.map(
      (score) => ({
        home: score.home,
        away: score.away,
        probability: score.probability,
      }),
    ),
  );
}

function candidateTipsForMatch(
  match: MatchWithTeams,
  input: OptimizerInputRow | undefined,
  sourceBlendWeight: number,
) {
  const result = optimizerRowsForMatch(match, input, sourceBlendWeight);
  const rows: OptimizerTipRow[] = [];
  if (Array.isArray((result as any).bestThree))
    rows.push(...(result as ReturnType<typeof runTipOptimizer>).bestThree);
  if (Array.isArray((result as any).alternativeDiffs))
    rows.push(
      ...(result as ReturnType<typeof runTipOptimizer>).alternativeDiffs,
    );
  if (Array.isArray((result as any).outcomePicks)) {
    for (const pick of (result as ReturnType<typeof runTipOptimizer>)
      .outcomePicks) {
      if (pick.tip) rows.push(pick.tip);
    }
  }

  const unique = new Map<string, OptimizerTipRow>();
  for (const row of rows)
    unique.set(
      row.tipKey ?? `${row.home}:${row.away}:${row.advanceSide ?? ""}`,
      row,
    );

  if (unique.size > 0) return Array.from(unique.values()).slice(0, 8);

  const fallbackScores: [number, number][] = isKnockoutStage(match.stage)
    ? [
        [1, 0],
        [0, 1],
        [1, 1],
        [2, 1],
        [1, 2],
        [0, 0],
        [2, 0],
        [0, 2],
      ]
    : [
        [1, 0],
        [1, 1],
        [0, 1],
        [2, 1],
        [1, 2],
        [0, 0],
        [2, 0],
        [0, 2],
      ];

  const fallback: OptimizerTipRow[] = [];
  for (const [home, away] of fallbackScores) {
    fallback.push(makeFallbackTip(match, home, away));
    if (home === away && isKnockoutStage(match.stage)) {
      fallback.push(makeFallbackTip(match, home, away, "away"));
    }
  }
  return fallback.slice(0, 10);
}

function makeFallbackTip(
  match: MatchWithTeams,
  home: number,
  away: number,
  forcedAdvanceSide?: "home" | "away",
): OptimizerTipRow {
  const draw = home === away;
  const advanceSide =
    draw && isKnockoutStage(match.stage)
      ? (forcedAdvanceSide ?? "home")
      : home > away
        ? "home"
        : away > home
          ? "away"
          : null;
  return {
    home,
    away,
    label: `${home}:${away}`,
    tipKey: `${home}:${away}:${advanceSide ?? ""}`,
    advanceSide,
    expectedPoints: 0,
    exactProbability: 0,
    diffProbability: 0,
    onlyOutcomeProbability: 0,
    totalOutcomeProbability: 0,
    knockoutAdvanceFullProbability: 0,
    knockoutAdvanceBonusProbability: 0,
    exactStillPossible: true,
  };
}

function sampleScore(pool: ScoreOption[], rng: () => number) {
  let draw = rng();
  for (const score of pool) {
    draw -= score.probability;
    if (draw <= 0) return score;
  }
  return pool[pool.length - 1];
}

function scenarioForMatch(
  match: MatchWithTeams,
  scorePoolsByMatchId: Map<string, ScoreOption[]>,
  rng: () => number,
): ActualScenario {
  const fixed = fixedScenario(match);
  if (fixed) return fixed;
  const pool = scorePoolsByMatchId.get(match.id) ?? fallbackScorePool(match);
  const score = sampleScore(pool, rng);
  return {
    home: score.home,
    away: score.away,
    winnerTeamId: sideWinnerTeamId(match, score.home, score.away, rng),
  };
}

function predictionFromTip(
  match: MatchWithTeams,
  profileId: string,
  row: OptimizerTipRow,
): Prediction {
  let advanceTeamId: string | null = null;
  if (row.home === row.away && isKnockoutStage(match.stage)) {
    advanceTeamId =
      row.advanceSide === "home"
        ? simulatedHomeTeamId(match)
        : simulatedAwayTeamId(match);
  }

  return {
    id: `sim-${profileId}-${match.id}-${row.tipKey}`,
    user_id: profileId,
    match_id: match.id,
    predicted_home_score: row.home,
    predicted_away_score: row.away,
    advance_team_id: advanceTeamId,
  };
}

function sampleTip(rows: OptimizerTipRow[], rng: () => number, skill = 0.55) {
  const available =
    rows.length > 0
      ? rows
      : [makeFallbackTip({ stage: "group" } as MatchWithTeams, 1, 1)];
  const normalizedSkill = clamp(skill, 0.15, 0.95);
  const exponent = 0.65 + normalizedSkill * 2.1;
  const weights = available.map(
    (_row, index) => 1 / Math.pow(index + 1, exponent),
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let draw = rng() * total;
  for (let i = 0; i < available.length; i++) {
    draw -= weights[i];
    if (draw <= 0) return available[i];
  }
  return available[0];
}

function predictionForProfile(
  context: SimulationContext,
  profile: Profile,
  match: MatchWithTeams,
  rng: () => number,
  currentOverrides: Map<string, OptimizerTipRow>,
) {
  if (profile.id === context.currentUserId && currentOverrides.has(match.id)) {
    const override = currentOverrides.get(match.id);
    return override ? predictionFromTip(match, profile.id, override) : null;
  }

  const existing = context.predictionsByKey.get(
    predictionKey(profile.id, match.id),
  );
  if (hasCompletePrediction(match, existing)) return existing as Prediction;
  if (hasVisibleResult(match)) return null;

  if (profile.id === context.currentUserId) {
    const fallback = context.currentDefaultTipsByMatchId.get(match.id);
    return fallback ? predictionFromTip(match, profile.id, fallback) : null;
  }

  const rows = context.fallbackTipsByMatchId.get(match.id) ?? [];
  const sampled = sampleTip(
    rows,
    rng,
    context.profileSkillById.get(profile.id) ?? 0.55,
  );
  return predictionFromTip(match, profile.id, sampled);
}

function runSimulation(
  context: SimulationContext,
  runs: number,
  seedLabel: string,
  currentOverrides = new Map<string, OptimizerTipRow>(),
) {
  const winShares = new Map(context.profiles.map((profile) => [profile.id, 0]));
  const pointSums = new Map(context.profiles.map((profile) => [profile.id, 0]));
  const rng = seededRandom(hashString(seedLabel));

  for (let run = 0; run < runs; run++) {
    const totals = new Map(
      context.profiles.map((profile) => [
        profile.id,
        context.startingPointsByProfileId.get(profile.id) ?? 0,
      ]),
    );

    for (const match of context.matches) {
      const scenario = scenarioForMatch(
        match,
        context.scorePoolsByMatchId,
        rng,
      );
      const scoringMatch = matchWithSimulationTeamIds(match);
      const simulatedMatch: Match = {
        ...scoringMatch,
        home_score: scenario.home,
        away_score: scenario.away,
        winner_team_id: scenario.winnerTeamId,
        provisional_home_score: null,
        provisional_away_score: null,
        provisional_winner_team_id: null,
        is_finished: true,
      };

      for (const profile of context.profiles) {
        const prediction = predictionForProfile(
          context,
          profile,
          match,
          rng,
          currentOverrides,
        );
        if (!prediction) continue;
        totals.set(
          profile.id,
          (totals.get(profile.id) ?? 0) +
            calculateTotalPoints(simulatedMatch, prediction),
        );
      }
    }

    let bestScore = -Infinity;
    for (const score of totals.values()) bestScore = Math.max(bestScore, score);
    const winners = context.profiles.filter(
      (profile) => (totals.get(profile.id) ?? 0) === bestScore,
    );
    const share = winners.length > 0 ? 1 / winners.length : 0;

    for (const winner of winners) {
      winShares.set(winner.id, (winShares.get(winner.id) ?? 0) + share);
    }

    for (const profile of context.profiles) {
      pointSums.set(
        profile.id,
        (pointSums.get(profile.id) ?? 0) + (totals.get(profile.id) ?? 0),
      );
    }
  }

  return {
    winProbabilityByProfileId: new Map(
      context.profiles.map((profile) => [
        profile.id,
        (winShares.get(profile.id) ?? 0) / runs,
      ]),
    ),
    averagePointsByProfileId: new Map(
      context.profiles.map((profile) => [
        profile.id,
        (pointSums.get(profile.id) ?? 0) / runs,
      ]),
    ),
  };
}

function maxPointsForMatch(match: MatchWithTeams) {
  const maxBase = isKnockoutStage(match.stage) ? 10 : 7;
  return maxBase * STAGE_MULTIPLIERS[match.stage];
}

function maximumRemainingPoints(matches: MatchWithTeams[]) {
  return matches.reduce((sum, match) => {
    if (hasVisibleResult(match)) return sum;
    return sum + maxPointsForMatch(match);
  }, 0);
}

function profileSkillFor(
  profile: Profile,
  matches: MatchWithTeams[],
  predictionsByKey: Map<string, Prediction>,
) {
  let earned = 0;
  let possible = 0;

  for (const match of matches) {
    const fixed = fixedScenario(match);
    if (!fixed) continue;
    const prediction = predictionsByKey.get(
      predictionKey(profile.id, match.id),
    );
    if (!hasCompletePrediction(match, prediction)) continue;
    const scoringMatch = matchWithSimulationTeamIds(match);
    earned += calculateTotalPoints(
      {
        ...scoringMatch,
        home_score: fixed.home,
        away_score: fixed.away,
        winner_team_id: fixed.winnerTeamId,
        provisional_home_score: null,
        provisional_away_score: null,
        provisional_winner_team_id: null,
        is_finished: true,
      },
      prediction as Prediction,
    );
    possible += maxPointsForMatch(match);
  }

  if (possible <= 0) return 0.55;
  return clamp(earned / possible, 0.15, 0.95);
}

function buildRecommendations(
  context: SimulationContext,
  futureMatches: MatchWithTeams[],
  topRivalProfiles: Profile[],
) {
  const currentUserId = context.currentUserId;
  const openMatches = futureMatches
    .filter((match) => !hasVisibleResult(match))
    .filter((match) => !hasStarted(match))
    .slice(0, MAX_RECOMMENDED_MATCHES);

  return openMatches
    .map((match) => {
      const candidates = context.fallbackTipsByMatchId.get(match.id) ?? [];
      const evaluated = candidates
        .slice(0, 6)
        .map((row) => {
          const overrides = new Map<string, OptimizerTipRow>([[match.id, row]]);
          const result = runSimulation(
            context,
            TIP_RUNS,
            `tip-${match.id}-${row.tipKey}`,
            overrides,
          );
          return {
            row,
            winProbability:
              result.winProbabilityByProfileId.get(currentUserId) ?? 0,
          };
        })
        .sort((a, b) => b.winProbability - a.winProbability);

      return {
        match,
        best: evaluated[0],
        candidates: evaluated.slice(0, 3),
        currentPrediction:
          context.predictionsByKey.get(
            predictionKey(currentUserId, match.id),
          ) ?? null,
        rivalTips: topRivalProfiles.map((profile) => ({
          profile,
          points: context.startingPointsByProfileId.get(profile.id) ?? 0,
          prediction:
            context.predictionsByKey.get(predictionKey(profile.id, match.id)) ??
            null,
        })),
      };
    })
    .filter((row): row is RecommendationRow => Boolean(row.best));
}

function tipOutcomeSide(row: OptimizerTipRow) {
  if (row.home > row.away) return "home";
  if (row.away > row.home) return "away";
  return "draw";
}

function teamLabel(team: Team | null | undefined, placeholder?: string | null) {
  return team?.name ?? placeholder ?? "Offen";
}

function TeamMini({
  team,
  placeholder,
}: {
  team?: Team | null;
  placeholder?: string | null;
}) {
  return (
    <span className="chanceTeamMini">
      <span className="chanceTeamMiniFlag">
        {team ? <Flag team={team} /> : <span className="chanceEmptyFlag">?</span>}
      </span>
      <span className="chanceTeamMiniName">{teamLabel(team, placeholder)}</span>
    </span>
  );
}

function DrawAdvanceFlag({ team }: { team?: Team | null }) {
  return (
    <span className="chanceDrawStack" aria-label="Unentschieden">
      <span className="drawFlagMini chanceDrawFlagLarge">Draw</span>
      {team && (
        <span className="chanceDrawAdvanceFlag">
          <Flag team={team} />
        </span>
      )}
    </span>
  );
}

function ResultFlag({
  match,
  outcomeSide,
  advanceTeam,
}: {
  match: MatchWithTeams;
  outcomeSide: "home" | "away" | "draw" | null;
  advanceTeam?: Team | null;
}) {
  if (outcomeSide === "home") {
    return match.home_team ? <Flag team={match.home_team} /> : <span className="chanceEmptyFlag">?</span>;
  }
  if (outcomeSide === "away") {
    return match.away_team ? <Flag team={match.away_team} /> : <span className="chanceEmptyFlag">?</span>;
  }
  if (outcomeSide === "draw") {
    return <DrawAdvanceFlag team={advanceTeam} />;
  }
  return <span className="chanceEmptyFlag">?</span>;
}

function TipBadge({
  match,
  row,
  compact = false,
}: {
  match: MatchWithTeams;
  row: OptimizerTipRow;
  compact?: boolean;
}) {
  const outcomeSide = tipOutcomeSide(row);
  const advanceTeam =
    row.advanceSide === "home"
      ? match.home_team
      : row.advanceSide === "away"
        ? match.away_team
        : null;

  return (
    <span className={`chanceTipBadge ${compact ? "chanceTipBadgeCompact" : ""}`}>
      <strong className="chanceTipScoreOnly">
        {row.home}:{row.away}
      </strong>
      <span className="chanceTipResultFlag">
        <ResultFlag
          match={match}
          outcomeSide={outcomeSide}
          advanceTeam={advanceTeam}
        />
      </span>
    </span>
  );
}

function predictionOutcomeSide(prediction: Prediction) {
  const home = prediction.predicted_home_score;
  const away = prediction.predicted_away_score;
  if (home === null || away === null) return null;
  if (home > away) return "home";
  if (away > home) return "away";
  return "draw";
}

function PredictionBadge({
  match,
  prediction,
  compact = false,
}: {
  match: MatchWithTeams;
  prediction: Prediction | null;
  compact?: boolean;
}) {
  if (!prediction) return <em className="chanceNoTip">kein Tipp</em>;
  if (
    prediction.predicted_home_score === null ||
    prediction.predicted_away_score === null
  ) {
    return <em className="chanceNoTip">unvollständig</em>;
  }

  const outcomeSide = predictionOutcomeSide(prediction);
  const advanceTeam =
    prediction.advance_team_id === match.home_team_id
      ? match.home_team
      : prediction.advance_team_id === match.away_team_id
        ? match.away_team
        : null;

  return (
    <span className={`chanceTipBadge ${compact ? "chanceTipBadgeCompact" : ""}`}>
      <strong className="chanceTipScoreOnly">
        {prediction.predicted_home_score}:{prediction.predicted_away_score}
      </strong>
      <span className="chanceTipResultFlag">
        <ResultFlag
          match={match}
          outcomeSide={outcomeSide}
          advanceTeam={advanceTeam}
        />
      </span>
    </span>
  );
}

function TipRow({
  label,
  children,
  strong = false,
}: {
  label: string;
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className={strong ? "chanceTipRow chanceTipRowStrong" : "chanceTipRow"}>
      <span className="chanceTipRowLabel">{label}</span>
      <span className="chanceTipRowValue">{children}</span>
    </div>
  );
}

function MatchLabel({ match }: { match: MatchWithTeams }) {
  return (
    <div className="chanceMatchMini">
      <TeamMini team={match.home_team} placeholder={match.home_placeholder} />
      <span className="chanceMatchVs">vs</span>
      <TeamMini team={match.away_team} placeholder={match.away_placeholder} />
    </div>
  );
}

function PieChart({ rows }: { rows: WinRow[] }) {
  const relevantRows = rows.filter((row) => row.winProbability > 0.0005);
  let start = 0;
  const segments = relevantRows.map((row, index) => {
    const degrees = row.winProbability * 360;
    const segment = `${PIE_COLORS[index % PIE_COLORS.length]} ${start}deg ${start + degrees}deg`;
    start += degrees;
    return segment;
  });
  const background =
    segments.length > 0 ? `conic-gradient(${segments.join(", ")})` : "#e5e7eb";

  return (
    <div style={{ display: "grid", gap: 16, justifyItems: "center" }}>
      <div
        aria-label="Gewinnwahrscheinlichkeiten"
        style={{
          width: "min(100%, 280px)",
          aspectRatio: "1 / 1",
          borderRadius: "999px",
          background,
          boxShadow: "inset 0 0 0 12px rgba(255,255,255,0.72), var(--shadow)",
        }}
      />
      <div style={{ display: "grid", gap: 8, width: "100%" }}>
        {relevantRows.map((row, index) => (
          <div
            key={row.profile.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              fontSize: 14,
            }}
          >
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: PIE_COLORS[index % PIE_COLORS.length],
                  display: "inline-block",
                }}
              />
              {row.profile.username}
            </span>
            <strong>{formatPercent(row.winProbability)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function ChancenPage() {
  const user = await requireUser();
  if (!user.is_admin) redirect("/matches");

  const rankingContext = await loadRankingContextForUser<MatchWithTeams>(
    user,
    `
    *,
    home_team:teams!matches_home_team_id_fkey(*),
    away_team:teams!matches_away_team_id_fkey(*)
  `,
  );
  const visibleProfiles = rankingContext.profiles;
  const matches = rankingContext.matches;
  const predictions = rankingContext.predictions;
  const currentPoints = rankingContext.pointsByProfileId;

  const [optimizerInputsResponse, optimizerSettingsResponse] =
    await Promise.all([
      supabaseAdmin
        .from("tip_optimizer_inputs")
        .select("match_id, odds_text, probabilities_text, max_goals"),
      supabaseAdmin
        .from("tip_optimizer_settings")
        .select("source_blend_weight")
        .eq("id", 1)
        .maybeSingle(),
    ]);

  const optimizerInputs = (optimizerInputsResponse.data ??
    []) as OptimizerInputRow[];
  const sourceBlendWeight = Number(
    optimizerSettingsResponse.data?.source_blend_weight ?? 0.5,
  );
  const optimizerInputByMatchId = new Map(
    optimizerInputs.map((input) => [input.match_id, input]),
  );
  const predictionsByKey = new Map(
    predictions.map((prediction) => [
      predictionKey(prediction.user_id, prediction.match_id),
      prediction,
    ]),
  );
  const unresolvedMatches = matches.filter((match) => !hasVisibleResult(match));
  const remainingMax = maximumRemainingPoints(matches);
  const profileSkillById = new Map(
    visibleProfiles.map((profile) => [
      profile.id,
      profileSkillFor(profile, matches, predictionsByKey),
    ]),
  );
  const currentLeader = Math.max(...Array.from(currentPoints.values()), 0);
  const contenderProfiles = visibleProfiles.filter((profile) => {
    if (profile.id === user.id) return true;
    return (currentPoints.get(profile.id) ?? 0) + remainingMax >= currentLeader;
  });
  const removedCount = visibleProfiles.length - contenderProfiles.length;
  const scorePoolsByMatchId = new Map<string, ScoreOption[]>();
  const fallbackTipsByMatchId = new Map<string, OptimizerTipRow[]>();
  const currentDefaultTipsByMatchId = new Map<string, OptimizerTipRow>();

  for (const match of unresolvedMatches) {
    const input = optimizerInputByMatchId.get(match.id);
    scorePoolsByMatchId.set(
      match.id,
      scorePoolForMatch(match, input, sourceBlendWeight),
    );
    const candidates = candidateTipsForMatch(match, input, sourceBlendWeight);
    fallbackTipsByMatchId.set(match.id, candidates);
    if (candidates[0]) currentDefaultTipsByMatchId.set(match.id, candidates[0]);
  }

  const context: SimulationContext = {
    currentUserId: user.id,
    profiles: contenderProfiles,
    matches: unresolvedMatches,
    predictionsByKey,
    scorePoolsByMatchId,
    fallbackTipsByMatchId,
    currentDefaultTipsByMatchId,
    startingPointsByProfileId: currentPoints,
    profileSkillById,
  };

  const baseline = runSimulation(context, BASE_RUNS, "baseline-tipgame-wins");
  const rows: WinRow[] = contenderProfiles
    .map((profile) => ({
      profile,
      currentPoints: currentPoints.get(profile.id) ?? 0,
      winProbability: baseline.winProbabilityByProfileId.get(profile.id) ?? 0,
      averagePoints: baseline.averagePointsByProfileId.get(profile.id) ?? 0,
      possible: true,
    }))
    .sort(
      (a, b) =>
        b.winProbability - a.winProbability ||
        b.currentPoints - a.currentPoints ||
        a.profile.username.localeCompare(b.profile.username, "de-AT"),
    );
  const topRivalProfiles = visibleProfiles
    .filter((profile) => profile.id !== user.id)
    .sort(
      (a, b) =>
        (currentPoints.get(b.id) ?? 0) - (currentPoints.get(a.id) ?? 0) ||
        a.username.localeCompare(b.username, "de-AT"),
    )
    .slice(0, 5);
  const recommendations = buildRecommendations(
    context,
    matches,
    topRivalProfiles,
  );
  const ownRow = rows.find((row) => row.profile.id === user.id);

  return (
    <>
      <Nav user={user} />
      <main className="page" style={pageWide}>
        <style>{`
          .chanceRecommendationList {
            display: grid;
            gap: 10px;
          }

          .chanceRecommendationCard {
            display: grid;
            gap: 10px;
            padding: 12px;
            border: 1px solid var(--line);
            border-radius: 18px;
            background: rgba(107, 114, 128, 0.06);
            user-select: none;
            -webkit-user-select: none;
            touch-action: manipulation;
          }

          .chanceRecommendationMain {
            display: grid;
            grid-template-columns: minmax(210px, 1fr) minmax(230px, 0.9fr) auto;
            gap: 12px;
            align-items: center;
          }

          .chanceRecommendationMatch {
            display: grid;
            gap: 6px;
            min-width: 0;
          }

          .chanceRecommendationMeta {
            color: var(--muted);
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
          }

          .chanceTipTabs {
            display: grid;
            gap: 7px;
            min-width: 0;
          }

          .chanceTipRow {
            display: grid;
            grid-template-columns: 72px 1fr;
            align-items: center;
            gap: 8px;
            padding: 7px 8px;
            border: 1px solid var(--line);
            border-radius: 13px;
            background: rgba(107, 114, 128, 0.07);
          }

          .chanceTipRowStrong {
            border-color: rgba(22, 101, 52, 0.24);
            background: rgba(22, 163, 74, 0.06);
          }

          .chanceTipRowLabel {
            color: var(--muted);
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.04em;
          }

          .chanceTipRowValue {
            display: flex;
            justify-content: flex-end;
            min-width: 0;
          }

          .chanceRecommendationChance {
            display: grid;
            gap: 2px;
            justify-items: end;
            min-width: 68px;
            color: var(--muted);
            font-size: 11px;
          }

          .chanceRecommendationChance strong {
            color: var(--text);
            font-size: 15px;
          }

          .chanceMatchMini {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
            align-items: start;
            gap: 10px;
            max-width: 440px;
          }

          .chanceMatchVs {
            color: var(--muted);
            font-size: 11px;
            font-weight: 900;
            text-transform: uppercase;
            padding-top: 4px;
          }

          .chanceTeamMini {
            display: grid;
            justify-items: center;
            align-items: start;
            gap: 5px;
            min-width: 0;
          }

          .chanceTeamMiniFlag {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 24px;
          }

          .chanceTeamMiniName {
            width: 100%;
            overflow-wrap: anywhere;
            font-size: 12px;
            line-height: 1.12;
            color: var(--text);
            text-align: center;
            font-weight: 700;
          }

          .chanceEmptyFlag {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 26px;
            height: 18px;
            border-radius: 5px;
            background: rgba(107, 114, 128, 0.14);
            color: var(--muted);
            font-size: 11px;
            font-weight: 800;
          }

          .chanceTipBadge {
            display: inline-grid;
            grid-template-columns: auto auto;
            align-items: center;
            justify-content: end;
            gap: 9px;
            min-width: 86px;
          }

          .chanceTipScoreOnly {
            font-size: 18px;
            line-height: 1;
            white-space: nowrap;
            font-variant-numeric: tabular-nums;
          }

          .chanceTipResultFlag {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 34px;
          }

          .chanceTipBadgeCompact {
            gap: 7px;
            min-width: 74px;
          }

          .chanceTipBadgeCompact .chanceTipScoreOnly {
            font-size: 15px;
          }

          .chanceTipBadgeCompact .chanceTipResultFlag {
            min-width: 30px;
          }

          .chanceDrawStack {
            position: relative;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 42px;
            min-width: 42px;
            height: 26px;
          }

          .chanceDrawFlagLarge {
            width: 42px;
            min-width: 42px;
            height: 26px;
            flex: 0 0 42px;
            padding: 0;
            border-radius: 2px;
            font-size: 8px;
            line-height: 1;
          }

          .chanceDrawAdvanceFlag {
            position: absolute;
            right: -9px;
            bottom: -6px;
            width: 18px;
            height: 13px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 1px;
            border-radius: 3px;
            background: var(--card);
            box-shadow: 0 0 0 1px var(--line);
          }

          .chanceDrawAdvanceFlag .flagFrame,
          .chanceDrawAdvanceFlag .flagPlaceholder {
            width: 16px;
            min-width: 16px;
            height: 11px;
            flex: 0 0 16px;
          }

          .chanceDrawAdvanceFlag .flagImage,
          .chanceDrawAdvanceFlag img {
            width: auto;
            height: auto;
            max-width: 16px;
            max-height: 11px;
            object-fit: contain;
            border-radius: 1px;
          }

          .chanceNoTip {
            color: var(--muted);
            font-size: 12px;
            justify-self: end;
          }

          .chanceRivalReveal {
            margin-top: 2px;
            display: grid;
            gap: 8px;
          }

          .longPressRevealClose {
            justify-self: end;
            padding: 7px 10px;
            border-radius: 999px;
            font-size: 12px;
            background: rgba(107, 114, 128, 0.14);
            color: var(--text);
          }

          .chanceRivalList {
            display: grid;
            gap: 7px;
            padding: 8px;
            border-radius: 15px;
            background: rgba(107, 114, 128, 0.06);
          }

          .chanceRivalRow {
            display: grid;
            grid-template-columns: minmax(90px, 1fr) auto minmax(94px, auto);
            gap: 8px;
            align-items: center;
            padding: 7px 8px;
            border-radius: 12px;
            background: rgba(107, 114, 128, 0.07);
            font-size: 12px;
          }

          .chanceRivalName {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-weight: 800;
          }

          .chanceRivalPoints {
            color: var(--muted);
            font-size: 11px;
            white-space: nowrap;
          }

          @media (max-width: 760px) {
            .chanceRecommendationCard {
              padding: 11px;
              border-radius: 16px;
            }

            .chanceRecommendationMain {
              grid-template-columns: 1fr;
              gap: 10px;
            }

            .chanceRecommendationChance {
              display: flex;
              justify-content: space-between;
              align-items: baseline;
              min-width: 0;
              padding-top: 2px;
            }

            .chanceRecommendationChance strong {
              font-size: 14px;
            }

            .chanceMatchMini {
              max-width: none;
              gap: 7px;
            }

            .chanceTeamMiniName {
              font-size: 11px;
            }

            .chanceTipRow {
              grid-template-columns: 64px 1fr;
              padding: 7px;
            }

            .chanceTipBadge {
              min-width: 78px;
            }

            .chanceRivalRow {
              grid-template-columns: minmax(0, 1fr) auto minmax(82px, auto);
              padding: 7px;
            }
          }
        `}</style>
        <div style={{ marginBottom: 16 }}>
          <h1>Tippspiel-Chancen</h1>
        </div>

        <section style={gridTwo}>
          <article className="card">
            <h2 style={sectionTitle}>Wer gewinnt?</h2>
            <PieChart rows={rows} />
          </article>

          <article className="card">
            <h2 style={sectionTitle}>Simulationstabelle</h2>
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 14,
                }}
              >
                <thead>
                  <tr style={{ color: "var(--muted)", textAlign: "left" }}>
                    <th style={{ padding: "8px 6px" }}>Spieler</th>
                    <th style={{ padding: "8px 6px", textAlign: "right" }}>
                      Chance
                    </th>
                    <th style={{ padding: "8px 6px", textAlign: "right" }}>
                      Ranking-Start
                    </th>
                    <th style={{ padding: "8px 6px", textAlign: "right" }}>
                      Ø Ende
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.profile.id}
                      style={{ borderTop: "1px solid var(--line)" }}
                    >
                      <td
                        style={{
                          padding: "9px 6px",
                          fontWeight: row.profile.id === user.id ? 800 : 500,
                        }}
                      >
                        {row.profile.id === user.id
                          ? `Du (${row.profile.username})`
                          : row.profile.username}
                      </td>
                      <td
                        style={{
                          padding: "9px 6px",
                          textAlign: "right",
                          fontWeight: 800,
                        }}
                      >
                        {formatPercent(row.winProbability)}
                      </td>
                      <td style={{ padding: "9px 6px", textAlign: "right" }}>
                        {row.currentPoints}
                      </td>
                      <td style={{ padding: "9px 6px", textAlign: "right" }}>
                        {formatPoints(row.averagePoints)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {ownRow && (
              <p style={{ ...mutedSmall, marginBottom: 0 }}>
                Deine aktuelle simulierte Gewinnchance:{" "}
                <strong>{formatPercent(ownRow.winProbability)}</strong>.
              </p>
            )}
          </article>
        </section>

        <section className="card" style={{ marginTop: 14 }}>
          <h2 style={sectionTitle}>Gewinnchance maximieren</h2>
          {recommendations.length === 0 ? (
            <p className="subtle">
              Aktuell gibt es keine noch nicht gestarteten Spiele.
            </p>
          ) : (
            <div className="chanceRecommendationList">
              {recommendations.map((recommendation) => {
                const reveal = (
                  <div className="chanceRivalList">
                    {recommendation.rivalTips.map((rival) => (
                      <div key={rival.profile.id} className="chanceRivalRow">
                        <span className="chanceRivalName">{rival.profile.username}</span>
                        <span className="chanceRivalPoints">{rival.points} P</span>
                        <PredictionBadge
                          match={recommendation.match}
                          prediction={rival.prediction}
                          compact
                        />
                      </div>
                    ))}
                  </div>
                );

                return (
                  <LongPressReveal
                    key={recommendation.match.id}
                    className="chanceRecommendationCard"
                    revealClassName="chanceRivalReveal"
                    reveal={reveal}
                  >
                    <div className="chanceRecommendationMain">
                      <div className="chanceRecommendationMatch">
                        <MatchLabel match={recommendation.match} />
                        <span className="chanceRecommendationMeta">
                          <span>#{recommendation.match.match_number}</span>
                          <span>{getStageLabel(recommendation.match.stage)}</span>
                        </span>
                      </div>

                      <div className="chanceTipTabs">
                        <TipRow label="Aktuell">
                          <PredictionBadge
                            match={recommendation.match}
                            prediction={recommendation.currentPrediction}
                            compact
                          />
                        </TipRow>
                        <TipRow label="Optimal" strong>
                          <TipBadge
                            match={recommendation.match}
                            row={recommendation.best.row}
                            compact
                          />
                        </TipRow>
                      </div>

                      <span className="chanceRecommendationChance">
                        <span>Chance</span>
                        <strong>{formatPercent(recommendation.best.winProbability)}</strong>
                      </span>
                    </div>
                  </LongPressReveal>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
