import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { Match, Team } from "@/lib/types";

export const SPECIAL_EFFECT_TURKEY_FLAG_PATH = "/flags/toeoerken.svg";

export type MatchWithTeamsForSpecialEffects = Match & {
  home_team?: Team | null;
  away_team?: Team | null;
};

function isTurkeyTeam(team: Team | null | undefined) {
  if (!team) return false;
  const normalisedName = team.name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return (
    normalisedName === "turkei" ||
    normalisedName === "turkiye" ||
    normalisedName === "turkey" ||
    team.short_name.toLowerCase() === "tur"
  );
}

export async function getUserSpecialEffectActive(userId: string) {
  const { data: memberships, error: membershipError } = await supabaseAdmin
    .from("group_members")
    .select("group_id")
    .eq("profile_id", userId);

  // The app should still work before the SQL migration has been run.
  if (membershipError) return false;

  const groupIds = (memberships ?? [])
    .map((membership) => String(membership.group_id))
    .filter(Boolean);

  if (groupIds.length === 0) return false;

  const { data: activeGroups, error: groupError } = await supabaseAdmin
    .from("player_groups")
    .select("id")
    .in("id", groupIds)
    .eq("special_effect_active", true)
    .limit(1);

  if (groupError) return false;
  return (activeGroups ?? []).length > 0;
}

export function applySpecialEffectToTeam(
  team: Team | null | undefined,
  specialEffectActive: boolean,
): Team | null | undefined {
  if (!team || !specialEffectActive || !isTurkeyTeam(team)) return team;

  return {
    ...team,
    name: "Tööörken",
    short_name: "TÖÖ",
    flag_path: SPECIAL_EFFECT_TURKEY_FLAG_PATH,
  };
}

export function applySpecialEffectsToTeams(
  teams: Team[],
  specialEffectActive: boolean,
) {
  return teams.map((team) => applySpecialEffectToTeam(team, specialEffectActive) ?? team);
}

export function applySpecialEffectsToMatches<T extends MatchWithTeamsForSpecialEffects>(
  matches: T[],
  specialEffectActive: boolean,
): T[] {
  return matches.map((match) => ({
    ...match,
    home_team: applySpecialEffectToTeam(match.home_team, specialEffectActive) ?? null,
    away_team: applySpecialEffectToTeam(match.away_team, specialEffectActive) ?? null,
  }));
}
