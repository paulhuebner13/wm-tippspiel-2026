import type { CSSProperties } from 'react';
import { redirect } from 'next/navigation';
import { Flag } from '@/components/Flag';
import { Nav } from '@/components/Nav';
import { requireUser } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getVisibleProfilesForUser } from '@/lib/visibility';
import { calculateTotalPoints, getStageLabel, isKnockoutStage, STAGE_MULTIPLIERS } from '@/lib/scoring';
import { getFifaRanking } from '@/lib/fifaRankings';
import { runTipOptimizer, type OptimizerTipRow } from '@/lib/optimizer';
import type { Match, Prediction, Profile, Team } from '@/lib/types';

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

type RecommendationRow = {
  match: MatchWithTeams;
  best: TipCandidate;
  candidates: TipCandidate[];
};

type SimulationContext = {
  currentUserId: string;
  profiles: Profile[];
  matches: MatchWithTeams[];
  predictionsByKey: Map<string, Prediction>;
  scorePoolsByMatchId: Map<string, ScoreOption[]>;
  fallbackTipsByMatchId: Map<string, OptimizerTipRow[]>;
  currentDefaultTipsByMatchId: Map<string, OptimizerTipRow>;
};

const BASE_RUNS = 2500;
const TIP_RUNS = 700;
const MAX_RECOMMENDED_MATCHES = 24;
const PIE_COLORS = [
  '#2563eb',
  '#16a34a',
  '#f97316',
  '#9333ea',
  '#dc2626',
  '#0891b2',
  '#a16207',
  '#4f46e5',
  '#be123c',
  '#0f766e',
];

const pageWide: CSSProperties = {
  maxWidth: 1180,
};

const gridTwo: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 14,
  alignItems: 'stretch',
};

const mutedSmall: CSSProperties = {
  color: 'var(--muted)',
  fontSize: 13,
};

const sectionTitle: CSSProperties = {
  margin: '0 0 10px',
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
  if (value > 0 && value < 0.005) return '<1 %';
  if (value > 0.995 && value < 1) return '>99 %';
  return `${(value * 100).toFixed(1).replace('.', ',')} %`;
}

function formatPoints(value: number) {
  return value.toFixed(1).replace('.', ',');
}

function predictionKey(userId: string, matchId: string) {
  return `${userId}:${matchId}`;
}

function hasResult(match: MatchWithTeams) {
  return match.home_score !== null && match.away_score !== null;
}

function hasCompletePrediction(match: MatchWithTeams, prediction: Prediction | undefined | null) {
  if (!prediction) return false;
  if (prediction.predicted_home_score === null || prediction.predicted_away_score === null) return false;
  if (
    isKnockoutStage(match.stage) &&
    prediction.predicted_home_score === prediction.predicted_away_score &&
    !prediction.advance_team_id
  ) {
    return false;
  }
  return true;
}

function sideWinnerTeamId(match: MatchWithTeams, home: number, away: number, rng: () => number) {
  if (home > away) return match.home_team_id ?? null;
  if (away > home) return match.away_team_id ?? null;
  if (!isKnockoutStage(match.stage)) return null;
  const homeRank = match.home_team ? getFifaRanking(match.home_team.name)?.rank ?? 80 : 80;
  const awayRank = match.away_team ? getFifaRanking(match.away_team.name)?.rank ?? 80 : 80;
  const homeAdvanceProbability = Math.max(0.35, Math.min(0.65, 0.5 + (awayRank - homeRank) / 180));
  return rng() <= homeAdvanceProbability ? match.home_team_id ?? null : match.away_team_id ?? null;
}

function fixedScenario(match: MatchWithTeams): ActualScenario | null {
  if (!hasResult(match)) return null;
  const home = match.home_score as number;
  const away = match.away_score as number;
  let winnerTeamId = match.winner_team_id ?? null;
  if (!winnerTeamId && home > away) winnerTeamId = match.home_team_id ?? null;
  if (!winnerTeamId && away > home) winnerTeamId = match.away_team_id ?? null;
  return { home, away, winnerTeamId };
}

