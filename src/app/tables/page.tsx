import { BracketAutoScroll } from "@/components/BracketAutoScroll";
import { Flag } from "@/components/Flag";
import { Nav } from "@/components/Nav";
import { getStageLabel } from "@/lib/scoring";
import { getFifaRanking } from "@/lib/fifaRankings";
import { requireUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { formatKickoff } from "@/lib/time";
import { applyOfficialBracketMatchNumbers } from "@/lib/bracket";
import { getRoundOf32Placeholder } from "@/lib/bracket";
import {
  getThirdPlaceOpponentGroup,
  isThirdPlaceWinnerGroup,
  ROUND_OF_32_THIRD_PLACE_MATCH_NUMBERS,
  type ThirdPlaceWinnerGroup,
} from "@/lib/roundOf32Thirds";
import {
  applySpecialEffectToTeam,
  getUserSpecialEffectActive,
} from "@/lib/specialEffects";
import type { Match, Stage, Team } from "@/lib/types";

type MatchWithTeams = Match & {
  home_team?: Team | null;
  away_team?: Team | null;
};

type ResolvedBracketMatch = MatchWithTeams & {
  resolved_home_team?: Team | null;
  resolved_away_team?: Team | null;
  resolved_home_placeholder?: string | null;
  resolved_away_placeholder?: string | null;
};

type BracketSourcePart = {
  result: "winner" | "runnerUp";
  matchNumber: number;
};

type StandingStatus =
  | "qualified"
  | "qualifiedFixed"
  | "eliminated"
  | "eliminatedFixed"
  | "open";

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
  status: StandingStatus;
};

type SimulatedScore = { home: number; away: number };
type SimulatedScoreMap = Map<string, SimulatedScore>;
type FixedGroupPlacementMap = Map<string, Team>;

type ScenarioStanding = {
  rows: StandingRow[];
  ranksByTeamId: Map<string, number>;
};

type TeamScenarioPlacement = {
  rank: number;
  row: StandingRow;
};

const BRACKET_STAGES: Stage[] = [
  "round_of_32",
  "round_of_16",
  "quarter_final",
  "semi_final",
  "final",
];

const BRACKET_MATCH_ORDER: Partial<Record<Stage, number[]>> = {
  round_of_32: [73, 76, 74, 75, 78, 77, 79, 80, 82, 81, 84, 83, 85, 88, 86, 87],
  round_of_16: [90, 89, 91, 92, 93, 94, 95, 96],
  quarter_final: [97, 98, 99, 100],
  semi_final: [101, 102],
  final: [104],
  third_place: [103],
};

const BRACKET_SOURCE_MATCHES: Record<number, string> = {
  90: "W73/W75",
  89: "W74/W77",
  91: "W76/W78",
  92: "W79/W80",
  93: "W84/W83",
  94: "W82/W81",
  95: "W88/W86",
  96: "W85/W87",
  97: "W90/W89",
  98: "W93/W94",
  99: "W91/W92",
  100: "W95/W96",
  101: "W97/W98",
  102: "W99/W100",
  103: "RU101/RU102",
  104: "W101/W102",
};

function parseBracketSourcePart(value: string): BracketSourcePart | null {
  if (value.startsWith("RU")) {
    const matchNumber = Number(value.slice(2));
    return Number.isInteger(matchNumber)
      ? { result: "runnerUp", matchNumber }
      : null;
  }

  if (value.startsWith("W")) {
    const matchNumber = Number(value.slice(1));
    return Number.isInteger(matchNumber)
      ? { result: "winner", matchNumber }
      : null;
  }

  return null;
}

function parseBracketSourceLabel(matchNumber: number) {
  const sourceLabel = BRACKET_SOURCE_MATCHES[matchNumber];
  if (!sourceLabel) return null;

  const [homeSource, awaySource] = sourceLabel.split("/");
  const home = parseBracketSourcePart(homeSource);
  const away = parseBracketSourcePart(awaySource);
  if (!home || !away) return null;

  return { home, away };
}

function bracketSourcePartPlaceholder(source: BracketSourcePart) {
  return `${source.result === "winner" ? "Sieger" : "Verlierer"} Spiel ${source.matchNumber}`;
}

