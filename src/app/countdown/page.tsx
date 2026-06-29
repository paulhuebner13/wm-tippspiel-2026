import { Nav } from "@/components/Nav";
import { TournamentCountdown } from "@/components/TournamentCountdown";
import { applyFixedTopTwoToMatches } from "@/lib/fixedGroupPlacements";
import { requireUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { Match, Team } from "@/lib/types";

function findMatchByNumber(matches: Match[], matchNumber: number) {
  return matches.find((match) => match.match_number === matchNumber) ?? null;
}

export default async function CountdownPage() {
  const user = await requireUser();

  const [
    { data: teamsData, error: teamsError },
    { data: matchesData, error: matchesError },
  ] = await Promise.all([
    supabaseAdmin.from("teams").select("*"),
    supabaseAdmin
      .from("matches")
      .select(
        `
          *,
          home_team:teams!matches_home_team_id_fkey(*),
          away_team:teams!matches_away_team_id_fkey(*)
        `,
      )
      .order("kickoff_time", { ascending: true }),
  ]);

  if (teamsError) throw new Error(teamsError.message);
  if (matchesError) throw new Error(matchesError.message);

  const teams = (teamsData ?? []) as Team[];
  const matches = applyFixedTopTwoToMatches(
    (matchesData ?? []) as Match[],
    teams,
  ) as Match[];
  const openingMatch = findMatchByNumber(matches, 1);
  const finalMatch = findMatchByNumber(matches, 104);
  const austriaTeam = teams.find((team) => team.name === "Österreich") ?? null;

  if (!openingMatch) throw new Error("Opening match not found");
  if (!finalMatch) throw new Error("Final match not found");
  if (!austriaTeam) throw new Error("Austria team not found");

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
          openingMatch={openingMatch}
          austriaMatches={austriaMatches}
          finalMatch={finalMatch}
        />
      </main>
    </>
  );
}
