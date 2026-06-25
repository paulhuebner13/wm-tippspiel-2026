import { getFifaRanking } from "./fifaRankings";
import {
  getThirdPlaceOpponentGroup,
  isThirdPlaceWinnerGroup,
  ROUND_OF_32_THIRD_PLACE_MATCH_NUMBERS,
} from "./roundOf32Thirds";
import type { Match, Team } from "./types";

export type MatchWithTeams = Match & {
  home_team?: Team | null;
  away_team?: Team | null;
};

type StandingRow = {
  team: Team;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
};

type SimulatedScore = { home: number; away: number };
type SimulatedScoreMap = Map<string, SimulatedScore>;
export type FixedGroupPlacementMap = Map<string, Team>;

function resultHomeScore(
  match: MatchWithTeams,
  simulatedScores?: SimulatedScoreMap,
): number | null {
  const simulatedScore = simulatedScores?.get(match.id);
  if (simulatedScore) return simulatedScore.home;
  return match.home_score ?? match.provisional_home_score ?? null;
}

function resultAwayScore(
  match: MatchWithTeams,
  simulatedScores?: SimulatedScoreMap,
): number | null {
  const simulatedScore = simulatedScores?.get(match.id);
  if (simulatedScore) return simulatedScore.away;
  return match.away_score ?? match.provisional_away_score ?? null;
}

function hasResult(match: MatchWithTeams, simulatedScores?: SimulatedScoreMap) {
  return (
    resultHomeScore(match, simulatedScores) !== null &&
    resultAwayScore(match, simulatedScores) !== null
  );
}

function emptyStanding(team: Team): StandingRow {
  return {
    team,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    points: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
  };
}

function applyScoreToRows(
  home: StandingRow,
  away: StandingRow,
  homeScore: number,
  awayScore: number,
) {
  home.played += 1;
  away.played += 1;
  home.goalsFor += homeScore;
  home.goalsAgainst += awayScore;
  away.goalsFor += awayScore;
  away.goalsAgainst += homeScore;

  if (homeScore > awayScore) {
    home.won += 1;
    away.lost += 1;
    home.points += 3;
  } else if (homeScore < awayScore) {
    away.won += 1;
    home.lost += 1;
    away.points += 3;
  } else {
    home.drawn += 1;
    away.drawn += 1;
    home.points += 1;
    away.points += 1;
  }

  home.goalDifference = home.goalsFor - home.goalsAgainst;
  away.goalDifference = away.goalsFor - away.goalsAgainst;
}

function applyMatchToRows(
  match: MatchWithTeams,
  home: StandingRow,
  away: StandingRow,
  simulatedScores?: SimulatedScoreMap,
) {
  const homeScore = resultHomeScore(match, simulatedScores);
  const awayScore = resultAwayScore(match, simulatedScores);
  if (homeScore === null || awayScore === null) return;

  applyScoreToRows(home, away, homeScore, awayScore);
}

function fifaRankValue(team: Team) {
  return getFifaRanking(team.name)?.rank ?? 999;
}

export function fixedGroupPlacementKey(groupName: string, rank: number) {
  return `${groupName}:${rank}`;
}

export function parseTopTwoPlaceholder(value: string | null) {
  if (!value) return null;

  const match = value.match(/^(Erster|Zweiter) Gruppe ([A-L])$/);
  if (!match) return null;

  return {
    rank: match[1] === "Erster" ? 1 : 2,
    groupName: match[2],
  };
}

export function parseThirdPlacePlaceholder(value: string | null) {
  if (!value) return null;

  const match = value.match(/^Dritter Gruppe ([A-L](?:\/[A-L])*)$/);
  if (!match) return null;

  return match[1].split("/");
}

function topSeedGroupForMatch(match: MatchWithTeams) {
  const knownByMatchNumber = Object.entries(ROUND_OF_32_THIRD_PLACE_MATCH_NUMBERS).find(
    ([, matchNumber]) => matchNumber === match.match_number,
  )?.[0];

  if (knownByMatchNumber && isThirdPlaceWinnerGroup(knownByMatchNumber)) {
    return knownByMatchNumber;
  }

  const placeholders = [match.home_placeholder, match.away_placeholder];
  for (const placeholder of placeholders) {
    const parsed = parseTopTwoPlaceholder(placeholder);
    if (parsed?.rank === 1) {
      const key = `1${parsed.groupName}`;
      if (isThirdPlaceWinnerGroup(key)) return key;
    }
  }

  return null;
}

function buildMiniTable(
  rows: StandingRow[],
  matches: MatchWithTeams[],
  simulatedScores?: SimulatedScoreMap,
) {
  const tiedIds = new Set(rows.map((row) => row.team.id));
  const miniRows = new Map(
    rows.map((row) => [row.team.id, emptyStanding(row.team)]),
  );

  for (const match of matches) {
    if (
      !match.home_team ||
      !match.away_team ||
      !hasResult(match, simulatedScores)
    )
      continue;
    if (!tiedIds.has(match.home_team.id) || !tiedIds.has(match.away_team.id))
      continue;

    const home = miniRows.get(match.home_team.id);
    const away = miniRows.get(match.away_team.id);
    if (!home || !away) continue;

    applyMatchToRows(match, home, away, simulatedScores);
  }

  return miniRows;
}

