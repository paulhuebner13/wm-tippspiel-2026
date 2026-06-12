import { Nav } from '@/components/Nav';
import { requireUser } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getVisibleProfilesForUser, getVisibleProfileIdSet } from '@/lib/visibility';
import { calculateTotalPoints, getStageLabel, STAGE_MULTIPLIERS } from '@/lib/scoring';
import type { Match, Prediction, Profile, Stage } from '@/lib/types';

type RankingRow = {
  user: Profile;
  total: number;
  stageTotals: Record<Stage, number>;
};

const STAGE_ORDER = Object.keys(STAGE_MULTIPLIERS) as Stage[];

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

export default async function RankingPage() {
  const user = await requireUser();

  const profiles = await getVisibleProfilesForUser(user);
  const visibleProfileIds = getVisibleProfileIdSet(profiles);

  const { data: matchesData } = await supabaseAdmin
    .from('matches')
    .select('*')
    .eq('is_finished', true);

  const { data: predictionsData } = await supabaseAdmin
    .from('predictions')
    .select('*');

  const matches = (matchesData ?? []) as Match[];
  const predictions = ((predictionsData ?? []) as Prediction[]).filter((prediction) => visibleProfileIds.has(prediction.user_id));

  const ranking: RankingRow[] = profiles
    .map((profile) => {
      const stageTotals = emptyStageTotals();

      const total = predictions
        .filter((prediction) => prediction.user_id === profile.id)
        .reduce((sum, prediction) => {
          const match = matches.find((item) => item.id === prediction.match_id);

          if (!match) {
            return sum;
          }

          const points = calculateTotalPoints(match, prediction);
          stageTotals[match.stage] += points;

          return sum + points;
        }, 0);

      return { user: profile, total, stageTotals };
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
                    <strong>{row.total} Punkte</strong>
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
