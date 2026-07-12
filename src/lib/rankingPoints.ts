import { calculateTotalPoints } from './scoring';
import { supabaseAdmin } from './supabaseAdmin';
import type { Match, Prediction, Profile, Stage } from './types';
import { getVisibleProfileIdSet, getVisibleProfilesForUser } from './visibility';

export type RankingPointRow = {
  user: Profile;
  total: number;
  stageTotals: Record<Stage, number>;
};

export type RankingContext<TMatch extends Match = Match> = {
  profiles: Profile[];
  visibleProfileIds: Set<string>;
  matches: TMatch[];
  predictions: Prediction[];
  rows: RankingPointRow[];
  pointsByProfileId: Map<string, number>;
};

const PREDICTION_PAGE_SIZE = 1000;

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

export async function loadVisibleRankingPredictions(
  visibleProfileIds: Set<string>,
): Promise<Prediction[]> {
  const userIds = Array.from(visibleProfileIds);
  if (userIds.length === 0) return [];

  const predictions: Prediction[] = [];

  for (let from = 0; ; from += PREDICTION_PAGE_SIZE) {
    const to = from + PREDICTION_PAGE_SIZE - 1;
    const { data, error } = await supabaseAdmin
      .from('predictions')
      .select('*')
      .in('user_id', userIds)
      .range(from, to);

    if (error) {
      throw new Error(`Could not load ranking predictions: ${error.message}`);
    }

    const page = (data ?? []) as Prediction[];
    predictions.push(...page);

    if (page.length < PREDICTION_PAGE_SIZE) break;
  }

  return predictions;
}

export function calculateRankingPointsByProfileId(
  profiles: Profile[],
  matches: Match[],
  predictions: Prediction[],
) {
  const rows = calculateRankingRows(profiles, matches, predictions);
  return new Map(rows.map((row) => [row.user.id, row.total]));
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

export async function loadRankingContextForUser<TMatch extends Match = Match>(
  user: Profile,
  matchSelect = '*',
): Promise<RankingContext<TMatch>> {
  const profiles = await getVisibleProfilesForUser(user);
  const visibleProfileIds = getVisibleProfileIdSet(profiles);

  const [{ data: matchesData, error: matchesError }, predictions] = await Promise.all([
    supabaseAdmin
      .from('matches')
      .select(matchSelect)
      .order('kickoff_time', { ascending: true }),
    loadVisibleRankingPredictions(visibleProfileIds),
  ]);

  if (matchesError) {
    throw new Error(`Could not load ranking matches: ${matchesError.message}`);
  }

  const matches = (matchesData ?? []) as TMatch[];
  const rows = calculateRankingRows(profiles, matches, predictions).sort(
    (a, b) => b.total - a.total || a.user.username.localeCompare(b.user.username, 'de-AT'),
  );
  const pointsByProfileId = new Map(rows.map((row) => [row.user.id, row.total]));

  return {
    profiles,
    visibleProfileIds,
    matches,
    predictions,
    rows,
    pointsByProfileId,
  };
}
