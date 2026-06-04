import { Nav } from '@/components/Nav';
import { Flag } from '@/components/Flag';
import { ResultUserPicker } from '@/components/ResultUserPicker';
import { requireUser } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { calculateTotalPoints, getStageLabel } from '@/lib/scoring';
import { formatKickoff } from '@/lib/time';
import type { Match, Prediction, Profile } from '@/lib/types';

type ResultsPageProps = {
  searchParams?: Promise<{ userId?: string }>;
};

function resultTeamName(match: Match, side: 'home' | 'away') {
  if (side === 'home') return match.home_team?.name ?? match.home_placeholder ?? 'Offen';
  return match.away_team?.name ?? match.away_placeholder ?? 'Offen';
}

export default async function ResultsPage({ searchParams }: ResultsPageProps) {
  const user = await requireUser();
  const params = await searchParams;

  const { data: profilesData } = await supabaseAdmin
    .from('profiles')
    .select('id, username, is_admin')
    .order('username', { ascending: true });

  const profiles = (profilesData ?? []) as Profile[];
  const selectedUserId = params?.userId && profiles.some((profile) => profile.id === params.userId) ? params.userId : user.id;
  const selectedProfile = profiles.find((profile) => profile.id === selectedUserId) ?? user;

  const { data: matchesData } = await supabaseAdmin
    .from('matches')
    .select(`
      *,
      home_team:teams!matches_home_team_id_fkey(*),
      away_team:teams!matches_away_team_id_fkey(*)
    `)
    .eq('is_finished', true)
    .order('kickoff_time', { ascending: true });

  const { data: predictionsData } = await supabaseAdmin
    .from('predictions')
    .select('*')
    .eq('user_id', selectedUserId);

  const matches = (matchesData ?? []) as Match[];
  const predictions = (predictionsData ?? []) as Prediction[];

  return (
    <>
      <Nav user={user} />
      <main className="page">
        <div className="pageHeaderBlock">
          <div>
            <h1>Ergebnisse</h1>
            <p className="subtle">Angezeigt werden die Tipps von {selectedProfile.username}.</p>
          </div>

          <ResultUserPicker profiles={profiles} selectedUserId={selectedUserId} ownUserId={user.id} />
        </div>

        <div className="list">
          {matches.length === 0 && <p className="subtle">Noch keine fertigen Spiele.</p>}
          {matches.map((match) => {
            const prediction = predictions.find((item) => item.match_id === match.id);
            const points = prediction ? calculateTotalPoints(match, prediction) : 0;

            return (
              <article className="card resultCard" key={match.id}>
                <div className="resultMainArea">
                  <div className="resultContentArea">
                    <div className="matchMeta resultMeta">
                      <span>Spiel {match.match_number}</span>
                      <span>{getStageLabel(match.stage)}</span>
                      <span>{formatKickoff(match.kickoff_time)}</span>
                    </div>

                    <div className="resultScoreGrid">
                      <div className="team sideHome">
                        <span className="teamName">{resultTeamName(match, 'home')}</span>
                        <Flag team={match.home_team} />
                      </div>

                      <div className="resultCenterStack">
                        <div className="resultScoreLabel">Ergebnis</div>
                        <div className="resultScoreNumbers">
                          <span>{match.home_score}</span>
                          <span>:</span>
                          <span>{match.away_score}</span>
                        </div>
                      </div>

                      <div className="team sideAway">
                        <Flag team={match.away_team} />
                        <span className="teamName">{resultTeamName(match, 'away')}</span>
                      </div>
                    </div>

                    <div className="tipUnderResult">
                      {prediction ? (
                        <>
                          <div className="resultScoreLabel">Tipp</div>
                          <div className="tipScoreNumbers">
                            <span>{prediction.predicted_home_score}</span>
                            <span>:</span>
                            <span>{prediction.predicted_away_score}</span>
                          </div>
                        </>
                      ) : (
                        <span className="subtle">Kein Tipp abgegeben.</span>
                      )}
                    </div>
                  </div>

                  <aside className="pointsPanel">
                    <div className="pointsValue">{points}</div>
                    <div className="pointsLabel">Punkte</div>
                  </aside>
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </>
  );
}