function sortStandingRows(
  rows: StandingRow[],
  groupMatches: MatchWithTeams[],
  simulatedScores?: SimulatedScoreMap,
) {
  const pointBuckets = new Map<number, StandingRow[]>();
  for (const row of rows) {
    if (!pointBuckets.has(row.points)) pointBuckets.set(row.points, []);
    pointBuckets.get(row.points)?.push(row);
  }

  return Array.from(pointBuckets.entries())
    .sort(([pointsA], [pointsB]) => pointsB - pointsA)
    .flatMap(([, bucket]) => {
      const miniTable =
        bucket.length > 1
          ? buildMiniTable(bucket, groupMatches, simulatedScores)
          : null;

      return [...bucket].sort((a, b) => {
        if (miniTable) {
          const miniA = miniTable.get(a.team.id);
          const miniB = miniTable.get(b.team.id);
          if (miniA && miniB) {
            if (miniB.points !== miniA.points)
              return miniB.points - miniA.points;
            if (miniB.goalDifference !== miniA.goalDifference)
              return miniB.goalDifference - miniA.goalDifference;
            if (miniB.goalsFor !== miniA.goalsFor)
              return miniB.goalsFor - miniA.goalsFor;
          }
        }

        if (b.goalDifference !== a.goalDifference)
          return b.goalDifference - a.goalDifference;
        if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
        const rankA = fifaRankValue(a.team);
        const rankB = fifaRankValue(b.team);
        if (rankA !== rankB) return rankA - rankB;
        return a.team.name.localeCompare(b.team.name, "de-AT");
      });
    });
}

function buildRowsForGroup(
  teams: Team[],
  groupMatches: MatchWithTeams[],
  simulatedScores?: SimulatedScoreMap,
) {
  const rows = new Map(teams.map((team) => [team.id, emptyStanding(team)]));

  for (const match of groupMatches) {
    if (
      !match.home_team ||
      !match.away_team ||
      !hasResult(match, simulatedScores)
    )
      continue;

    const home = rows.get(match.home_team.id);
    const away = rows.get(match.away_team.id);
    if (!home || !away) continue;

    applyMatchToRows(match, home, away, simulatedScores);
  }

  return Array.from(rows.values());
}

function buildExtremeScoreScenarios(groupMatches: MatchWithTeams[]) {
  const openMatches = groupMatches.filter(
    (match) => !hasResult(match) && match.home_team_id && match.away_team_id,
  );

  return openMatches.reduce<SimulatedScoreMap[]>(
    (scenarios, match) => {
      const nextScenarios: SimulatedScoreMap[] = [];

      for (const scenario of scenarios) {
        const homeWins = new Map(scenario);
        homeWins.set(match.id, { home: 100, away: 0 });
        nextScenarios.push(homeWins);

        const awayWins = new Map(scenario);
        awayWins.set(match.id, { home: 0, away: 100 });
        nextScenarios.push(awayWins);
      }

      return nextScenarios;
    },
    [new Map<string, SimulatedScore>()],
  );
}

function calculatePossibleRanks(teams: Team[], groupMatches: MatchWithTeams[]) {
  const possibleRanks = new Map(
    teams.map((team) => [team.id, new Set<number>()]),
  );
  const scenarios = buildExtremeScoreScenarios(groupMatches);

  for (const scenario of scenarios) {
    const scenarioRows = buildRowsForGroup(teams, groupMatches, scenario);
    const sortedRows = sortStandingRows(scenarioRows, groupMatches, scenario);

    sortedRows.forEach((row, index) => {
      possibleRanks.get(row.team.id)?.add(index + 1);
    });
  }

  return possibleRanks;
}

function groupHasAllResults(groupMatches: MatchWithTeams[]) {
  return groupMatches.length > 0 && groupMatches.every((match) => hasResult(match));
}

function buildCompletedGroupStandings(teams: Team[], matches: MatchWithTeams[]) {
  const standingsByGroup = new Map<string, StandingRow[]>();
  const teamsByGroup = new Map<string, Team[]>();

  for (const team of teams) {
    if (!team.group_name) continue;
    if (!teamsByGroup.has(team.group_name)) teamsByGroup.set(team.group_name, []);
    teamsByGroup.get(team.group_name)?.push(team);
  }

  for (const [groupName, groupTeams] of teamsByGroup.entries()) {
    const groupMatches = matches.filter(
      (match) => match.stage === "group" && match.group_name === groupName,
    );

    if (!groupHasAllResults(groupMatches)) continue;

    const rows = buildRowsForGroup(groupTeams, groupMatches);
    standingsByGroup.set(groupName, sortStandingRows(rows, groupMatches));
  }

  return standingsByGroup;
}

