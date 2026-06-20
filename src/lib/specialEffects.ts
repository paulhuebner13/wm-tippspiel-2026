import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { Match, Team } from "@/lib/types";

export const SPECIAL_EFFECT_TURKEY_FLAG_PATH = '/flags/toeoerken.svg';

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

export async function getActiveSpecialEffectGroups() {
  const { data, error } = await supabaseAdmin
    .from("special_effect_groups")
    .select("group_name")
    .eq("active", true);

  // The app should still work before the SQL migration has been run.
  if (error) return new Set<string>();

  return new Set((data ?? []).map((row) => String(row.group_name)));
}

export function hasSpecialEffectForTeam(
  team: Team | null | undefined,
  activeGroups: Set<string>,
) {
  return Boolean(team?.group_name && activeGroups.has(team.group_name) && isTurkeyTeam(team));
}

export function applySpecialEffectToTeam(
  team: Team | null | undefined,
  activeGroups: Set<string>,
): Team | null | undefined {
  if (!team || !hasSpecialEffectForTeam(team, activeGroups)) return team;

  return {
    ...team,
    name: "Tööörken",
    short_name: "TÖÖ",
    flag_path: SPECIAL_EFFECT_TURKEY_FLAG_PATH,
  };
}

export function applySpecialEffectsToTeams(
  teams: Team[],
  activeGroups: Set<string>,
) {
  return teams.map((team) => applySpecialEffectToTeam(team, activeGroups) ?? team);
}

export function applySpecialEffectsToMatches<T extends MatchWithTeamsForSpecialEffects>(
  matches: T[],
  activeGroups: Set<string>,
): T[] {
  return matches.map((match) => ({
    ...match,
    home_team: applySpecialEffectToTeam(match.home_team, activeGroups) ?? null,
    away_team: applySpecialEffectToTeam(match.away_team, activeGroups) ?? null,
  }));
}
