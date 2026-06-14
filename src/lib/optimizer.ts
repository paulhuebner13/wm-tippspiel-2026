import type { Match, Team } from './types';
import { POINTS, STAGE_MULTIPLIERS } from './scoring';

export type OptimizerOddResult = {
  home: number;
  away: number;
  label: string;
  odd: number;
  estimated: boolean;
  rawProbability: number;
  oddsProbability?: number;
  rankingProbability?: number;
  probability?: number;
};

export type OptimizerTipRow = {
  home: number;
  away: number;
  label: string;
  expectedPoints: number;
  exactProbability: number;
  diffProbability: number;
  onlyOutcomeProbability: number;
  totalOutcomeProbability: number;
  exactStillPossible: boolean;
};

export type OptimizerResult = {
  rows: OptimizerTipRow[];
  bestThree: OptimizerTipRow[];
  alternativeDiffs: OptimizerTipRow[];
  possibleResults: Required<Pick<OptimizerOddResult, 'home' | 'away' | 'label' | 'odd' | 'estimated' | 'rawProbability' | 'oddsProbability' | 'rankingProbability' | 'probability'>>[];
  errors: string[];
  summary: {
    inputOddsCount: number;
    estimatedCount: number;
    minHome: number;
    minAway: number;
    homeRating: number | null;
    awayRating: number | null;
    rankingWeight: number;
    stageMultiplier: number;
  };
};

export function parseOdds(text: string) {
  const lines = text.split(/\n+/);
  const results: OptimizerOddResult[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue;
    if (/jedes\s+andere\s+ergebnis/i.test(line)) continue;
    const match = line.match(/^(\d+)\s*[:\-]\s*(\d+)\s+([0-9]+(?:[.,][0-9]+)?)$/);
    if (!match) {
      errors.push(`Zeile ${i + 1} konnte nicht gelesen werden: ${line}`);
      continue;
    }
    const home = Number(match[1]);
    const away = Number(match[2]);
    const odd = Number(match[3].replace(',', '.'));
    const label = `${home}:${away}`;

    if (!Number.isFinite(odd) || odd <= 1) {
      errors.push(`Zeile ${i + 1} hat eine ungültige Quote: ${line}`);
      continue;
    }
    if (seen.has(label)) {
      errors.push(`Doppeltes Ergebnis ignoriert: ${label}`);
      continue;
    }
    seen.add(label);
    results.push({ home, away, odd, label, estimated: false, rawProbability: 1 / odd });
  }

  if (results.length === 0) errors.push('Es wurden keine gültigen Quoten gefunden.');
  return { results, errors };
}

function factorial(n: number) {
  let x = 1;
  for (let i = 2; i <= n; i++) x *= i;
  return x;
}

