import { createProfileAction, deleteProfileAction, saveResultAction, updateKnockoutTeamsAction } from '@/app/actions';
import { Nav } from '@/components/Nav';
import { Flag } from '@/components/Flag';
import { requireAdmin } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { formatKickoff } from '@/lib/time';
import { getStageLabel, isKnockoutStage } from '@/lib/scoring';
import type { Match, Profile, Team } from '@/lib/types';

export default async function AdminPage() {
  const user = await requireAdmin();

  const { data: matchesData } = await supabaseAdmin
    .from('matches')
    .select(`
      *,
      home_team:teams!matches_home_team_id_fkey(*),
      away_team:teams!matches_away_team_id_fkey(*)
    `)
    .order('kickoff_time', { ascending: true });

  const { data: teamsData } = await supabaseAdmin
    .from('teams')
    .select('*')
    .order('name', { ascending: true });

  const { data: profilesData } = await supabaseAdmin
    .from('profiles')
    .select('id, username, is_admin')
    .order('username', { ascending: true });

  const matches = (matchesData ?? []) as Match[];
  const teams = (teamsData ?? []) as Team[];
  const profiles = (profilesData ?? []) as Profile[];

  return (
    <>
      <Nav user={user} />
      <main className="page">
        <h1>Admin</h1>
        <p className="subtle">Hier trägst du Ergebnisse ein, öffnest K.-o.-Spiele und verwaltest die Spieler.</p>

        <section className="card userAdminCard">
          <h2>Spieler verwalten</h2>
          <p className="subtle smallSubtle">Neuen Spieler erstellen oder ein bestehendes Passwort überschreiben. Normale Spieler bekommen keinen Admin-Zugang.</p>

          <form action={createProfileAction} className="userCreateForm">
            <label>
              Name
              <input name="username" placeholder="z. B. Lukas" autoComplete="off" required />
            </label>
            <label>
              Passwort
              <input name="password" type="text" placeholder="z. B. CR7" autoComplete="off" required />
            </label>
            <label className="checkboxLabel">
              <input name="isAdmin" type="checkbox" />
              Admin-Rechte geben
            </label>
            <button type="submit">Spieler speichern</button>
          </form>

          <div className="userList">
            {profiles.map((profile) => (
              <div className="userRow" key={profile.id}>
                <div>
                  <strong>{profile.username}</strong>
                  <span>{profile.is_admin ? 'Admin' : 'Spieler'}</span>
                </div>
                {profile.id !== user.id ? (
                  <form action={deleteProfileAction}>
                    <input type="hidden" name="profileId" value={profile.id} />
                    <button className="dangerButton" type="submit">Löschen</button>
                  </form>
                ) : (
                  <span className="selfBadge">Du</span>
                )}
              </div>
            ))}
          </div>
        </section>

        <div className="list">
          {matches.map((match) => {
            const homeName = match.home_team?.name ?? match.home_placeholder ?? 'Offen';
            const awayName = match.away_team?.name ?? match.away_placeholder ?? 'Offen';

            return (
              <article className="card adminCard" key={match.id}>
                <div className="matchMeta">
                  <span>Spiel {match.match_number}</span>
                  <span>{getStageLabel(match.stage)}</span>
                  <span>{formatKickoff(match.kickoff_time)}</span>
                </div>

                <div className="teamsRow">
                  <div className="team sideHome"><span className="teamName">{homeName}</span><Flag team={match.home_team} /></div>
                  <div className="scoreMiddle"><strong>{match.is_finished ? `${match.home_score}:${match.away_score}` : '-'}</strong></div>
                  <div className="team sideAway"><Flag team={match.away_team} /><span className="teamName">{awayName}</span></div>
                </div>

                {isKnockoutStage(match.stage) && (
                  <form action={updateKnockoutTeamsAction} className="adminForm">
                    <input type="hidden" name="matchId" value={match.id} />
                    <label>
                      Heimteam
                      <select name="homeTeamId" defaultValue={match.home_team_id ?? ''}>
                        <option value="">Offen lassen</option>
                        {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                      </select>
                    </label>
                    <label>
                      Auswärtsteam
                      <select name="awayTeamId" defaultValue={match.away_team_id ?? ''}>
                        <option value="">Offen lassen</option>
                        {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                      </select>
                    </label>
                    <label className="checkboxLabel">
                      <input name="openForPredictions" type="checkbox" defaultChecked={match.is_open_for_predictions} />
                      Tipps öffnen
                    </label>
                    <button type="submit">Teams speichern</button>
                  </form>
                )}

                <form action={saveResultAction} className="adminForm resultForm">
                  <input type="hidden" name="matchId" value={match.id} />
                  <label>
                    Tore {homeName}
                    <input name="homeScore" type="number" min="0" inputMode="numeric" defaultValue={match.home_score ?? ''} required />
                  </label>
                  <label>
                    Tore {awayName}
                    <input name="awayScore" type="number" min="0" inputMode="numeric" defaultValue={match.away_score ?? ''} required />
                  </label>
                  {isKnockoutStage(match.stage) && (
                    <label>
                      Weiterkommer bei Remis
                      <select name="winnerTeamId" defaultValue={match.winner_team_id ?? ''}>
                        <option value="">Nur bei Remis wählen</option>
                        {match.home_team && <option value={match.home_team.id}>{match.home_team.name}</option>}
                        {match.away_team && <option value={match.away_team.id}>{match.away_team.name}</option>}
                      </select>
                    </label>
                  )}
                  <button type="submit">Ergebnis speichern</button>
                </form>
              </article>
            );
          })}
        </div>
      </main>
    </>
  );
}
