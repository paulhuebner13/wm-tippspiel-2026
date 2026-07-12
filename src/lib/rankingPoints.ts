import { calculateTotalPoints } from './scoring';
import type { Match, Prediction, Profile, Stage } from './types';

export type RankingPointRow = {
  user: Profile;
  total: number;
  stageTotals: Record<Stage, number>;
};

export function emptyRankingStageTotals(): Record<Stage, number> {
  return {
    group: 0,
    round_of_32: 0,
    round_of_16: 0,
    quarter_final: 0,
    semi_final: 0,
    third_place: 0,
    final: 0,
  };
}

export function calculateRankingPointsByProfileId(
  profiles: Profile[],
  matches: Match[],
  predictions: Prediction[],
) {
  const matchById = new Map(matches.map((match) => [match.id, match]));
  const pointsByProfileId = new Map<string, number>();

  for (const profile of profiles) {
    pointsByProfileId.set(profile.id, 0);
  }

  for (const prediction of predictions) {
    if (!pointsByProfileId.has(prediction.user_id)) continue;
    const match = matchById.get(prediction.match_id);
    if (!match) continue;
    pointsByProfileId.set(
      prediction.user_id,
      (pointsByProfileId.get(prediction.user_id) ?? 0) + calculateTotalPoints(match, prediction),
    );
  }

  return pointsByProfileId;
}

export function calculateRankingRows(
  profiles: Profile[],
  matches: Match[],
  predictions: Prediction[],
): RankingPointRow[] {
  const matchById = new Map(matches.map((match) => [match.id, match]));

  return profiles.map((profile) => {
    const stageTotals = emptyRankingStageTotals();
    let total = 0;

    for (const prediction of predictions) {
      if (prediction.user_id !== profile.id) continue;
      const match = matchById.get(prediction.match_id);
      if (!match) continue;
      const points = calculateTotalPoints(match, prediction);
      total += points;
      stageTotals[match.stage] += points;
    }

    return { user: profile, total, stageTotals };
  });
}
