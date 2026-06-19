import { overridePredictionAction } from '@/app/actions';
import { Flag } from '@/components/Flag';
import { Nav } from '@/components/Nav';
import { LocalDateTime } from '@/components/LocalDateTime';
import { requireAdmin } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getStageLabel, isKnockoutStage } from '@/lib/scoring';
import type { Match, Profile } from '@/lib/types';

type ChangesPageProps = {
  searchParams?: Promise<{ profileId?: string; matchNumber?: string }>;
};

function teamName(match: Match, side: 'home' | 'away') {
  if (side === 'home') return match.home_team?.name ?? match.home_placeholder ?? 'Offen';
  return match.away_team?.name ?? match.away_placeholder ?? 'Offen';
}

export default async function ChangesPage({ searchParams }: ChangesPageProps) {
  const user = await requireAdmin();
  const params = await searchParams;

  const { data: profilesData } = await supabaseAdmin
    .from('profiles')
    .select('id, username, is_admin')
    .order('username', { ascending: true });

  const profiles = (profilesData ?? []) as Profile[];
  const selectedProfileId = params?.profileId && profiles.some((profile) => profile.id === params.profileId) ? params.profileId : profiles[0]?.id ?? '';
  const matchNumber = params?.matchNumber ?? '';
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId);

  let match: Match | null = null;
  if (matchNumber.trim() !== '') {
    const parsedMatchNumber = Number(matchNumber);
    if (Number.isInteger(parsedMatchNumber)) {
      const { data: matchData } = await supabaseAdmin
        .from('matches')
        .select(`
          *,
          home_team:teams!matches_home_team_id_fkey(*),
          away_team:teams!matches_away_team_id_fkey(*)
        `)
        .eq('match_number', parsedMatchNumber)
        .single();

      match = (matchData ?? null) as Match | null;

    }
  }

  return (
    <>
      <Nav user={user} />
      <main className="page">
        <h1>Änderungen</h1>

        <section className="card changeSearchCard">
          <h2>Tipp suchen</h2>
          <form className="changeSearchForm" method="get" action="/changes">
            <label>
              Spieler
              <select name="profileId" defaultValue={selectedProfileId} required>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>{profile.username}</option>
                ))}
              </select>
            </label>
            <label>
              Spielnummer
              <input name="matchNumber" type="number" min="1" inputMode="numeric" defaultValue={matchNumber} placeholder="z. B. 17" required />
            </label>
            <button type="submit">Suchen</button>
          </form>
        </section>

        {matchNumber && !match && (
          <section className="card">
            <p className="subtle">Kein Spiel mit dieser Spielnummer gefunden.</p>
          </section>
        )}

        {match && selectedProfile && (
          <section className="card changeEditCard">
            <div className="matchMeta">
              <span>Spiel {match.match_number}</span>
              <span>{getStageLabel(match.stage)}</span>
              <span><LocalDateTime value={match.kickoff_time} /></span>
            </div>

            <div className="teamsRow">
              <div className="team sideHome"><span className="teamName">{teamName(match, 'home')}</span><Flag team={match.home_team} /></div>
              <div className="scoreMiddle"><strong>{match.is_finished ? `${match.home_score}:${match.away_score}` : '-'}</strong></div>
              <div className="team sideAway"><Flag team={match.away_team} /><span className="teamName">{teamName(match, 'away')}</span></div>
            </div>

            <form action={overridePredictionAction} className="adminForm changeOverrideForm">
              <input type="hidden" name="userId" value={selectedProfile.id} />
              <input type="hidden" name="matchId" value={match.id} />
              <input type="hidden" name="matchNumber" value={match.match_number} />

              <label>
                Tipp {teamName(match, 'home')}
                <input name="predictedHomeScore" type="number" min="0" inputMode="numeric" defaultValue="" required />
              </label>
              <label>
                Tipp {teamName(match, 'away')}
                <input name="predictedAwayScore" type="number" min="0" inputMode="numeric" defaultValue="" required />
              </label>

              {isKnockoutStage(match.stage) && (
                <label>
                  Weiterkommer bei Remis
                  <select name="advanceTeamId" defaultValue="">
                    <option value="">Nur bei Remis wählen</option>
                    {match.home_team && <option value={match.home_team.id}>{match.home_team.name}</option>}
                    {match.away_team && <option value={match.away_team.id}>{match.away_team.name}</option>}
                  </select>
                </label>
              )}

              <button type="submit">Tipp für {selectedProfile.username} überschreiben</button>
            </form>
          </section>
        )}
      </main>
    </>
  );
}
