import { Nav } from '@/components/Nav';
import { requireUser } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getVisibleProfilesForUser, getVisibleProfileIdSet } from '@/lib/visibility';
import { calculateTotalPoints, getStageLabel, STAGE_MULTIPLIERS } from '@/lib/scoring';
import type { Match, Prediction, Profile, Stage } from '@/lib/types';

type RankingRow = {
  user: Profile;
  total: number;
  last24HoursTotal: number;
  stageTotals: Record<Stage, number>;
};

const STAGE_ORDER = Object.keys(STAGE_MULTIPLIERS) as Stage[];
const PREDICTION_PAGE_SIZE = 1000;

function emptyStageTotals(): Record<Stage, number> {
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


async function loadVisiblePredictions(visibleProfileIds: Set<string>) {
  const userIds = Array.from(visibleProfileIds);
  if (userIds.length === 0) return [] as Prediction[];

  const predictions: Prediction[] = [];
  let from = 0;

  while (true) {
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
    from += PREDICTION_PAGE_SIZE;
  }

  return predictions;
}

function startedInLast24Hours(match: Match, now = Date.now()) {
  const kickoff = new Date(match.kickoff_time).getTime();
  if (Number.isNaN(kickoff)) return false;
  const dayAgo = now - 24 * 60 * 60 * 1000;
  return kickoff >= dayAgo && kickoff <= now;
}

export default async function RankingPage() {
  const user = await requireUser();

  const profiles = await getVisibleProfilesForUser(user);
  const visibleProfileIds = getVisibleProfileIdSet(profiles);

  const { data: matchesData } = await supabaseAdmin
    .from('matches')
    .select('*');

  const predictions = await loadVisiblePredictions(visibleProfileIds);

  const matches = (matchesData ?? []) as Match[];
  const now = Date.now();

  const ranking: RankingRow[] = profiles
    .map((profile) => {
      const stageTotals = emptyStageTotals();

      const profilePredictions = predictions.filter((prediction) => prediction.user_id === profile.id);
      const total = profilePredictions.reduce((sum, prediction) => {
        const match = matches.find((item) => item.id === prediction.match_id);

        if (!match) {
          return sum;
        }

        const points = calculateTotalPoints(match, prediction);
        stageTotals[match.stage] += points;

        return sum + points;
      }, 0);

      const last24HoursTotal = profilePredictions.reduce((sum, prediction) => {
        const match = matches.find((item) => item.id === prediction.match_id);
        if (!match || !startedInLast24Hours(match, now)) return sum;
        return sum + calculateTotalPoints(match, prediction);
      }, 0);

      return { user: profile, total, last24HoursTotal, stageTotals };
    })
    .sort((a, b) => b.total - a.total || a.user.username.localeCompare(b.user.username));

  return (
    <>
      <Nav user={user} />
      <main className="page">
        <h1>Ranking</h1>
        <section className="card">
          <ol className="rankingList rankingListExpandable">
            {ranking.map((row, index) => {
              const medalClass = index === 0 ? 'rankingGold' : index === 1 ? 'rankingSilver' : index === 2 ? 'rankingBronze' : '';
              const ownClass = row.user.id === user.id ? 'ownRanking' : '';

              return (
              <li key={row.user.id} className={[ownClass, medalClass].filter(Boolean).join(' ')}>
                <details className="rankingDetails">
                  <summary>
                    <span>{index + 1}. {row.user.username}</span>
                    <span className="rankingPointsCluster">
                      <span className="rankingRecentPoints">+{row.last24HoursTotal}</span>
                      <strong>{row.total} Punkte</strong>
                    </span>
                  </summary>

                  <div className="rankingBreakdown">
                    {STAGE_ORDER.map((stage) => (
                      <div key={stage}>
                        <span>{getStageLabel(stage)}</span>
                        <strong>{row.stageTotals[stage]} Punkte</strong>
                      </div>
                    ))}
                  </div>
                </details>
              </li>
              );
            })}
          </ol>
        </section>
      </main>
    </>
  );
}
