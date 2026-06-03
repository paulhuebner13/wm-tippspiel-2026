import type { Match, Prediction, Stage } from './types';

// Change the whole scoring system here.
export const POINTS = {
  exact: 7,
  goalDifference: 5,
  outcome: 3,
  knockoutAdvanceWinner: 3,
};

// Change or remove multipliers here.
export const STAGE_MULTIPLIERS: Record<Stage, number> = {
  group: 1,
  round_of_32: 2,
  round_of_16: 3,
  quarter_final: 4,
  semi_final: 5,
  third_place: 5,
  final: 6,
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

export function isKnockoutStage(stage: Stage): boolean {
  return stage !== 'group';
}

export function calculateBasePoints(match: Match, prediction: Prediction): number {
  if (!match.is_finished || match.home_score === null || match.away_score === null) {
    return 0;
  }

  const realHome = match.home_score;
  const realAway = match.away_score;
  const tipHome = prediction.predicted_home_score;
  const tipAway = prediction.predicted_away_score;

  let points = 0;

  if (realHome === tipHome && realAway === tipAway) {
    points = POINTS.exact;
  } else if (realHome - realAway === tipHome - tipAway) {
    points = POINTS.goalDifference;
  } else if (outcome(realHome, realAway) === outcome(tipHome, tipAway)) {
    points = POINTS.outcome;
  }

  if (
    isKnockoutStage(match.stage) &&
    tipHome === tipAway &&
    match.winner_team_id !== null &&
    prediction.advance_team_id === match.winner_team_id
  ) {
    points += POINTS.knockoutAdvanceWinner;
  }

  return points;
}

export function calculateTotalPoints(match: Match, prediction: Prediction): number {
  return calculateBasePoints(match, prediction) * STAGE_MULTIPLIERS[match.stage];
}
