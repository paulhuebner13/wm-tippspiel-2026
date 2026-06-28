import type { Match, Prediction, Stage } from './types';

// Change the whole scoring system here.
export const POINTS = {
  exact: 7,
  goalDifference: 5,
  outcome: 3,
  knockoutAdvanceWinner: 3,
  knockoutAdvanceTeam: 1,
};

// Change or remove multipliers here.
export const STAGE_MULTIPLIERS: Record<Stage, number> = {
  group: 1,
  round_of_32: 2,
  round_of_16: 2.5,
  quarter_final: 3,
  semi_final: 3.5,
  third_place: 3,
  final: 4,
};

export function getStageLabel(stage: Stage): string {
  const labels: Record<Stage, string> = {
    group: 'Gruppenphase',
    round_of_32: 'Sechzehntelfinale',
    round_of_16: 'Achtelfinale',
    quarter_final: 'Viertelfinale',
    semi_final: 'Halbfinale',
    third_place: 'Spiel um Platz 3',
    final: 'Finale',
  };

  return labels[stage];
}

function outcome(scoreA: number, scoreB: number): 'home' | 'away' | 'draw' {
  if (scoreA > scoreB) return 'home';
  if (scoreA < scoreB) return 'away';
  return 'draw';
}

function sideTeamId(match: Match, side: 'home' | 'away' | 'draw') {
  if (side === 'home') return match.home_team_id;
  if (side === 'away') return match.away_team_id;
  return null;
}

export function isKnockoutStage(stage: Stage): boolean {
  return stage !== 'group';
}

export function calculateBasePoints(match: Match, prediction: Prediction): number {
  const officialHome = match.home_score;
  const officialAway = match.away_score;
  const provisionalHome = match.provisional_home_score;
  const provisionalAway = match.provisional_away_score;
  const hasOfficialResult =
    typeof officialHome === 'number' && typeof officialAway === 'number';
  const hasProvisionalResult =
    typeof provisionalHome === 'number' && typeof provisionalAway === 'number';

  if (!hasOfficialResult && !hasProvisionalResult) {
    return 0;
  }

  const realHome = hasOfficialResult ? officialHome : provisionalHome;
  const realAway = hasOfficialResult ? officialAway : provisionalAway;
  const realWinnerTeamId = hasOfficialResult
    ? match.winner_team_id ?? null
    : match.provisional_winner_team_id ?? null;
  const tipHome = prediction.predicted_home_score;
  const tipAway = prediction.predicted_away_score;

  if (
    typeof realHome !== 'number' ||
    typeof realAway !== 'number' ||
    tipHome === null ||
    tipAway === null
  ) {
    return 0;
  }

  let points = 0;
  const realOutcome = outcome(realHome, realAway);
  const tipOutcome = outcome(tipHome, tipAway);

  if (realHome === tipHome && realAway === tipAway) {
    points = POINTS.exact;
  } else if (realHome - realAway === tipHome - tipAway) {
    points = POINTS.goalDifference;
  } else if (realOutcome === tipOutcome) {
    points = POINTS.outcome;
  }

  if (!isKnockoutStage(match.stage) || realWinnerTeamId === null) {
    return points;
  }

  const tipWinnerTeamId = sideTeamId(match, tipOutcome);

  if (
    tipOutcome === 'draw' &&
    realOutcome === 'draw' &&
    prediction.advance_team_id === realWinnerTeamId
  ) {
    points += POINTS.knockoutAdvanceWinner;
  }

  if (
    tipOutcome === 'draw' &&
    realOutcome !== 'draw' &&
    prediction.advance_team_id === realWinnerTeamId
  ) {
    points += POINTS.knockoutAdvanceTeam;
  }

  if (
    tipOutcome !== 'draw' &&
    realOutcome === 'draw' &&
    tipWinnerTeamId === realWinnerTeamId
  ) {
    points += POINTS.knockoutAdvanceTeam;
  }

  return points;
}

export function calculateTotalPoints(match: Match, prediction: Prediction): number {
  return calculateBasePoints(match, prediction) * STAGE_MULTIPLIERS[match.stage];
}
