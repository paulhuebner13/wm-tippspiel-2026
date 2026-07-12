import { Nav } from '@/components/Nav';
import { requireUser } from '@/lib/session';
import { calculateTotalPoints, getStageLabel, STAGE_MULTIPLIERS } from '@/lib/scoring';
import { loadRankingContextForUser } from '@/lib/rankingPoints';
import type { Match, Prediction, Stage } from '@/lib/types';

type RankingRow = {
  user: Awaited<ReturnType<typeof loadRankingContextForUser>>['profiles'][number];
  total: number;
  last24HoursTotal: number;
  stageTotals: Record<Stage, number>;
};

const STAGE_ORDER = Object.keys(STAGE_MULTIPLIERS) as Stage[];

function startedInLast24Hours(match: Match, now = Date.now()) {
  const kickoff = new Date(match.kickoff_time).getTime();
  if (Number.isNaN(kickoff)) return false;
  const dayAgo = now - 24 * 60 * 60 * 1000;
  return kickoff >= dayAgo && kickoff <= now;
}

function calculateLast24HoursTotal(
  profileId: string,
  matchesById: Map<string, Match>,
  predictions: Prediction[],
  now: number,
) {
  return predictions.reduce((sum, prediction) => {
    if (prediction.user_id !== profileId) return sum;
    const match = matchesById.get(prediction.match_id);
    if (!match || !startedInLast24Hours(match, now)) return sum;
    return sum + calculateTotalPoints(match, prediction);
  }, 0);
}

export default async function RankingPage() {
  const user = await requireUser();
  const rankingContext = await loadRankingContextForUser(user);
  const matchesById = new Map(rankingContext.matches.map((match) => [match.id, match]));
  const now = Date.now();

  const ranking: RankingRow[] = rankingContext.rows
    .map((row) => ({
      ...row,
      last24HoursTotal: calculateLast24HoursTotal(
        row.user.id,
        matchesById,
        rankingContext.predictions,
        now,
      ),
    }))
    .sort((a, b) => b.total - a.total || a.user.username.localeCompare(b.user.username, 'de-AT'));

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
