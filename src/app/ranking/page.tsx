import { Nav } from '@/components/Nav';
import { requireUser } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { calculateTotalPoints } from '@/lib/scoring';
import type { Match, Prediction, Profile } from '@/lib/types';

type RankingRow = {
  user: Profile;
  total: number;
};

export default async function RankingPage() {
  const user = await requireUser();

  const { data: profilesData } = await supabaseAdmin
    .from('profiles')
    .select('id, username, is_admin')
    .order('username', { ascending: true });

  const { data: matchesData } = await supabaseAdmin
    .from('matches')
    .select('*')
    .eq('is_finished', true);

  const { data: predictionsData } = await supabaseAdmin
    .from('predictions')
    .select('*');

  const profiles = (profilesData ?? []) as Profile[];
  const matches = (matchesData ?? []) as Match[];
  const predictions = (predictionsData ?? []) as Prediction[];

  const ranking: RankingRow[] = profiles
    .map((profile) => {
      const total = predictions
        .filter((prediction) => prediction.user_id === profile.id)
        .reduce((sum, prediction) => {
          const match = matches.find((item) => item.id === prediction.match_id);
          return match ? sum + calculateTotalPoints(match, prediction) : sum;
        }, 0);

      return { user: profile, total };
    })
    .sort((a, b) => b.total - a.total || a.user.username.localeCompare(b.user.username));

  return (
    <>
      <Nav user={user} />
      <main className="page">
        <h1>Ranking</h1>
        <section className="card">
          <ol className="rankingList">
            {ranking.map((row, index) => (
              <li key={row.user.id} className={row.user.id === user.id ? 'ownRanking' : ''}>
                <span>{index + 1}. {row.user.username}</span>
                <strong>{row.total} Punkte</strong>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </>
  );
}
