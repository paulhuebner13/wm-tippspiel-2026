import { Nav } from '@/components/Nav';
import { TournamentCountdown } from '@/components/TournamentCountdown';
import { requireUser } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { Match } from '@/lib/types';

async function fetchMatchByNumber(matchNumber: number) {
  const { data, error } = await supabaseAdmin
    .from('matches')
    .select(`
      *,
      home_team:teams!matches_home_team_id_fkey(*),
      away_team:teams!matches_away_team_id_fkey(*)
    `)
    .eq('match_number', matchNumber)
    .single();

  if (error) throw new Error(error.message);
  return data as Match;
}

export default async function CountdownPage() {
  const user = await requireUser();
  const openingMatch = await fetchMatchByNumber(1);
  const finalMatch = await fetchMatchByNumber(104);

  const { data: austriaTeam, error: austriaTeamError } = await supabaseAdmin
    .from('teams')
    .select('id')
    .eq('name', 'Österreich')
    .single();

  if (austriaTeamError) throw new Error(austriaTeamError.message);

  const { data: austriaMatchesData, error } = await supabaseAdmin
    .from('matches')
    .select(`
      *,
      home_team:teams!matches_home_team_id_fkey(*),
      away_team:teams!matches_away_team_id_fkey(*)
    `)
    .or(`home_team_id.eq.${austriaTeam.id},away_team_id.eq.${austriaTeam.id}`)
    .order('kickoff_time', { ascending: true });

  if (error) throw new Error(error.message);

  return (
    <>
      <Nav user={user} />
      <main className="page countdownPage">
        <TournamentCountdown
          openingMatch={openingMatch}
          austriaMatches={(austriaMatchesData ?? []) as Match[]}
          finalMatch={finalMatch}
        />
      </main>
    </>
  );
}
