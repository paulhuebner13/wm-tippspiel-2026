import type { Match, Team } from './types';
import { POINTS, STAGE_MULTIPLIERS, isKnockoutStage } from './scoring';

export type OptimizerAdvanceSide = 'home' | 'away' | null;
export type OptimizerOutcomeSide = 'home' | 'away' | 'draw';

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
  tipKey: string;
  advanceSide: OptimizerAdvanceSide;
  expectedPoints: number;
  exactProbability: number;
  diffProbability: number;
  onlyOutcomeProbability: number;
  totalOutcomeProbability: number;
  knockoutAdvanceFullProbability: number;
  knockoutAdvanceBonusProbability: number;
  exactStillPossible: boolean;
};

export type OptimizerOutcomePick = {
  key: string;
  kind:
    | 'homeWin'
    | 'awayWin'
    | 'draw'
    | 'drawHomeAdvance'
    | 'drawAwayAdvance';
  side: OptimizerOutcomeSide;
  advanceSide: OptimizerAdvanceSide;
  tip: OptimizerTipRow | null;
};

export type OptimizerResult = {
  rows: OptimizerTipRow[];
  bestThree: OptimizerTipRow[];
  alternativeDiffs: OptimizerTipRow[];
  outcomePicks: OptimizerOutcomePick[];
  possibleResults: Required<Pick<OptimizerOddResult, 'home' | 'away' | 'label' | 'odd' | 'estimated' | 'rawProbability' | 'oddsProbability' | 'rankingProbability' | 'probability'>>[];
  errors: string[];
  summary: {
    inputOddsCount: number;
    inputProbabilityCount: number;
    estimatedCount: number;
    minHome: number;
    minAway: number;
    sourceBlendWeight: number;
    stageMultiplier: number;
  };
};

export type OptimizerSourceMode = 'odds' | 'probabilities';

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

function splitCsvLine(line: string, separator: string) {
  const values: string[] = [];
  let current = '';
  let quoted = false;

  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
    } else if (char === separator && !quoted) {
      values.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim().replace(/^"|"$/g, ''));
  return values;
}