function normalizeScorePool(pool: ScoreOption[]) {
  const filtered = pool.filter((score) => score.probability > 0);
  const total = filtered.reduce((sum, score) => sum + score.probability, 0);
  if (total <= 0) return [{ home: 1, away: 1, probability: 1 }];
  return filtered.map((score) => ({ ...score, probability: score.probability / total }));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function fallbackScorePool(match: MatchWithTeams): ScoreOption[] {
  const homeRank = match.home_team ? getFifaRanking(match.home_team.name)?.rank ?? 80 : 80;
  const awayRank = match.away_team ? getFifaRanking(match.away_team.name)?.rank ?? 80 : 80;
  const edge = clamp((awayRank - homeRank) / 130, -0.24, 0.24);
  const drawProbability = isKnockoutStage(match.stage) ? 0.27 : 0.25;
  const homeProbability = clamp(0.375 + edge, 0.15, 0.68);
  const awayProbability = clamp(1 - drawProbability - homeProbability, 0.15, 0.68);

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
  return Boolean(input && ((input.odds_text ?? '').trim() !== '' || (input.probabilities_text ?? '').trim() !== ''));
}

function optimizerRowsForMatch(match: MatchWithTeams, input: OptimizerInputRow | undefined, sourceBlendWeight: number) {
  if (!match.home_team || !match.away_team || !hasOptimizerInput(input)) return [];
  const result = runTipOptimizer({
    oddsText: input?.odds_text ?? '',
    probabilitiesText: input?.probabilities_text ?? '',
    sourceMode: 'odds',
    match,
    homeRating: null,
    awayRating: null,
    maxGoals: Number(input?.max_goals ?? 7),
    sourceBlendWeight,
  });
  return result;
}

function scorePoolForMatch(match: MatchWithTeams, input: OptimizerInputRow | undefined, sourceBlendWeight: number) {
  const result = optimizerRowsForMatch(match, input, sourceBlendWeight);
  if (!Array.isArray((result as any).possibleResults) || (result as any).possibleResults.length === 0) {
    return fallbackScorePool(match);
  }
  return normalizeScorePool(
    (result as ReturnType<typeof runTipOptimizer>).possibleResults.map((score) => ({
      home: score.home,
      away: score.away,
      probability: score.probability,
    })),
  );
}

function candidateTipsForMatch(match: MatchWithTeams, input: OptimizerInputRow | undefined, sourceBlendWeight: number) {
  const result = optimizerRowsForMatch(match, input, sourceBlendWeight);
  const rows: OptimizerTipRow[] = [];
  if (Array.isArray((result as any).bestThree)) rows.push(...(result as ReturnType<typeof runTipOptimizer>).bestThree);
  if (Array.isArray((result as any).alternativeDiffs)) rows.push(...(result as ReturnType<typeof runTipOptimizer>).alternativeDiffs);
  if (Array.isArray((result as any).outcomePicks)) {
    for (const pick of (result as ReturnType<typeof runTipOptimizer>).outcomePicks) {
      if (pick.tip) rows.push(pick.tip);
    }
  }

  const unique = new Map<string, OptimizerTipRow>();
  for (const row of rows) unique.set(row.tipKey ?? `${row.home}:${row.away}:${row.advanceSide ?? ''}`, row);

  if (unique.size > 0) return Array.from(unique.values()).slice(0, 8);

  const fallback: OptimizerTipRow[] = [
    makeFallbackTip(match, 1, 0),
    makeFallbackTip(match, 1, 1),
    makeFallbackTip(match, 0, 1),
  ];
  return fallback;
}

function makeFallbackTip(match: MatchWithTeams, home: number, away: number): OptimizerTipRow {
  const draw = home === away;
  const advanceSide = draw && isKnockoutStage(match.stage) ? 'home' : home > away ? 'home' : away > home ? 'away' : null;
  return {
    home,
    away,
    label: `${home}:${away}`,
    tipKey: `${home}:${away}:${advanceSide ?? ''}`,
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

function scenarioForMatch(match: MatchWithTeams, scorePoolsByMatchId: Map<string, ScoreOption[]>, rng: () => number): ActualScenario {
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

function predictionFromTip(match: MatchWithTeams, profileId: string, row: OptimizerTipRow): Prediction {
  let advanceTeamId: string | null = null;
  if (row.home === row.away && isKnockoutStage(match.stage)) {
    advanceTeamId = row.advanceSide === 'home' ? match.home_team_id ?? null : match.away_team_id ?? null;
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

function sampleTip(rows: OptimizerTipRow[], rng: () => number) {
  const available = rows.length > 0 ? rows : [makeFallbackTip({ stage: 'group' } as MatchWithTeams, 1, 1)];
  const weights = [0.55, 0.3, 0.15, 0.08, 0.05, 0.04, 0.03, 0.02];
  const total = available.reduce((sum, _row, index) => sum + (weights[index] ?? 0.01), 0);
  let draw = rng() * total;
  for (let i = 0; i < available.length; i++) {
    draw -= weights[i] ?? 0.01;
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
  const existing = context.predictionsByKey.get(predictionKey(profile.id, match.id));
  if (hasCompletePrediction(match, existing)) return existing as Prediction;
  if (hasResult(match)) return null;

  if (profile.id === context.currentUserId) {
    const override = currentOverrides.get(match.id) ?? context.currentDefaultTipsByMatchId.get(match.id);
    return override ? predictionFromTip(match, profile.id, override) : null;
  }

  const rows = context.fallbackTipsByMatchId.get(match.id) ?? [];
  const sampled = sampleTip(rows, rng);
  return predictionFromTip(match, profile.id, sampled);
}

function runSimulation(context: SimulationContext, runs: number, seedLabel: string, currentOverrides = new Map<string, OptimizerTipRow>()) {
  const winShares = new Map(context.profiles.map((profile) => [profile.id, 0]));
  const pointSums = new Map(context.profiles.map((profile) => [profile.id, 0]));
  const rng = seededRandom(hashString(seedLabel));

  for (let run = 0; run < runs; run++) {
    const totals = new Map(context.profiles.map((profile) => [profile.id, 0]));

    for (const match of context.matches) {
      const scenario = scenarioForMatch(match, context.scorePoolsByMatchId, rng);
      const simulatedMatch: Match = {
        ...match,
        home_score: scenario.home,
        away_score: scenario.away,
        winner_team_id: scenario.winnerTeamId,
        is_finished: true,
      };

      for (const profile of context.profiles) {
        const prediction = predictionForProfile(context, profile, match, rng, currentOverrides);
        if (!prediction) continue;
        totals.set(profile.id, (totals.get(profile.id) ?? 0) + calculateTotalPoints(simulatedMatch, prediction));
      }
    }

    let bestScore = -Infinity;
    for (const score of totals.values()) bestScore = Math.max(bestScore, score);
    const winners = context.profiles.filter((profile) => (totals.get(profile.id) ?? 0) === bestScore);
    const share = winners.length > 0 ? 1 / winners.length : 0;

    for (const winner of winners) {
      winShares.set(winner.id, (winShares.get(winner.id) ?? 0) + share);
    }

    for (const profile of context.profiles) {
      pointSums.set(profile.id, (pointSums.get(profile.id) ?? 0) + (totals.get(profile.id) ?? 0));
    }
  }

  return {
    winProbabilityByProfileId: new Map(
      context.profiles.map((profile) => [profile.id, (winShares.get(profile.id) ?? 0) / runs]),
    ),
    averagePointsByProfileId: new Map(
      context.profiles.map((profile) => [profile.id, (pointSums.get(profile.id) ?? 0) / runs]),
    ),
  };
}

function currentPointsFor(profile: Profile, matches: MatchWithTeams[], predictionsByKey: Map<string, Prediction>) {
  return matches.reduce((sum, match) => {
    if (!hasResult(match)) return sum;
    const prediction = predictionsByKey.get(predictionKey(profile.id, match.id));
    if (!hasCompletePrediction(match, prediction)) return sum;
    return sum + calculateTotalPoints(match, prediction as Prediction);
  }, 0);
}

function maximumRemainingPoints(matches: MatchWithTeams[]) {
  return matches.reduce((sum, match) => {
    if (hasResult(match)) return sum;
    const maxBase = isKnockoutStage(match.stage) ? 10 : 7;
    return sum + maxBase * STAGE_MULTIPLIERS[match.stage];
  }, 0);
}

function buildRecommendations(context: SimulationContext) {
  const currentUserId = context.currentUserId;
  const openMatches = context.matches
    .filter((match) => !hasResult(match) && match.home_team && match.away_team)
    .filter((match) => !hasCompletePrediction(match, context.predictionsByKey.get(predictionKey(currentUserId, match.id))))
    .slice(0, MAX_RECOMMENDED_MATCHES);

  return openMatches.map((match) => {
    const candidates = context.fallbackTipsByMatchId.get(match.id) ?? [];
    const evaluated = candidates.slice(0, 6).map((row) => {
      const overrides = new Map<string, OptimizerTipRow>([[match.id, row]]);
      const result = runSimulation(context, TIP_RUNS, `tip-${match.id}-${row.tipKey}`, overrides);
      return {
        row,
        winProbability: result.winProbabilityByProfileId.get(currentUserId) ?? 0,
      };
    }).sort((a, b) => b.winProbability - a.winProbability);

    return {
      match,
      best: evaluated[0],
      candidates: evaluated.slice(0, 3),
    };
  }).filter((row): row is RecommendationRow => Boolean(row.best));
}

function tipOutcomeSide(row: OptimizerTipRow) {
  if (row.home > row.away) return 'home';
  if (row.away > row.home) return 'away';
  return 'draw';
}

function TipBadge({ match, row }: { match: MatchWithTeams; row: OptimizerTipRow }) {
  const outcomeSide = tipOutcomeSide(row);
  const advanceTeam = row.advanceSide === 'home' ? match.home_team : row.advanceSide === 'away' ? match.away_team : null;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, justifyContent: 'flex-end' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {outcomeSide === 'home' && match.home_team && <Flag team={match.home_team} />}
        {outcomeSide === 'away' && match.away_team && <Flag team={match.away_team} />}
        {outcomeSide === 'draw' && <span className="drawFlagMini">Draw</span>}
        {outcomeSide === 'draw' && advanceTeam && <Flag team={advanceTeam} />}
      </span>
      <strong>{row.label}</strong>
    </span>
  );
}

function MatchLabel({ match }: { match: MatchWithTeams }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ color: 'var(--muted)', fontSize: 12 }}>#{match.match_number}</span>
      {match.home_team && <Flag team={match.home_team} />}
      <span>{match.home_team?.name ?? match.home_placeholder ?? 'Offen'}</span>
      <span style={{ color: 'var(--muted)' }}>–</span>
      {match.away_team && <Flag team={match.away_team} />}
      <span>{match.away_team?.name ?? match.away_placeholder ?? 'Offen'}</span>
    </span>
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
  const background = segments.length > 0 ? `conic-gradient(${segments.join(', ')})` : '#e5e7eb';

  return (
    <div style={{ display: 'grid', gap: 16, justifyItems: 'center' }}>
      <div
        aria-label="Gewinnwahrscheinlichkeiten"
        style={{
          width: 'min(100%, 280px)',
          aspectRatio: '1 / 1',
          borderRadius: '999px',
          background,
          boxShadow: 'inset 0 0 0 12px rgba(255,255,255,0.72), var(--shadow)',
        }}
      />
      <div style={{ display: 'grid', gap: 8, width: '100%' }}>
        {relevantRows.map((row, index) => (
          <div key={row.profile.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  background: PIE_COLORS[index % PIE_COLORS.length],
                  display: 'inline-block',
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
  if (!user.is_admin) redirect('/matches');

  const visibleProfiles = await getVisibleProfilesForUser(user);
  const visibleProfileIds = visibleProfiles.map((profile) => profile.id);

  const [matchesResponse, predictionsResponse, optimizerInputsResponse, optimizerSettingsResponse] = await Promise.all([
    supabaseAdmin
      .from('matches')
      .select(
        `
        *,
        home_team:teams!matches_home_team_id_fkey(*),
        away_team:teams!matches_away_team_id_fkey(*)
      `,
      )
      .order('kickoff_time', { ascending: true }),
    visibleProfileIds.length > 0
      ? supabaseAdmin.from('predictions').select('*').in('user_id', visibleProfileIds)
      : Promise.resolve({ data: [] }),
    supabaseAdmin.from('tip_optimizer_inputs').select('match_id, odds_text, probabilities_text, max_goals'),
    supabaseAdmin.from('tip_optimizer_settings').select('source_blend_weight').eq('id', 1).maybeSingle(),
  ]);

  const matches = (matchesResponse.data ?? []) as MatchWithTeams[];
  const predictions = (predictionsResponse.data ?? []) as Prediction[];
  const optimizerInputs = (optimizerInputsResponse.data ?? []) as OptimizerInputRow[];
  const sourceBlendWeight = Number(optimizerSettingsResponse.data?.source_blend_weight ?? 0.5);
  const optimizerInputByMatchId = new Map(optimizerInputs.map((input) => [input.match_id, input]));
  const predictionsByKey = new Map(predictions.map((prediction) => [predictionKey(prediction.user_id, prediction.match_id), prediction]));
  const remainingMax = maximumRemainingPoints(matches);
  const currentPoints = new Map(visibleProfiles.map((profile) => [profile.id, currentPointsFor(profile, matches, predictionsByKey)]));
  const currentLeader = Math.max(...Array.from(currentPoints.values()), 0);
  const contenderProfiles = visibleProfiles.filter((profile) => {
    if (profile.id === user.id) return true;
    return (currentPoints.get(profile.id) ?? 0) + remainingMax >= currentLeader;
  });
  const removedCount = visibleProfiles.length - contenderProfiles.length;
  const scorePoolsByMatchId = new Map<string, ScoreOption[]>();
  const fallbackTipsByMatchId = new Map<string, OptimizerTipRow[]>();
  const currentDefaultTipsByMatchId = new Map<string, OptimizerTipRow>();

  for (const match of matches) {
    if (hasResult(match) || !match.home_team || !match.away_team) continue;
    const input = optimizerInputByMatchId.get(match.id);
    scorePoolsByMatchId.set(match.id, scorePoolForMatch(match, input, sourceBlendWeight));
    const candidates = candidateTipsForMatch(match, input, sourceBlendWeight);
    fallbackTipsByMatchId.set(match.id, candidates);
    if (candidates[0]) currentDefaultTipsByMatchId.set(match.id, candidates[0]);
  }

  const context: SimulationContext = {
    currentUserId: user.id,
    profiles: contenderProfiles,
    matches,
    predictionsByKey,
    scorePoolsByMatchId,
    fallbackTipsByMatchId,
    currentDefaultTipsByMatchId,
  };

  const baseline = runSimulation(context, BASE_RUNS, 'baseline-tipgame-wins');
  const rows: WinRow[] = contenderProfiles
    .map((profile) => ({
      profile,
      currentPoints: currentPoints.get(profile.id) ?? 0,
      winProbability: baseline.winProbabilityByProfileId.get(profile.id) ?? 0,
      averagePoints: baseline.averagePointsByProfileId.get(profile.id) ?? 0,
      possible: true,
    }))
    .sort((a, b) => b.winProbability - a.winProbability || b.currentPoints - a.currentPoints || a.profile.username.localeCompare(b.profile.username, 'de-AT'));
  const recommendations = buildRecommendations(context);
  const ownRow = rows.find((row) => row.profile.id === user.id);

  return (
    <>
      <Nav user={user} />
      <main className="page" style={pageWide}>
        <div style={{ display: 'grid', gap: 4, marginBottom: 16 }}>
          <h1>Tippspiel-Chancen</h1>
          <p className="subtle" style={{ margin: 0 }}>
            Admin-only Simulation für deine sichtbare Tippgruppe. Abgegebene Tipps bleiben fix; fehlende zukünftige Tipps werden simuliert.
          </p>
          <p style={{ ...mutedSmall, margin: 0 }}>
            {BASE_RUNS.toLocaleString('de-AT')} Basisläufe · {TIP_RUNS.toLocaleString('de-AT')} Läufe pro Tipp-Check · {removedCount} chancenlose Spieler ausgeblendet
          </p>
        </div>

        <section style={gridTwo}>
          <article className="card">
            <h2 style={sectionTitle}>Wer gewinnt?</h2>
            <PieChart rows={rows} />
          </article>

          <article className="card">
            <h2 style={sectionTitle}>Simulationstabelle</h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
                    <th style={{ padding: '8px 6px' }}>Spieler</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>Chance</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>Jetzt</th>
                    <th style={{ padding: '8px 6px', textAlign: 'right' }}>Ø Ende</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.profile.id} style={{ borderTop: '1px solid var(--line)' }}>
                      <td style={{ padding: '9px 6px', fontWeight: row.profile.id === user.id ? 800 : 500 }}>
                        {row.profile.id === user.id ? `Du (${row.profile.username})` : row.profile.username}
                      </td>
                      <td style={{ padding: '9px 6px', textAlign: 'right', fontWeight: 800 }}>{formatPercent(row.winProbability)}</td>
                      <td style={{ padding: '9px 6px', textAlign: 'right' }}>{row.currentPoints}</td>
                      <td style={{ padding: '9px 6px', textAlign: 'right' }}>{formatPoints(row.averagePoints)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {ownRow && (
              <p style={{ ...mutedSmall, marginBottom: 0 }}>
                Deine aktuelle simulierte Gewinnchance: <strong>{formatPercent(ownRow.winProbability)}</strong>.
              </p>
            )}
          </article>
        </section>

        <section className="card" style={{ marginTop: 14 }}>
          <h2 style={sectionTitle}>Tipps, die deine Gewinnchance maximieren</h2>
          <p style={{ ...mutedSmall, marginTop: -4 }}>
            Es werden nur deine noch offenen Spiele gezeigt. Tipps anderer Spieler werden intern verwendet, aber nicht angezeigt.
          </p>

          {recommendations.length === 0 ? (
            <p className="subtle">Für dich sind aktuell keine offenen optimierbaren Tipps vorhanden.</p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {recommendations.map((recommendation) => (
                <div
                  key={recommendation.match.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(220px, 1fr) auto auto',
                    gap: 12,
                    alignItems: 'center',
                    padding: '10px 0',
                    borderTop: '1px solid var(--line)',
                  }}
                >
                  <div style={{ display: 'grid', gap: 3 }}>
                    <MatchLabel match={recommendation.match} />
                    <span style={mutedSmall}>{getStageLabel(recommendation.match.stage)}</span>
                  </div>
                  <TipBadge match={recommendation.match} row={recommendation.best.row} />
                  <strong style={{ textAlign: 'right' }}>{formatPercent(recommendation.best.winProbability)}</strong>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