function bracketOrderIndex(match: MatchWithTeams) {
  const order = BRACKET_MATCH_ORDER[match.stage];
  if (!order) return match.match_number;
  const index = order.indexOf(match.match_number);
  return index === -1 ? order.length + match.match_number : index;
}

function sortBracketMatches(a: MatchWithTeams, b: MatchWithTeams) {
  const orderDiff = bracketOrderIndex(a) - bracketOrderIndex(b);
  if (orderDiff !== 0) return orderDiff;
  return a.match_number - b.match_number;
}

function teamName(match: MatchWithTeams, side: "home" | "away") {
  if (side === "home")
    return match.home_team?.name ?? match.home_placeholder ?? "Offen";
  return match.away_team?.name ?? match.away_placeholder ?? "Offen";
}

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

function resultWinnerTeamId(match: MatchWithTeams): string | null {
  return match.winner_team_id ?? match.provisional_winner_team_id ?? null;
}

function hasResult(match: MatchWithTeams, simulatedScores?: SimulatedScoreMap) {
  return (
    resultHomeScore(match, simulatedScores) !== null &&
    resultAwayScore(match, simulatedScores) !== null
  );
}

function matchIsFinishedForTables(match: MatchWithTeams) {
  return match.is_finished || hasResult(match);
}

function getCurrentStage(matches: MatchWithTeams[]): Stage | "group" {
  const groupMatches = matches.filter((match) => match.stage === "group");
  if (groupMatches.some((match) => !matchIsFinishedForTables(match)))
    return "group";

  for (const stage of BRACKET_STAGES) {
    const stageMatches = matches.filter((match) => match.stage === stage);
    if (stageMatches.some((match) => !matchIsFinishedForTables(match)))
      return stage;
  }

  return "final";
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
    status: "open",
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

function compareThirdPlaceRows(a: StandingRow, b: StandingRow) {
  if (b.points !== a.points) return b.points - a.points;
  if (b.goalDifference !== a.goalDifference)
    return b.goalDifference - a.goalDifference;
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
  const rankA = fifaRankValue(a.team);
  const rankB = fifaRankValue(b.team);
  if (rankA !== rankB) return rankA - rankB;
  return a.team.name.localeCompare(b.team.name, "de-AT");
}

function thirdPlaceRowBeats(candidate: StandingRow, target: StandingRow) {
  return compareThirdPlaceRows(candidate, target) < 0;
}

function fixedGroupPlacementKey(groupName: string, rank: number) {
  return `${groupName}:${rank}`;
}

function parseTopTwoPlaceholder(value: string | null) {
  if (!value) return null;

  const match = value.match(/^(Erster|Zweiter) Gruppe ([A-L])$/);
  if (!match) return null;

  return {
    rank: match[1] === "Erster" ? 1 : 2,
    groupName: match[2],
  };
}

function parseThirdPlacePlaceholder(value: string | null) {
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

function buildScenarioStandings(
  teams: Team[],
  groupMatches: MatchWithTeams[],
): ScenarioStanding[] {
  const scenarios = buildExtremeScoreScenarios(groupMatches);

  return scenarios.map((scenario) => {
    const scenarioRows = buildRowsForGroup(teams, groupMatches, scenario);
    const sortedRows = sortStandingRows(scenarioRows, groupMatches, scenario);
    const ranksByTeamId = new Map<string, number>();

    sortedRows.forEach((row, index) => {
      ranksByTeamId.set(row.team.id, index + 1);
    });

    return { rows: sortedRows, ranksByTeamId };
  });
}

function calculatePossibleRanksFromScenarios(
  teams: Team[],
  scenarioStandings: ScenarioStanding[],
) {
  const possibleRanks = new Map(
    teams.map((team) => [team.id, new Set<number>()]),
  );

  for (const scenario of scenarioStandings) {
    scenario.rows.forEach((row, index) => {
      possibleRanks.get(row.team.id)?.add(index + 1);
    });
  }

  return possibleRanks;
}

function calculatePossibleRanks(teams: Team[], groupMatches: MatchWithTeams[]) {
  return calculatePossibleRanksFromScenarios(
    teams,
    buildScenarioStandings(teams, groupMatches),
  );
}

function buildGroupScenarioMap(teams: Team[], matches: MatchWithTeams[]) {
  const teamsByGroup = new Map<string, Team[]>();

  for (const team of teams) {
    if (!team.group_name) continue;
    if (!teamsByGroup.has(team.group_name))
      teamsByGroup.set(team.group_name, []);
    teamsByGroup.get(team.group_name)?.push(team);
  }

  const scenariosByGroup = new Map<string, ScenarioStanding[]>();

  for (const [groupName, groupTeams] of teamsByGroup.entries()) {
    const groupMatches = matches.filter(
      (match) => match.stage === "group" && match.group_name === groupName,
    );
    scenariosByGroup.set(
      groupName,
      buildScenarioStandings(groupTeams, groupMatches),
    );
  }

  return scenariosByGroup;
}

function collectTeamPlacements(
  team: Team,
  groupScenarios: ScenarioStanding[],
): TeamScenarioPlacement[] {
  return groupScenarios
    .map((scenario) => {
      const row = scenario.rows.find((item) => item.team.id === team.id);
      const rank = scenario.ranksByTeamId.get(team.id);
      if (!row || !rank) return null;
      return { rank, row };
    })
    .filter(
      (placement): placement is TeamScenarioPlacement => placement !== null,
    );
}

function guaranteedAsBestThirdPlacedTeam(
  team: Team,
  ownGroupScenarios: ScenarioStanding[],
  scenariosByGroup: Map<string, ScenarioStanding[]>,
) {
  if (!team.group_name) return false;

  const ownPlacements = collectTeamPlacements(team, ownGroupScenarios);
  if (ownPlacements.length === 0) return false;

  for (const placement of ownPlacements) {
    if (placement.rank <= 2) continue;
    if (placement.rank > 3) return false;

    let groupsThatCanBeatThisThirdPlace = 0;

    for (const [groupName, groupScenarios] of scenariosByGroup.entries()) {
      if (groupName === team.group_name) continue;

      const groupCanBeat = groupScenarios.some((scenario) => {
        const thirdPlaceRow = scenario.rows[2];
        return Boolean(
          thirdPlaceRow && thirdPlaceRowBeats(thirdPlaceRow, placement.row),
        );
      });

      if (groupCanBeat) groupsThatCanBeatThisThirdPlace += 1;
      if (groupsThatCanBeatThisThirdPlace >= 8) return false;
    }
  }

  return true;
}

function calculateFixedTopTwoPlacements(
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

function calculateFixedThirdPlacePlacements(
  teams: Team[],
  matches: MatchWithTeams[],
) {
  const fixedPlacements: FixedGroupPlacementMap = new Map();
  const teamsByGroup = new Map<string, Team[]>();
  const thirdPlacedRows: { groupName: string; row: StandingRow }[] = [];

  for (const team of teams) {
    if (!team.group_name) continue;
    if (!teamsByGroup.has(team.group_name)) teamsByGroup.set(team.group_name, []);
    teamsByGroup.get(team.group_name)?.push(team);
  }

  for (const [groupName, groupTeams] of teamsByGroup.entries()) {
    const groupMatches = matches.filter(
      (match) => match.stage === "group" && match.group_name === groupName,
    );

    if (groupMatches.length === 0 || groupMatches.some((match) => !hasResult(match))) {
      return fixedPlacements;
    }

    const rows = buildRowsForGroup(groupTeams, groupMatches);
    const sortedRows = sortStandingRows(rows, groupMatches);
    if (sortedRows[2]) thirdPlacedRows.push({ groupName, row: sortedRows[2] });
  }

  thirdPlacedRows
    .sort((a, b) => compareThirdPlaceRows(a.row, b.row))
    .slice(0, 8)
    .forEach(({ groupName, row }) => {
      fixedPlacements.set(fixedGroupPlacementKey(groupName, 3), row.team);
    });

  return fixedPlacements;
}

function markStandingStatuses(
  rows: StandingRow[],
  groupMatches: MatchWithTeams[],
  scenariosByGroup: Map<string, ScenarioStanding[]>,
) {
  const teams = rows.map((row) => row.team);
  const groupName = teams.find((team) => team.group_name)?.group_name ?? null;
  const ownGroupScenarios = groupName
    ? scenariosByGroup.get(groupName)
    : undefined;
  const possibleRanks = ownGroupScenarios
    ? calculatePossibleRanksFromScenarios(teams, ownGroupScenarios)
    : calculatePossibleRanks(teams, groupMatches);

  return rows.map((row) => {
    const ranks = possibleRanks.get(row.team.id);
    if (!ranks || ranks.size === 0)
      return { ...row, status: "open" as StandingStatus };

    const rankValues = Array.from(ranks);
    const minRank = Math.min(...rankValues);
    const maxRank = Math.max(...rankValues);
    const exactRankIsFixed = rankValues.length === 1;
    const guaranteedTopTwo = maxRank <= 2;
    const guaranteedThroughThirdPlace = ownGroupScenarios
      ? guaranteedAsBestThirdPlacedTeam(
          row.team,
          ownGroupScenarios,
          scenariosByGroup,
        )
      : false;

    if (guaranteedTopTwo || guaranteedThroughThirdPlace) {
      return {
        ...row,
        status: exactRankIsFixed
          ? ("qualifiedFixed" as StandingStatus)
          : ("qualified" as StandingStatus),
      };
    }

    if (exactRankIsFixed && minRank >= 4) {
      return { ...row, status: "eliminatedFixed" as StandingStatus };
    }

    if (minRank >= 4) {
      return { ...row, status: "eliminated" as StandingStatus };
    }

    return { ...row, status: "open" as StandingStatus };
  });
}

function standingStatusClass(status: StandingStatus) {
  if (status === "qualifiedFixed")
    return "standingQualified standingFixedPosition";
  if (status === "eliminatedFixed")
    return "standingEliminated standingFixedPosition";
  if (status === "qualified") return "standingQualified";
  if (status === "eliminated") return "standingEliminated";
  return undefined;
}
function buildStandings(
  teams: Team[],
  matches: MatchWithTeams[],
  scenariosByGroup: Map<string, ScenarioStanding[]>,
) {
  const groups = new Map<string, Map<string, StandingRow>>();

  for (const team of teams) {
    if (!team.group_name) continue;
    if (!groups.has(team.group_name)) groups.set(team.group_name, new Map());
    groups.get(team.group_name)?.set(team.id, emptyStanding(team));
  }

  for (const match of matches) {
    if (
      match.stage !== "group" ||
      !hasResult(match) ||
      !match.home_team ||
      !match.away_team
    )
      continue;

    const groupName =
      match.group_name ??
      match.home_team.group_name ??
      match.away_team.group_name;
    if (!groupName) continue;

    const group = groups.get(groupName);
    const home = group?.get(match.home_team.id);
    const away = group?.get(match.away_team.id);
    if (!home || !away) continue;

    applyMatchToRows(match, home, away);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b, "de-AT"))
    .map(([groupName, rows]) => {
      const groupMatches = matches.filter(
        (match) => match.stage === "group" && match.group_name === groupName,
      );
      const sortedRows = sortStandingRows(
        Array.from(rows.values()),
        groupMatches,
      );

      return {
        groupName,
        rows: markStandingStatuses(sortedRows, groupMatches, scenariosByGroup),
      };
    });
}

function getInferredBracketTeam(
  match: MatchWithTeams,
  side: "home" | "away",
  fixedTopTwoPlacements: FixedGroupPlacementMap,
  fixedThirdPlacePlacements: FixedGroupPlacementMap,
) {
  const placeholder =
    match.stage === "round_of_32"
      ? getRoundOf32Placeholder(match.match_number, side) ??
        (side === "home" ? match.home_placeholder : match.away_placeholder)
      : side === "home"
        ? match.home_placeholder
        : match.away_placeholder;
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

  const parsedThirdPlacePlaceholder = parseThirdPlacePlaceholder(placeholder);
  const winnerGroup = topSeedGroupForMatch(match);
  const thirdPlaceGroups = Array.from(fixedThirdPlacePlacements.keys()).map((key) => key.split(":")[0]);

  if (!parsedThirdPlacePlaceholder || !winnerGroup || thirdPlaceGroups.length !== 8) {
    return null;
  }

  const thirdGroup = getThirdPlaceOpponentGroup(thirdPlaceGroups, winnerGroup as ThirdPlaceWinnerGroup);
  if (!thirdGroup || !parsedThirdPlacePlaceholder.includes(thirdGroup)) return null;

  return fixedThirdPlacePlacements.get(fixedGroupPlacementKey(thirdGroup, 3)) ?? null;
}

function sideTeam(match: ResolvedBracketMatch, side: "home" | "away") {
  if (side === "home") {
    return Object.prototype.hasOwnProperty.call(match, "resolved_home_team")
      ? match.resolved_home_team ?? null
      : match.home_team ?? null;
  }

  return Object.prototype.hasOwnProperty.call(match, "resolved_away_team")
    ? match.resolved_away_team ?? null
    : match.away_team ?? null;
}

function getResolvedWinnerTeam(match: ResolvedBracketMatch) {
  const homeTeam = sideTeam(match, "home");
  const awayTeam = sideTeam(match, "away");
  const winnerTeamId = resultWinnerTeamId(match);

  if (winnerTeamId) {
    if (homeTeam?.id === winnerTeamId) return homeTeam;
    if (awayTeam?.id === winnerTeamId) return awayTeam;
  }

  const homeScore = resultHomeScore(match);
  const awayScore = resultAwayScore(match);
  if (homeScore === null || awayScore === null || homeScore === awayScore) {
    return null;
  }

  return homeScore > awayScore ? homeTeam : awayTeam;
}

function getResolvedRunnerUpTeam(match: ResolvedBracketMatch) {
  const homeTeam = sideTeam(match, "home");
  const awayTeam = sideTeam(match, "away");
  const winnerTeam = getResolvedWinnerTeam(match);

  if (!winnerTeam) return null;
  if (winnerTeam.id === homeTeam?.id) return awayTeam;
  if (winnerTeam.id === awayTeam?.id) return homeTeam;
  return null;
}

function resolveBracketSourceTeam(
  source: BracketSourcePart,
  resolvedMatchesByNumber: Map<number, ResolvedBracketMatch>,
) {
  const sourceMatch = resolvedMatchesByNumber.get(source.matchNumber);
  if (!sourceMatch) return null;

  return source.result === "winner"
    ? getResolvedWinnerTeam(sourceMatch)
    : getResolvedRunnerUpTeam(sourceMatch);
}

function resolveBracketMatches(
  matches: MatchWithTeams[],
  fixedTopTwoPlacements: FixedGroupPlacementMap,
  fixedThirdPlacePlacements: FixedGroupPlacementMap,
) {
  const resolvedMatchesByNumber = new Map<number, ResolvedBracketMatch>();
  const stages: Array<Stage | "third_place"> = [
    "round_of_32",
    "round_of_16",
    "quarter_final",
    "semi_final",
    "third_place",
    "final",
  ];

  for (const stage of stages) {
    const stageMatches = matches
      .filter((match) => match.stage === stage)
      .sort(sortBracketMatches);

    for (const match of stageMatches) {
      const source = parseBracketSourceLabel(match.match_number);
      const inferredHomeTeam =
        match.stage === "round_of_32"
          ? getInferredBracketTeam(
              match,
              "home",
              fixedTopTwoPlacements,
              fixedThirdPlacePlacements,
            )
          : null;
      const inferredAwayTeam =
        match.stage === "round_of_32"
          ? getInferredBracketTeam(
              match,
              "away",
              fixedTopTwoPlacements,
              fixedThirdPlacePlacements,
            )
          : null;

      const canonicalHomePlaceholder =
        match.stage === "round_of_32"
          ? getRoundOf32Placeholder(match.match_number, "home") ??
            match.home_placeholder ??
            "Offen"
          : match.home_placeholder ?? "Offen";
      const canonicalAwayPlaceholder =
        match.stage === "round_of_32"
          ? getRoundOf32Placeholder(match.match_number, "away") ??
            match.away_placeholder ??
            "Offen"
          : match.away_placeholder ?? "Offen";
      const homeHasOfficialRoundOf32Placeholder = Boolean(
        match.stage === "round_of_32" &&
          getRoundOf32Placeholder(match.match_number, "home"),
      );
      const awayHasOfficialRoundOf32Placeholder = Boolean(
        match.stage === "round_of_32" &&
          getRoundOf32Placeholder(match.match_number, "away"),
      );

      const roundOf32HomeTeam =
        match.stage === "round_of_32"
          ? inferredHomeTeam ??
            (homeHasOfficialRoundOf32Placeholder ? null : match.home_team ?? null)
          : match.home_team ?? null;
      const roundOf32AwayTeam =
        match.stage === "round_of_32"
          ? inferredAwayTeam ??
            (awayHasOfficialRoundOf32Placeholder ? null : match.away_team ?? null)
          : match.away_team ?? null;

      const resolvedHomeTeam = source
        ? resolveBracketSourceTeam(source.home, resolvedMatchesByNumber)
        : roundOf32HomeTeam;
      const resolvedAwayTeam = source
        ? resolveBracketSourceTeam(source.away, resolvedMatchesByNumber)
        : roundOf32AwayTeam;
      const resolvedHomePlaceholder = source
        ? resolvedHomeTeam
          ? null
          : bracketSourcePartPlaceholder(source.home)
        : roundOf32HomeTeam
          ? null
          : canonicalHomePlaceholder;
      const resolvedAwayPlaceholder = source
        ? resolvedAwayTeam
          ? null
          : bracketSourcePartPlaceholder(source.away)
        : roundOf32AwayTeam
          ? null
          : canonicalAwayPlaceholder;

      resolvedMatchesByNumber.set(match.match_number, {
        ...match,
        home_team: resolvedHomeTeam,
        away_team: resolvedAwayTeam,
        home_team_id: resolvedHomeTeam?.id ?? null,
        away_team_id: resolvedAwayTeam?.id ?? null,
        home_placeholder: resolvedHomePlaceholder,
        away_placeholder: resolvedAwayPlaceholder,
        resolved_home_team: resolvedHomeTeam,
        resolved_away_team: resolvedAwayTeam,
        resolved_home_placeholder: resolvedHomePlaceholder,
        resolved_away_placeholder: resolvedAwayPlaceholder,
      });
    }
  }

  return matches.map(
    (match) => resolvedMatchesByNumber.get(match.match_number) ?? match,
  );
}

function getBracketScrollTargetMatchNumber(matches: ResolvedBracketMatch[]) {
  const now = Date.now();
  const kickoffGraceMs = 150 * 60 * 1000;
  const bracketMatches = matches
    .filter((match) =>
      [...BRACKET_STAGES, "third_place"].includes(match.stage),
    )
    .sort((a, b) => {
      const timeDiff =
        new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.match_number - b.match_number;
    });

  const unfinishedMatches = bracketMatches.filter((match) => !hasResult(match));
  const activeOrFutureMatch = unfinishedMatches.find((match) => {
    const kickoff = new Date(match.kickoff_time).getTime();
    return !Number.isNaN(kickoff) && kickoff + kickoffGraceMs >= now;
  });

  return activeOrFutureMatch?.match_number ?? unfinishedMatches[0]?.match_number ?? null;
}

function BracketTeam({
  match,
  side,
  specialEffectActive,
}: {
  match: ResolvedBracketMatch;
  side: "home" | "away";
  specialEffectActive: boolean;
}) {
  const rawTeam = sideTeam(match, side);
  const team = applySpecialEffectToTeam(rawTeam, specialEffectActive);
  const score =
    side === "home" ? resultHomeScore(match) : resultAwayScore(match);
  const won =
    resultWinnerTeamId(match) && rawTeam?.id === resultWinnerTeamId(match);
  const resolvedPlaceholder =
    side === "home"
      ? match.resolved_home_placeholder
      : match.resolved_away_placeholder;
  const name = team?.name ?? resolvedPlaceholder ?? teamName(match, side);

  return (
    <div className={`bracketTeam ${won ? "bracketTeamWinner" : ""}`}>
      <Flag team={team} />
      <span>{name}</span>
      <strong>{score ?? "-"}</strong>
    </div>
  );
}

function BracketMatch({
  match,
  specialEffectActive,
}: {
  match: ResolvedBracketMatch;
  specialEffectActive: boolean;
}) {
  return (
    <article
      className={`bracketMatch ${hasResult(match) ? "bracketMatchDone" : ""}`}
      data-bracket-match-number={match.match_number}
    >
      <div className="bracketMatchMeta">
        <span>Spiel Nr. {match.match_number}</span>
        {BRACKET_SOURCE_MATCHES[match.match_number] && (
          <span className="bracketSourceLabel">
            aus {BRACKET_SOURCE_MATCHES[match.match_number]}
          </span>
        )}
        <span>{formatKickoff(match.kickoff_time)}</span>
      </div>
      <BracketTeam
        match={match}
        side="home"
        specialEffectActive={specialEffectActive}
      />
      <BracketTeam
        match={match}
        side="away"
        specialEffectActive={specialEffectActive}
      />
    </article>
  );
}

export default async function TablesPage() {
  const user = await requireUser();

  const { data: teamsData } = await supabaseAdmin
    .from("teams")
    .select("*")
    .order("group_name", { ascending: true })
    .order("name", { ascending: true });

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

  const teams = (teamsData ?? []) as Team[];
  const matches = applyOfficialBracketMatchNumbers(
    (matchesData ?? []) as MatchWithTeams[],
  );
  const specialEffectActive = await getUserSpecialEffectActive(user.id);
  const scenariosByGroup = buildGroupScenarioMap(teams, matches);
  const standings = buildStandings(teams, matches, scenariosByGroup);
  const fixedTopTwoPlacements = calculateFixedTopTwoPlacements(teams, matches);
  const fixedThirdPlacePlacements = calculateFixedThirdPlacePlacements(teams, matches);
  const bracketMatches = resolveBracketMatches(
    matches,
    fixedTopTwoPlacements,
    fixedThirdPlacePlacements,
  );
  const currentStage = getCurrentStage(matches);
  const bracketScrollTargetMatchNumber =
    getBracketScrollTargetMatchNumber(bracketMatches);
  const thirdPlaceMatch = bracketMatches.find(
    (match) => match.stage === "third_place",
  );
  return (
    <>
      <Nav user={user} />
      <main className="page tablesPage">
        <h1>Turnierbaum</h1>

        <section className="tablesGrid">
          {standings.map((group) => (
            <article className="card groupTableCard" key={group.groupName}>
              <div className="groupTableHeader">
                <h2>Gruppe {group.groupName}</h2>
              </div>
              <div className="standingsTableWrap">
                <table className="standingsTable">
                  <thead>
                    <tr>
                      <th>Team</th>
                      <th>MP</th>
                      <th>W</th>
                      <th>D</th>
                      <th>L</th>
                      <th>Pts</th>
                      <th>GD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row) => {
                      const displayTeam =
                        applySpecialEffectToTeam(
                          row.team,
                          specialEffectActive,
                        ) ?? row.team;

                      return (
                        <tr
                          className={standingStatusClass(row.status)}
                          key={row.team.id}
                        >
                          <td>
                            <span className="standingTeam">
                              <Flag team={displayTeam} />
                              <span>{displayTeam.name}</span>
                            </span>
                          </td>
                          <td>{row.played}</td>
                          <td>{row.won}</td>
                          <td>{row.drawn}</td>
                          <td>{row.lost}</td>
                          <td className="standingsPoints">{row.points}</td>
                          <td>
                            {row.goalDifference > 0
                              ? `+${row.goalDifference}`
                              : row.goalDifference}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </section>

        <section className="card bracketCard">
          <div className="bracketHeader">
            <h2>Turnierbaum</h2>
            <span>
              {currentStage === "group"
                ? "Gruppenphase"
                : getStageLabel(currentStage)}
            </span>
          </div>

          <div className="bracketScroll" data-bracket-scroll>
            <BracketAutoScroll currentStage={currentStage} targetMatchNumber={bracketScrollTargetMatchNumber} />
            <div className="bracketBoard">
              {BRACKET_STAGES.map((stage) => {
                const stageMatches = bracketMatches
                  .filter((match) => match.stage === stage)
                  .sort(sortBracketMatches);

                return (
                  <section
                    className={`bracketColumn bracketColumn-${stage}`}
                    data-bracket-stage={stage}
                    key={stage}
                  >
                    <h3>{getStageLabel(stage)}</h3>
                    <div className="bracketColumnMatches">
                      {stageMatches.map((match) => (
                        <BracketMatch
                          key={match.id}
                          match={match}
                          specialEffectActive={specialEffectActive}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}

              {thirdPlaceMatch && (
                <section
                  className="bracketColumn bracketColumn-third_place"
                  data-bracket-stage="third_place"
                >
                  <h3>Spiel um Platz 3</h3>
                  <div className="bracketColumnMatches">
                    <BracketMatch
                      match={thirdPlaceMatch}
                      specialEffectActive={specialEffectActive}
                    />
                  </div>
                </section>
              )}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