function parseProbabilityNumber(value: string | undefined) {
  if (!value) return null;
  const normalized = value.trim().replace('%', '').replace(',', '.');
  if (normalized === '') return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseScoreProbabilities(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const results: OptimizerOddResult[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  if (lines.length === 0) {
    return { results, errors: ['Es wurden keine Wahrscheinlichkeiten gefunden.'] };
  }

  const separator = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
  const header = splitCsvLine(lines[0], separator).map((entry) => entry.toLowerCase());
  const homeIndex = header.indexOf('home_goals');
  const awayIndex = header.indexOf('away_goals');
  const scoreIndex = header.indexOf('score');
  const probabilityIndex = header.indexOf('probability');
  const probabilityPercentIndex = header.indexOf('probability_percent');

  const hasHeader = homeIndex >= 0 || awayIndex >= 0 || scoreIndex >= 0 || probabilityIndex >= 0 || probabilityPercentIndex >= 0;
  const startIndex = hasHeader ? 1 : 0;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    const cells = splitCsvLine(line, separator);
    const lineNumber = i + 1;

    let home: number | null = null;
    let away: number | null = null;
    let label = '';

    if (hasHeader && homeIndex >= 0 && awayIndex >= 0) {
      home = Number(cells[homeIndex]);
      away = Number(cells[awayIndex]);
      label = `${home}:${away}`;
    } else {
      const scoreCell = hasHeader && scoreIndex >= 0 ? cells[scoreIndex] : cells[0];
      const scoreMatch = scoreCell?.match(/^(\d+)\s*[:\-]\s*(\d+)$/);
      if (scoreMatch) {
        home = Number(scoreMatch[1]);
        away = Number(scoreMatch[2]);
        label = `${home}:${away}`;
      }
    }

    if (home === null || away === null || !Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) {
      errors.push(`Zeile ${lineNumber} hat kein gültiges Ergebnis: ${line}`);
      continue;
    }

    let probability =
      hasHeader && probabilityIndex >= 0
        ? parseProbabilityNumber(cells[probabilityIndex])
        : parseProbabilityNumber(cells[1]);

    if ((probability === null || probability <= 0) && hasHeader && probabilityPercentIndex >= 0) {
      const percent = parseProbabilityNumber(cells[probabilityPercentIndex]);
      probability = percent === null ? null : percent / 100;
    }

    if (probability !== null && probability > 1) {
      probability = probability / 100;
    }

    if (probability === null || probability <= 0) {
      errors.push(`Zeile ${lineNumber} hat keine gültige Wahrscheinlichkeit: ${line}`);
      continue;
    }

    if (seen.has(label)) {
      errors.push(`Doppeltes Ergebnis ignoriert: ${label}`);
      continue;
    }

    seen.add(label);
    results.push({
      home,
      away,
      label,
      odd: 1 / probability,
      estimated: false,
      rawProbability: probability,
    });
  }

  if (results.length === 0) errors.push('Es wurden keine gültigen Score-Wahrscheinlichkeiten gefunden.');
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

function outcome(score: { home: number; away: number }): OptimizerOutcomeSide {
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

function tipKey(input: { home: number; away: number; advanceSide: OptimizerAdvanceSide }) {
  return `${input.home}:${input.away}:${input.advanceSide ?? 'none'}`;
}

function candidateAdvanceSide(home: number, away: number, knockout: boolean): OptimizerAdvanceSide {
  if (!knockout) return null;
  if (home > away) return 'home';
  if (home < away) return 'away';
  return null;
}

type ActualScenario = {
  home: number;
  away: number;
  probability: number;
  advanceSide: OptimizerAdvanceSide;
};

function expandActualScenarios(
  possibleResults: { home: number; away: number; probability: number }[],
  knockout: boolean,
): ActualScenario[] {
  return possibleResults.flatMap((actual): ActualScenario[] => {
    const actualOutcome = outcome(actual);
    if (!knockout) {
      return [{ ...actual, advanceSide: null }];
    }
    if (actualOutcome === 'home') {
      return [{ ...actual, advanceSide: 'home' as const }];
    }
    if (actualOutcome === 'away') {
      return [{ ...actual, advanceSide: 'away' as const }];
    }

    // For knockout draws after 90 minutes the score model normally does not know
    // who wins after extra time / penalties. Use a neutral 50/50 split so the
    // optimizer can still value the required advance-team pick.
    return [
      { ...actual, probability: actual.probability / 2, advanceSide: 'home' as const },
      { ...actual, probability: actual.probability / 2, advanceSide: 'away' as const },
    ];
  });
}

function calculateKnockoutBonus(
  tip: { home: number; away: number; advanceSide: OptimizerAdvanceSide },
  actual: ActualScenario,
) {
  const tipOutcome = outcome(tip);
  const actualOutcome = outcome(actual);
  if (!actual.advanceSide) return 0;

  if (
    tipOutcome === 'draw' &&
    actualOutcome === 'draw' &&
    tip.advanceSide === actual.advanceSide
  ) {
    return POINTS.knockoutAdvanceWinner;
  }

  if (
    tipOutcome === 'draw' &&
    actualOutcome !== 'draw' &&
    tip.advanceSide === actual.advanceSide
  ) {
    return POINTS.knockoutAdvanceTeam;
  }

  if (
    tipOutcome !== 'draw' &&
    actualOutcome === 'draw' &&
    tip.advanceSide === actual.advanceSide
  ) {
    return POINTS.knockoutAdvanceTeam;
  }

  return 0;
}

function calculateExpectedPointsForTip(
  tip: {
    home: number;
    away: number;
    label: string;
    tipKey: string;
    advanceSide: OptimizerAdvanceSide;
    exactStillPossible: boolean;
  },
  possibleResults: { home: number; away: number; probability: number }[],
  stageMultiplier: number,
  knockout: boolean,
): OptimizerTipRow {
  let expectedPoints = 0;
  let exactProbability = 0;
  let diffProbability = 0;
  let onlyOutcomeProbability = 0;
  let totalOutcomeProbability = 0;
  let knockoutAdvanceFullProbability = 0;
  let knockoutAdvanceBonusProbability = 0;
  const actualScenarios = expandActualScenarios(possibleResults, knockout);

  for (const actual of actualScenarios) {
    const basePoints = getBasePoints(tip, actual);
    const knockoutBonus = knockout ? calculateKnockoutBonus(tip, actual) : 0;
    expectedPoints += actual.probability * (basePoints + knockoutBonus) * stageMultiplier;

    if (outcome(tip) === outcome(actual)) totalOutcomeProbability += actual.probability;
    if (tip.home === actual.home && tip.away === actual.away) exactProbability += actual.probability;
    else if (tip.home - tip.away === actual.home - actual.away) diffProbability += actual.probability;
    else if (outcome(tip) === outcome(actual)) onlyOutcomeProbability += actual.probability;

    if (knockoutBonus === POINTS.knockoutAdvanceWinner) {
      knockoutAdvanceFullProbability += actual.probability;
    } else if (knockoutBonus === POINTS.knockoutAdvanceTeam) {
      knockoutAdvanceBonusProbability += actual.probability;
    }
  }

  return {
    ...tip,
    expectedPoints,
    exactProbability,
    diffProbability,
    onlyOutcomeProbability,
    totalOutcomeProbability,
    knockoutAdvanceFullProbability,
    knockoutAdvanceBonusProbability,
  };
}

function buildCandidateTips(
  possibleResults: { home: number; away: number; label: string; probability: number }[],
  maxGoals: number,
  minHome: number,
  minAway: number,
  knockout: boolean,
) {
  const candidates: {
    home: number;
    away: number;
    label: string;
    tipKey: string;
    advanceSide: OptimizerAdvanceSide;
    exactStillPossible: boolean;
  }[] = [];
  const seen = new Set<string>();

  function addCandidate(home: number, away: number, advanceSide: OptimizerAdvanceSide) {
    const label = `${home}:${away}`;
    const key = tipKey({ home, away, advanceSide });
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({
      home,
      away,
      label,
      tipKey: key,
      advanceSide,
      exactStillPossible: home >= minHome && away >= minAway,
    });
  }

  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      if (knockout && h === a) {
        addCandidate(h, a, 'home');
        addCandidate(h, a, 'away');
      } else {
        addCandidate(h, a, candidateAdvanceSide(h, a, knockout));
      }
    }
  }

  for (const result of possibleResults) {
    if (knockout && result.home === result.away) {
      addCandidate(result.home, result.away, 'home');
      addCandidate(result.home, result.away, 'away');
    } else {
      addCandidate(
        result.home,
        result.away,
        candidateAdvanceSide(result.home, result.away, knockout),
      );
    }
  }

  return candidates;
}

function calculateAllTips(
  possibleResults: { home: number; away: number; label: string; probability: number }[],
  maxGoals: number,
  minHome: number,
  minAway: number,
  stageMultiplier: number,
  knockout: boolean,
) {
  return buildCandidateTips(possibleResults, maxGoals, minHome, minAway, knockout)
    .map((tip) =>
      calculateExpectedPointsForTip(tip, possibleResults, stageMultiplier, knockout),
    )
    .sort((a, b) => b.expectedPoints - a.expectedPoints);
}

function pickAlternativeDiffs(rows: OptimizerTipRow[], bestThree: OptimizerTipRow[]) {
  const usedDiffs = new Set(bestThree.map((row) => row.home - row.away));
  const alternatives: OptimizerTipRow[] = [];

  for (const row of rows) {
    if (bestThree.some((best) => best.tipKey === row.tipKey)) continue;
    const diff = row.home - row.away;
    if (!usedDiffs.has(diff)) {
      alternatives.push(row);
      usedDiffs.add(diff);
    }
    if (alternatives.length === 2) break;
  }

  if (alternatives.length < 2) {
    for (const row of rows) {
      if (bestThree.some((best) => best.tipKey === row.tipKey)) continue;
      if (alternatives.some((alt) => alt.tipKey === row.tipKey)) continue;
      alternatives.push(row);
      if (alternatives.length === 2) break;
    }
  }

  return alternatives;
}

function bestRowMatching(
  rows: OptimizerTipRow[],
  predicate: (row: OptimizerTipRow) => boolean,
) {
  return rows.find(predicate) ?? null;
}

function pickOutcomePicks(rows: OptimizerTipRow[], knockout: boolean): OptimizerOutcomePick[] {
  if (knockout) {
    return [
      {
        key: 'homeWin',
        kind: 'homeWin',
        side: 'home',
        advanceSide: 'home',
        tip: bestRowMatching(rows, (row) => row.home > row.away),
      },
      {
        key: 'awayWin',
        kind: 'awayWin',
        side: 'away',
        advanceSide: 'away',
        tip: bestRowMatching(rows, (row) => row.away > row.home),
      },
      {
        key: 'drawHomeAdvance',
        kind: 'drawHomeAdvance',
        side: 'draw',
        advanceSide: 'home',
        tip: bestRowMatching(
          rows,
          (row) => row.home === row.away && row.advanceSide === 'home',
        ),
      },
      {
        key: 'drawAwayAdvance',
        kind: 'drawAwayAdvance',
        side: 'draw',
        advanceSide: 'away',
        tip: bestRowMatching(
          rows,
          (row) => row.home === row.away && row.advanceSide === 'away',
        ),
      },
    ];
  }

  return [
    {
      key: 'homeWin',
      kind: 'homeWin',
      side: 'home',
      advanceSide: null,
      tip: bestRowMatching(rows, (row) => row.home > row.away),
    },
    {
      key: 'draw',
      kind: 'draw',
      side: 'draw',
      advanceSide: null,
      tip: bestRowMatching(rows, (row) => row.home === row.away),
    },
    {
      key: 'awayWin',
      kind: 'awayWin',
      side: 'away',
      advanceSide: null,
      tip: bestRowMatching(rows, (row) => row.away > row.home),
    },
  ];
}

export function runTipOptimizer(input: {
  oddsText: string;
  probabilitiesText?: string;
  sourceMode?: OptimizerSourceMode;
  match: Match & { home_team?: Team | null; away_team?: Team | null };
  homeRating: number | null;
  awayRating: number | null;
  maxGoals?: number;
  currentHome?: number | null;
  currentAway?: number | null;
  sourceBlendWeight?: number;
}): OptimizerResult {
  const maxGoals = input.maxGoals ?? 7;
  const knockout = isKnockoutStage(input.match.stage);
  const sourceBlendWeight = clamp(input.sourceBlendWeight ?? 0.5, 0, 1);
  const oddsParsed = input.oddsText.trim() ? parseOdds(input.oddsText) : { results: [], errors: [] };
  const probabilitiesParsed = (input.probabilitiesText ?? '').trim()
    ? parseScoreProbabilities(input.probabilitiesText ?? '')
    : { results: [], errors: [] };
  const allParsedResults = [...oddsParsed.results, ...probabilitiesParsed.results];

  if (allParsedResults.length === 0) {
    return {
      rows: [],
      bestThree: [],
      alternativeDiffs: [],
      outcomePicks: [],
      possibleResults: [],
      errors: oddsParsed.errors.length > 0 || probabilitiesParsed.errors.length > 0
        ? [...oddsParsed.errors, ...probabilitiesParsed.errors]
        : ['Füge Quoten ein oder lade eine Wahrscheinlichkeits-CSV hoch.'],
      summary: {
        inputOddsCount: 0,
        inputProbabilityCount: 0,
        estimatedCount: 0,
        minHome: 0,
        minAway: 0,
        sourceBlendWeight,
        stageMultiplier: STAGE_MULTIPLIERS[input.match.stage],
      },
    };
  }

  const inferredMinimum = inferMinimumScore(allParsedResults);
  const minHome = input.currentHome ?? inferredMinimum.minHome;
  const minAway = input.currentAway ?? inferredMinimum.minAway;
  const possibleOddsInputResults = oddsParsed.results.filter((r) => r.home >= minHome && r.away >= minAway);
  const possibleProbabilityInputResults = probabilitiesParsed.results.filter((r) => r.home >= minHome && r.away >= minAway);
  const oddsWithMissing = estimateMissingResults(possibleOddsInputResults, maxGoals, minHome, minAway);
  const oddsNormalised = normaliseOddsProbabilities(oddsWithMissing) as (OptimizerOddResult & { oddsProbability: number })[];
  const probabilitiesNormalised = normaliseOddsProbabilities(possibleProbabilityInputResults) as (OptimizerOddResult & { oddsProbability: number })[];
  const oddsMap = new Map(oddsNormalised.map((result) => [result.label, result]));
  const probabilitiesMap = new Map(probabilitiesNormalised.map((result) => [result.label, result]));
  const labels = new Set([...oddsMap.keys(), ...probabilitiesMap.keys()]);
  const oddsAvailable = oddsNormalised.length > 0;
  const probabilitiesAvailable = probabilitiesNormalised.length > 0;
  const modelWeight = oddsAvailable && probabilitiesAvailable ? sourceBlendWeight : probabilitiesAvailable ? 1 : 0;

  const combined = Array.from(labels).map((label) => {
    const oddsResult = oddsMap.get(label);
    const probabilityResult = probabilitiesMap.get(label);
    const template = probabilityResult ?? oddsResult;
    const oddsProbability = oddsResult?.oddsProbability ?? 0;
    const modelProbability = probabilityResult?.oddsProbability ?? 0;
    const probability = oddsProbability * (1 - modelWeight) + modelProbability * modelWeight;

    return {
      home: template?.home ?? 0,
      away: template?.away ?? 0,
      label,
      odd: probability > 0 ? 1 / probability : 999999999,
      estimated: Boolean(oddsResult?.estimated && !probabilityResult),
      rawProbability: probability,
      oddsProbability,
      rankingProbability: modelProbability,
      probability,
    };
  });

  const probabilitySum = combined.reduce((sum, result) => sum + result.probability, 0);
  const possibleResults = combined
    .map((result) => ({
      ...result,
      probability: probabilitySum > 0 ? result.probability / probabilitySum : result.probability,
      rawProbability: probabilitySum > 0 ? result.rawProbability / probabilitySum : result.rawProbability,
    }))
    .filter((result) => result.probability > 0) as OptimizerResult['possibleResults'];
  const stageMultiplier = STAGE_MULTIPLIERS[input.match.stage];
  const rows = calculateAllTips(
    possibleResults,
    maxGoals,
    minHome,
    minAway,
    stageMultiplier,
    knockout,
  );
  const bestThree = rows.slice(0, 3);
  const alternativeDiffs = pickAlternativeDiffs(rows, bestThree);
  const outcomePicks = pickOutcomePicks(rows, knockout);

  return {
    rows,
    bestThree,
    alternativeDiffs,
    outcomePicks,
    possibleResults,
    errors: [...oddsParsed.errors, ...probabilitiesParsed.errors],
    summary: {
      inputOddsCount: possibleOddsInputResults.length,
      inputProbabilityCount: possibleProbabilityInputResults.length,
      estimatedCount: possibleResults.filter((r) => r.estimated).length,
      minHome,
      minAway,
      sourceBlendWeight,
      stageMultiplier,
    },
  };
}
