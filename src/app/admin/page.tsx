import { Nav } from "@/components/Nav";
import { AutoScrollToCurrent } from "@/components/AutoScrollToCurrent";
import { ResultAdminCard } from "@/components/ResultAdminCard";
import { ResultSubmitterCard } from "@/components/ResultSubmitterCard";
import { requireResultEditor } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isKnockoutStage } from "@/lib/scoring";
import { applyFixedTopTwoToMatches } from "@/lib/fixedGroupPlacements";
import {
  applySpecialEffectsToMatches,
  applySpecialEffectsToTeams,
  getUserSpecialEffectActive,
} from "@/lib/specialEffects";
import type { Match, Team } from "@/lib/types";

function hasAnyVisibleResult(match: Match) {
  return (
    (match.home_score !== null && match.away_score !== null) ||
    (match.provisional_home_score !== null &&
      match.provisional_home_score !== undefined &&
      match.provisional_away_score !== null &&
      match.provisional_away_score !== undefined)
  );
}

function provisionalOpenAt(match: Match) {
  const kickoff = new Date(match.kickoff_time).getTime();
  if (Number.isNaN(kickoff)) return null;
  return kickoff + 105 * 60 * 1000;
}

function provisionalCanOpen(match: Match) {
  if (isKnockoutStage(match.stage)) return false;
  if (match.home_score !== null && match.away_score !== null) return false;
  const openAt = provisionalOpenAt(match);
  if (openAt === null) return false;
  return Date.now() >= openAt;
}

function provisionalWillOpenInFuture(match: Match) {
  if (isKnockoutStage(match.stage)) return false;
  if (match.home_score !== null && match.away_score !== null) return false;
  const openAt = provisionalOpenAt(match);
  if (openAt === null) return false;
  return Date.now() < openAt;
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
    .from("matches")
    .select(
      `
      *,
      home_team:teams!matches_home_team_id_fkey(*),
      away_team:teams!matches_away_team_id_fkey(*)
    `,
    )
    .order("kickoff_time", { ascending: true });

  const { data: teamsData } = await supabaseAdmin
    .from("teams")
    .select("*")
    .order("name", { ascending: true });

  const rawTeams = (teamsData ?? []) as Team[];
  const specialEffectActive = await getUserSpecialEffectActive(user.id);
  const teams = applySpecialEffectsToTeams(rawTeams, specialEffectActive);
  const matchesWithFixedTeams = applyFixedTopTwoToMatches(
    (matchesData ?? []) as Match[],
    rawTeams,
  );
  const matches = applySpecialEffectsToMatches(
    matchesWithFixedTeams,
    specialEffectActive,
  );

  if (!user.is_admin) {
    const firstEditableMatchId =
      matches.find((match) => provisionalCanOpen(match))?.id ?? null;
    const firstFutureEditableMatchId =
      matches.find((match) => provisionalWillOpenInFuture(match))?.id ?? null;
    const scrollTargetMatchId = firstEditableMatchId ?? firstFutureEditableMatchId;

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
                current={match.id === scrollTargetMatchId}
              />
            ))}
          </div>
        </main>
      </>
    );
  }

  const firstUnenteredMatchId =
    matches.find((match) => !hasCompleteResult(match))?.id ?? null;

  return (
    <>
      <Nav user={user} />
      <main className="page">
        <h1>Resultate</h1>
        <p className="subtle">
          Hier trägst du Spielergebnisse ein und öffnest K.-o.-Spiele für Tipps.
        </p>
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
