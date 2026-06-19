import { Nav } from '@/components/Nav';
import { AutoScrollToCurrent } from '@/components/AutoScrollToCurrent';
import { ResultAdminCard } from '@/components/ResultAdminCard';
import { ResultSubmitterCard } from '@/components/ResultSubmitterCard';
import { requireResultEditor } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isKnockoutStage } from '@/lib/scoring';
import type { Match, Team } from '@/lib/types';


function provisionalCanOpen(match: Match) {
  if (isKnockoutStage(match.stage)) return false;
  if (match.home_score !== null && match.away_score !== null) return false;
  const openAt = new Date(match.kickoff_time).getTime() + 105 * 60 * 1000;
  if (Number.isNaN(openAt)) return false;
  return Date.now() >= openAt;
}

function hasCompleteResult(match: Match) {
  if (match.home_score === null || match.away_score === null) return false;
  if (!isKnockoutStage(match.stage)) return true;
  if (match.home_score !== match.away_score) return true;
  return Boolean(match.winner_team_id);
}

export default async function AdminPage() {
  const user = await requireResultEditor();

  const { data: matchesData } = await supabaseAdmin
    .from('matches')
    .select(`
      *,
      home_team:teams!matches_home_team_id_fkey(*),
      away_team:teams!matches_away_team_id_fkey(*)
    `)
    .order('kickoff_time', { ascending: true });

  const matches = (matchesData ?? []) as Match[];

  if (!user.is_admin) {
    const latestOpenMatchId = [...matches]
      .reverse()
      .find((match) => provisionalCanOpen(match))?.id ?? null;

    return (
      <>
        <Nav user={user} />
        <main className="page">
          <h1>Resultate</h1>
          <AutoScrollToCurrent />
          <div className="list">
            {matches.map((match) => (
              <ResultSubmitterCard
                key={match.id}
                match={match}
                current={match.id === latestOpenMatchId}
              />
            ))}
          </div>
        </main>
      </>
    );
  }

  const { data: teamsData } = await supabaseAdmin
    .from('teams')
    .select('*')
    .order('name', { ascending: true });

  const teams = (teamsData ?? []) as Team[];
  const firstUnenteredMatchId = matches.find((match) => !hasCompleteResult(match))?.id ?? null;

  return (
    <>
      <Nav user={user} />
      <main className="page">
        <h1>Resultate</h1>
        <p className="subtle">Hier trägst du Spielergebnisse ein und öffnest K.-o.-Spiele für Tipps.</p>
        <AutoScrollToCurrent />

        <div className="list">
          {matches.map((match) => (
            <ResultAdminCard
              key={match.id}
              match={match}
              teams={teams}
              current={match.id === firstUnenteredMatchId}
            />
          ))}
        </div>
      </main>
    </>
  );
}
