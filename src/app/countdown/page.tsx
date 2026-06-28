import { Nav } from '@/components/Nav';
import { TournamentCountdown } from '@/components/TournamentCountdown';
import {
  calculateFixedThirdPlacePlacements,
  calculateFixedTopTwoPlacements,
  getInferredBracketTeam,
} from '@/lib/fixedGroupPlacements';
import { requireUser } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { Match, Team } from '@/lib/types';

type MatchWithTeams = Match & {
  home_team?: Team | null;
  away_team?: Team | null;
};

function applyInferredRoundOf32TeamsToMatches(
  matches: MatchWithTeams[],
  teams: Team[],
) {
  const fixedTopTwoPlacements = calculateFixedTopTwoPlacements(teams, matches);
  const fixedThirdPlacePlacements = calculateFixedThirdPlacePlacements(
    teams,
    matches,
  );

  return matches.map((match) => {
    if (match.stage !== 'round_of_32') return match;

    const inferredHomeTeam =
      match.home_team ??
      getInferredBracketTeam(
        match,
        'home',
        fixedTopTwoPlacements,
        fixedThirdPlacePlacements,
      );
    const inferredAwayTeam =
      match.away_team ??
      getInferredBracketTeam(
        match,
        'away',
        fixedTopTwoPlacements,
        fixedThirdPlacePlacements,
      );

    return {
      ...match,
      home_team: inferredHomeTeam ?? match.home_team ?? null,
      away_team: inferredAwayTeam ?? match.away_team ?? null,
      home_team_id: match.home_team_id ?? inferredHomeTeam?.id ?? null,
      away_team_id: match.away_team_id ?? inferredAwayTeam?.id ?? null,
    };
  });
}

function findMatchByNumber(matches: MatchWithTeams[], matchNumber: number) {
  return matches.find((match) => match.match_number === matchNumber) ?? null;
}

export default async function CountdownPage() {
  const user = await requireUser();

  const [{ data: teamsData, error: teamsError }, { data: matchesData, error: matchesError }] =
    await Promise.all([
      supabaseAdmin.from('teams').select('*'),
      supabaseAdmin
        .from('matches')
        .select(`
          *,
          home_team:teams!matches_home_team_id_fkey(*),
          away_team:teams!matches_away_team_id_fkey(*)
        `)
        .order('kickoff_time', { ascending: true }),
    ]);

  if (teamsError) throw new Error(teamsError.message);
  if (matchesError) throw new Error(matchesError.message);

  const teams = (teamsData ?? []) as Team[];
  const matches = applyInferredRoundOf32TeamsToMatches(
    (matchesData ?? []) as MatchWithTeams[],
    teams,
  );
  const openingMatch = findMatchByNumber(matches, 1);
  const finalMatch = findMatchByNumber(matches, 104);
  const austriaTeam = teams.find((team) => team.name === 'Österreich') ?? null;

  if (!openingMatch) throw new Error('Opening match not found');
  if (!finalMatch) throw new Error('Final match not found');
  if (!austriaTeam) throw new Error('Austria team not found');

  const austriaMatches = matches.filter(
    (match) =>
      match.home_team_id === austriaTeam.id ||
      match.away_team_id === austriaTeam.id ||
      match.home_team?.id === austriaTeam.id ||
      match.away_team?.id === austriaTeam.id,
  );

  return (
    <>
      <Nav user={user} />
      <main className="page countdownPage">
        <TournamentCountdown
          openingMatch={openingMatch as Match}
          austriaMatches={austriaMatches as Match[]}
          finalMatch={finalMatch as Match}
        />
      </main>
    </>
  );
}
