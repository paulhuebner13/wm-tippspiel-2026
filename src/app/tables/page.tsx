import { BracketAutoScroll } from "@/components/BracketAutoScroll";
import { Flag } from "@/components/Flag";
import { Nav } from "@/components/Nav";
import { getStageLabel } from "@/lib/scoring";
import { getFifaRanking } from "@/lib/fifaRankings";
import { requireUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { formatKickoff } from "@/lib/time";
import {
  applySpecialEffectToTeam,
  getUserSpecialEffectActive,
} from "@/lib/specialEffects";
import type { Match, Stage, Team } from "@/lib/types";

type MatchWithTeams = Match & {
  home_team?: Team | null;
  away_team?: Team | null;
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
) {
  const storedTeam = side === "home" ? match.home_team : match.away_team;
  if (storedTeam) return null;

  const placeholder =
    side === "home" ? match.home_placeholder : match.away_placeholder;
  const parsedPlaceholder = parseTopTwoPlaceholder(placeholder);
  if (!parsedPlaceholder) return null;

  return (
    fixedTopTwoPlacements.get(
      fixedGroupPlacementKey(
        parsedPlaceholder.groupName,
        parsedPlaceholder.rank,
      ),
    ) ?? null
  );
}

function BracketTeam({
  match,
  side,
  fixedTopTwoPlacements,
  specialEffectActive,
}: {
  match: MatchWithTeams;
  side: "home" | "away";
  fixedTopTwoPlacements: FixedGroupPlacementMap;
  specialEffectActive: boolean;
}) {
  const storedTeam = side === "home" ? match.home_team : match.away_team;
  const inferredTeam = getInferredBracketTeam(
    match,
    side,
    fixedTopTwoPlacements,
  );
  const rawTeam = storedTeam ?? inferredTeam;
  const team = applySpecialEffectToTeam(rawTeam, specialEffectActive);
  const score =
    side === "home" ? resultHomeScore(match) : resultAwayScore(match);
  const won =
    resultWinnerTeamId(match) && rawTeam?.id === resultWinnerTeamId(match);
  const name = team?.name ?? teamName(match, side);

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
  displayNumber,
  fixedTopTwoPlacements,
  specialEffectActive,
}: {
  match: MatchWithTeams;
  displayNumber: number;
  fixedTopTwoPlacements: FixedGroupPlacementMap;
  specialEffectActive: boolean;
}) {
  return (
    <article
      className={`bracketMatch ${hasResult(match) ? "bracketMatchDone" : ""}`}
    >
      <div className="bracketMatchMeta">
        <span>Spiel {displayNumber}</span>
        <span>{formatKickoff(match.kickoff_time)}</span>
      </div>
      <BracketTeam
        match={match}
        side="home"
        fixedTopTwoPlacements={fixedTopTwoPlacements}
        specialEffectActive={specialEffectActive}
      />
      <BracketTeam
        match={match}
        side="away"
        fixedTopTwoPlacements={fixedTopTwoPlacements}
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
  const matches = (matchesData ?? []) as MatchWithTeams[];
  const specialEffectActive = await getUserSpecialEffectActive(user.id);
  const scenariosByGroup = buildGroupScenarioMap(teams, matches);
  const standings = buildStandings(teams, matches, scenariosByGroup);
  const fixedTopTwoPlacements = calculateFixedTopTwoPlacements(teams, matches);
  const currentStage = getCurrentStage(matches);
  const thirdPlaceMatch = matches.find(
    (match) => match.stage === "third_place",
  );
  const displayNumbers = new Map(
    [...matches]
      .sort((a, b) => {
        const dateDiff =
          new Date(a.kickoff_time).getTime() -
          new Date(b.kickoff_time).getTime();
        return dateDiff !== 0 ? dateDiff : a.match_number - b.match_number;
      })
      .map((match, index) => [match.id, index + 1]),
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
            <BracketAutoScroll currentStage={currentStage} />
            <div className="bracketBoard">
              {BRACKET_STAGES.map((stage) => {
                const stageMatches = matches
                  .filter((match) => match.stage === stage)
                  .sort((a, b) => {
                    const dateDiff =
                      new Date(a.kickoff_time).getTime() -
                      new Date(b.kickoff_time).getTime();
                    return dateDiff !== 0
                      ? dateDiff
                      : a.match_number - b.match_number;
                  });

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
                          displayNumber={
                            displayNumbers.get(match.id) ?? match.match_number
                          }
                          fixedTopTwoPlacements={fixedTopTwoPlacements}
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
                      displayNumber={
                        displayNumbers.get(thirdPlaceMatch.id) ??
                        thirdPlaceMatch.match_number
                      }
                      fixedTopTwoPlacements={fixedTopTwoPlacements}
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