function poisson(k: number, lambda: number) {
  return Math.exp(-lambda) * Math.pow(lambda, k) / factorial(k);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function estimateMissingResults(results: OptimizerOddResult[], maxGoals: number, minHome: number, minAway: number) {
  if (results.length === 0) return results;

  const rawSum = results.reduce((sum, r) => sum + r.rawProbability, 0);
  const normalized = results.map((r) => ({ ...r, tempProbability: r.rawProbability / rawSum }));

  let lambdaHome = normalized.reduce((sum, r) => sum + r.home * r.tempProbability, 0);
  let lambdaAway = normalized.reduce((sum, r) => sum + r.away * r.tempProbability, 0);
  lambdaHome = clamp(lambdaHome, 0.15, 6.5);
  lambdaAway = clamp(lambdaAway, 0.15, 6.5);

  const existing = new Set(results.map((r) => r.label));
  const poissonForKnown = results.reduce(
    (sum, r) => sum + poisson(r.home, lambdaHome) * poisson(r.away, lambdaAway),
    0,
  );
  const scale = poissonForKnown > 0 ? rawSum / poissonForKnown : 1;
  const discount = 0.65;
  const expanded = [...results];

  for (let h = minHome; h <= maxGoals; h++) {
    for (let a = minAway; a <= maxGoals; a++) {
      const label = `${h}:${a}`;
      if (existing.has(label)) continue;

      const modelProb = poisson(h, lambdaHome) * poisson(a, lambdaAway);
      const rawProbability = modelProb * scale * discount;
      const odd = 1 / Math.max(rawProbability, 1e-9);

      if (rawProbability > 0.00003) {
        expanded.push({ home: h, away: a, odd, label, estimated: true, rawProbability });
      }
    }
  }

  return expanded;
}

function inferMinimumScore(results: OptimizerOddResult[]) {
  return {
    minHome: Math.min(...results.map((r) => r.home)),
    minAway: Math.min(...results.map((r) => r.away)),
  };
}

function normaliseOddsProbabilities(results: OptimizerOddResult[]) {
  const rawSum = results.reduce((sum, r) => sum + r.rawProbability, 0);
  return results.map((r) => ({ ...r, oddsProbability: rawSum > 0 ? r.rawProbability / rawSum : 0 }));
}

function buildRankingProbabilities(
  results: (OptimizerOddResult & { oddsProbability: number })[],
  homeRating: number | null,
  awayRating: number | null,
) {
  const avgHome = results.reduce((sum, r) => sum + r.home * r.oddsProbability, 0);
  const avgAway = results.reduce((sum, r) => sum + r.away * r.oddsProbability, 0);
  const totalGoals = clamp(avgHome + avgAway || 2.7, 1.1, 6.5);

  if (homeRating === null || awayRating === null) {
    return results.map((r) => ({ ...r, rankingProbability: r.oddsProbability }));
  }

  const diff = homeRating - awayRating;
  const homeShare = 1 / (1 + Math.exp(-diff / 360));
  const lambdaHome = clamp(totalGoals * homeShare, 0.15, 6.5);
  const lambdaAway = clamp(totalGoals * (1 - homeShare), 0.15, 6.5);

  const raw = results.map((r) => ({
    ...r,
    rankingRawProbability: poisson(r.home, lambdaHome) * poisson(r.away, lambdaAway),
  }));
  const rawSum = raw.reduce((sum, r) => sum + r.rankingRawProbability, 0);

  return raw.map((r) => ({
    ...r,
    rankingProbability: rawSum > 0 ? r.rankingRawProbability / rawSum : r.oddsProbability,
  }));
}

function blendProbabilities(
  results: (OptimizerOddResult & { oddsProbability: number; rankingProbability: number })[],
  rankingWeight: number,
) {
  const w = clamp(rankingWeight, 0, 0.35);
  const blended = results.map((r) => ({
    ...r,
    probability: r.oddsProbability * (1 - w) + r.rankingProbability * w,
  }));
  const sum = blended.reduce((total, r) => total + r.probability, 0);
  return blended.map((r) => ({ ...r, probability: sum > 0 ? r.probability / sum : r.probability }));
}

function outcome(score: { home: number; away: number }) {
  if (score.home > score.away) return 'home';
  if (score.home < score.away) return 'away';
  return 'draw';
}

function getBasePoints(tip: { home: number; away: number }, actual: { home: number; away: number }) {
  const tipDiff = tip.home - tip.away;
  const actualDiff = actual.home - actual.away;
  if (tip.home === actual.home && tip.away === actual.away) return POINTS.exact;
  if (tipDiff === actualDiff) return POINTS.goalDifference;
  if (outcome(tip) === outcome(actual)) return POINTS.outcome;
  return 0;
}

function calculateExpectedPointsForTip(
  tip: { home: number; away: number; label: string; exactStillPossible: boolean },
  possibleResults: { home: number; away: number; probability: number }[],
  stageMultiplier: number,
): OptimizerTipRow {
  let expectedPoints = 0;
  let exactProbability = 0;
  let diffProbability = 0;
  let onlyOutcomeProbability = 0;
  let totalOutcomeProbability = 0;

  for (const actual of possibleResults) {
    const points = getBasePoints(tip, actual) * stageMultiplier;
    expectedPoints += actual.probability * points;
    if (outcome(tip) === outcome(actual)) totalOutcomeProbability += actual.probability;
    if (tip.home === actual.home && tip.away === actual.away) exactProbability += actual.probability;
    else if (tip.home - tip.away === actual.home - actual.away) diffProbability += actual.probability;
    else if (outcome(tip) === outcome(actual)) onlyOutcomeProbability += actual.probability;
  }

  return {
    ...tip,
    expectedPoints,
    exactProbability,
    diffProbability,
    onlyOutcomeProbability,
    totalOutcomeProbability,
  };
}

function calculateAllTips(
  possibleResults: { home: number; away: number; label: string; probability: number }[],
  maxGoals: number,
  minHome: number,
  minAway: number,
  stageMultiplier: number,
) {
  const candidates: { home: number; away: number; label: string; exactStillPossible: boolean }[] = [];
  const seen = new Set<string>();

  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      const label = `${h}:${a}`;
      seen.add(label);
      candidates.push({ home: h, away: a, label, exactStillPossible: h >= minHome && a >= minAway });
    }
  }

  for (const result of possibleResults) {
    if (!seen.has(result.label)) {
      seen.add(result.label);
      candidates.push({
        home: result.home,
        away: result.away,
        label: result.label,
        exactStillPossible: result.home >= minHome && result.away >= minAway,
      });
    }
  }

  return candidates
    .map((tip) => calculateExpectedPointsForTip(tip, possibleResults, stageMultiplier))
    .sort((a, b) => b.expectedPoints - a.expectedPoints);
}

