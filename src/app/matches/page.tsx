import { Nav } from '@/components/Nav';
import { MatchCard } from '@/components/MatchCard';
import { AutoScrollToCurrent } from '@/components/AutoScrollToCurrent';
import { requireUser } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getVisibleProfilesForUser, getVisibleProfileIdSet } from '@/lib/visibility';
import { isMatchStillRelevant, isPredictionLocked } from '@/lib/time';
import type { Match, Prediction, Profile } from '@/lib/types';

export default async function MatchesPage() {
  const user = await requireUser();

  const { data: matchesData, error: matchesError } = await supabaseAdmin
    .from('matches')
    .select(`
      *,
      home_team:teams!matches_home_team_id_fkey(*),
      away_team:teams!matches_away_team_id_fkey(*)
    `)
    .order('kickoff_time', { ascending: true });

  if (matchesError) throw new Error(matchesError.message);

  const visibleProfiles = await getVisibleProfilesForUser(user);
  const visibleProfileIds = getVisibleProfileIdSet(visibleProfiles);

  const { data: predictionsData } = await supabaseAdmin
    .from('predictions')
    .select(`
      *,
      profile:profiles!predictions_user_id_fkey(id, username, is_admin)
    `);

  const matches = (matchesData ?? []) as Match[];
  const predictions = ((predictionsData ?? []) as Prediction[]).filter((prediction) => prediction.user_id === user.id || visibleProfileIds.has(prediction.user_id));
  const now = new Date();
  const currentMatchId = matches.find((match) => isMatchStillRelevant(match.kickoff_time, now))?.id;
  const displayNumbers = new Map(
    [...matches]
      .sort((a, b) => {
        const dateDiff = new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime();
        return dateDiff !== 0 ? dateDiff : a.match_number - b.match_number;
      })
      .map((match, index) => [match.id, index + 1]),
  );

  return (
    <>
      <Nav user={user} />
      <main className="page">
        <AutoScrollToCurrent />
        <h1>Tipps</h1>
        <p className="subtle">Tipps können bis zum Anpfiff geändert werden. Änderungen werden automatisch gespeichert.</p>
        <div className="list">
          {matches.map((match) => {
            const matchPredictions = predictions.filter((prediction) => prediction.match_id === match.id);
            const ownPrediction = matchPredictions.find((prediction) => prediction.user_id === user.id);
            const showAllPredictions = isPredictionLocked(match.kickoff_time, now);

            return (
              <MatchCard
                key={match.id}
                match={{ ...match, predictions: matchPredictions }}
                ownPrediction={ownPrediction}
                showAllPredictions={showAllPredictions}
                currentUserId={user.id}
                visibleProfiles={visibleProfiles as Profile[]}
                current={match.id === currentMatchId}
                displayMatchNumber={displayNumbers.get(match.id)}
              />
            );
          })}
        </div>
      </main>
    </>
  );
}