export function calculateFixedThirdPlacePlacements(
  teams: Team[],
  matches: MatchWithTeams[],
) {
  const fixedPlacements: FixedGroupPlacementMap = new Map();
  const completedStandings = buildCompletedGroupStandings(teams, matches);

  if (completedStandings.size < 12) return fixedPlacements;

  const thirdPlacedRows = Array.from(completedStandings.entries())
    .map(([groupName, rows]) => ({ groupName, row: rows[2] }))
    .filter((entry): entry is { groupName: string; row: StandingRow } => Boolean(entry.row))
    .sort((a, b) => compareThirdPlaceRows(a.row, b.row));

  for (const entry of thirdPlacedRows.slice(0, 8)) {
    fixedPlacements.set(fixedGroupPlacementKey(entry.groupName, 3), entry.row.team);
  }

  return fixedPlacements;
}

function compareThirdPlaceRows(a: StandingRow, b: StandingRow) {
  if (b.points !== a.points) return b.points - a.points;
  if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
  const rankA = fifaRankValue(a.team);
  const rankB = fifaRankValue(b.team);
  if (rankA !== rankB) return rankA - rankB;
  return a.team.name.localeCompare(b.team.name, "de-AT");
}

export function calculateFixedTopTwoPlacements(
  teams: Team[],
  matches: MatchWithTeams[],
) {
  const fixedPlacements: FixedGroupPlacementMap = new Map();
  const teamsByGroup = new Map<string, Team[]>();

  for (const team of teams) {
    if (!team.group_name) continue;
    if (!teamsByGroup.has(team.group_name))
      teamsByGroup.set(team.group_name, []);
    teamsByGroup.get(team.group_name)?.push(team);
  }

  for (const [groupName, groupTeams] of teamsByGroup.entries()) {
    const groupMatches = matches.filter(
      (match) => match.stage === "group" && match.group_name === groupName,
    );
    const possibleRanks = calculatePossibleRanks(groupTeams, groupMatches);

    for (const team of groupTeams) {
      const ranks = possibleRanks.get(team.id);
      if (!ranks || ranks.size !== 1) continue;

      const [fixedRank] = Array.from(ranks);
      if (fixedRank === 1 || fixedRank === 2) {
        fixedPlacements.set(fixedGroupPlacementKey(groupName, fixedRank), team);
      }
    }
  }

  return fixedPlacements;
}

export function getInferredBracketTeam(
  match: MatchWithTeams,
  side: "home" | "away",
  fixedTopTwoPlacements: FixedGroupPlacementMap,
  fixedThirdPlacePlacements?: FixedGroupPlacementMap,
) {
  const storedTeam = side === "home" ? match.home_team : match.away_team;
  if (storedTeam) return null;

  const placeholder =
    side === "home" ? match.home_placeholder : match.away_placeholder;
  const parsedTopTwoPlaceholder = parseTopTwoPlaceholder(placeholder);

  if (parsedTopTwoPlaceholder) {
    return (
      fixedTopTwoPlacements.get(
        fixedGroupPlacementKey(
          parsedTopTwoPlaceholder.groupName,
          parsedTopTwoPlaceholder.rank,
        ),
      ) ?? null
    );
  }

  const thirdPlaceGroups = fixedThirdPlacePlacements
    ? Array.from(fixedThirdPlacePlacements.keys()).map((key) => key.split(":")[0])
    : [];
  const winnerGroup = topSeedGroupForMatch(match);
  const parsedThirdPlacePlaceholder = parseThirdPlacePlaceholder(placeholder);

  if (!winnerGroup || !parsedThirdPlacePlaceholder || thirdPlaceGroups.length !== 8) {
    return null;
  }

  const thirdGroup = getThirdPlaceOpponentGroup(thirdPlaceGroups, winnerGroup);
  if (!thirdGroup || !parsedThirdPlacePlaceholder.includes(thirdGroup)) {
    return null;
  }

  return fixedThirdPlacePlacements?.get(fixedGroupPlacementKey(thirdGroup, 3)) ?? null;
}

export function applyFixedTopTwoToMatches(
  matches: MatchWithTeams[],
  teams: Team[],
) {
  const fixedTopTwoPlacements = calculateFixedTopTwoPlacements(teams, matches);
  const fixedThirdPlacePlacements = calculateFixedThirdPlacePlacements(teams, matches);

  return matches.map((match) => {
    const inferredHomeTeam = getInferredBracketTeam(
      match,
      "home",
      fixedTopTwoPlacements,
      fixedThirdPlacePlacements,
    );
    const inferredAwayTeam = getInferredBracketTeam(
      match,
      "away",
      fixedTopTwoPlacements,
      fixedThirdPlacePlacements,
    );

    if (!inferredHomeTeam && !inferredAwayTeam) return match;

    const homeTeam = match.home_team ?? inferredHomeTeam ?? null;
    const awayTeam = match.away_team ?? inferredAwayTeam ?? null;
    const homeTeamId = match.home_team_id ?? inferredHomeTeam?.id ?? null;
    const awayTeamId = match.away_team_id ?? inferredAwayTeam?.id ?? null;

    return {
      ...match,
      home_team: homeTeam,
      away_team: awayTeam,
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      is_open_for_predictions:
        match.is_open_for_predictions ||
        Boolean(homeTeamId && awayTeamId && !match.is_finished),
    };
  });
}