function pickAlternativeDiffs(rows: OptimizerTipRow[], bestThree: OptimizerTipRow[]) {
  const usedDiffs = new Set(bestThree.map((row) => row.home - row.away));
  const alternatives: OptimizerTipRow[] = [];

  for (const row of rows) {
    if (bestThree.some((best) => best.label === row.label)) continue;
    const diff = row.home - row.away;
    if (!usedDiffs.has(diff)) {
      alternatives.push(row);
      usedDiffs.add(diff);
    }
    if (alternatives.length === 2) break;
  }

  if (alternatives.length < 2) {
    for (const row of rows) {
      if (bestThree.some((best) => best.label === row.label)) continue;
      if (alternatives.some((alt) => alt.label === row.label)) continue;
      alternatives.push(row);
      if (alternatives.length === 2) break;
    }
  }

  return alternatives;
}

export function runTipOptimizer(input: {
  oddsText: string;
  match: Match & { home_team?: Team | null; away_team?: Team | null };
  homeRating: number | null;
  awayRating: number | null;
  maxGoals?: number;
  currentHome?: number | null;
  currentAway?: number | null;
  rankingWeight?: number;
}): OptimizerResult {
  const maxGoals = input.maxGoals ?? 7;
  const rankingWeight = input.rankingWeight ?? 0.15;
  const parsed = parseOdds(input.oddsText);

  if (parsed.results.length === 0) {
    return {
      rows: [],
      bestThree: [],
      alternativeDiffs: [],
      possibleResults: [],
      errors: parsed.errors,
      summary: {
        inputOddsCount: 0,
        estimatedCount: 0,
        minHome: 0,
        minAway: 0,
        homeRating: input.homeRating,
        awayRating: input.awayRating,
        rankingWeight,
        stageMultiplier: STAGE_MULTIPLIERS[input.match.stage],
      },
    };
  }

  const inferredMinimum = inferMinimumScore(parsed.results);
  const minHome = input.currentHome ?? inferredMinimum.minHome;
  const minAway = input.currentAway ?? inferredMinimum.minAway;
  const possibleInputResults = parsed.results.filter((r) => r.home >= minHome && r.away >= minAway);
  const withMissing = estimateMissingResults(possibleInputResults, maxGoals, minHome, minAway);
  const oddsNormalised = normaliseOddsProbabilities(withMissing) as (OptimizerOddResult & { oddsProbability: number })[];
  const rankingNormalised = buildRankingProbabilities(oddsNormalised, input.homeRating, input.awayRating);
  const possibleResults = blendProbabilities(rankingNormalised, rankingWeight) as OptimizerResult['possibleResults'];
  const stageMultiplier = STAGE_MULTIPLIERS[input.match.stage];
  const rows = calculateAllTips(possibleResults, maxGoals, minHome, minAway, stageMultiplier);
  const bestThree = rows.slice(0, 3);
  const alternativeDiffs = pickAlternativeDiffs(rows, bestThree);

  return {
    rows,
    bestThree,
    alternativeDiffs,
    possibleResults,
    errors: parsed.errors,
    summary: {
      inputOddsCount: possibleInputResults.length,
      estimatedCount: possibleResults.filter((r) => r.estimated).length,
      minHome,
      minAway,
      homeRating: input.homeRating,
      awayRating: input.awayRating,
      rankingWeight,
      stageMultiplier,
    },
  };
}
