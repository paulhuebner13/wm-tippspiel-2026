import { Flag } from '@/components/Flag';
import { Nav } from '@/components/Nav';
import { getFifaRanking } from '@/lib/fifaRankings';
import { runTipOptimizer } from '@/lib/optimizer';
import { requireAdmin } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  applySpecialEffectToTeam,
  getUserSpecialEffectActive,
} from '@/lib/specialEffects';
import type { Match, Team } from '@/lib/types';

type MatchWithTeams = Match & {
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

type OptimizerInputRow = {
  match_id: string;
  odds_text?: string | null;
  probabilities_text?: string | null;
  max_goals?: number | null;
};

type ScoreOption = {
  home: number;
  away: number;
  probability: number;
};

type TeamSimulationRow = {
  team: Team;
  groupName: string;
  advancementProbability: number;
  firstProbability: number;
  secondProbability: number;
  thirdQualifiedProbability: number;
  thirdTotalProbability: number;
  thirdConditionalAdvancementProbability: number;
  averagePoints: number;
  averageGoalDifference: number;
  thirdAveragePoints: number;
  thirdAverageGoalDifference: number;
};

const SIMULATION_RUNS = 10000;

function resultHomeScore(match: MatchWithTeams, simulatedScores?: SimulatedScoreMap): number | null {
  const simulatedScore = simulatedScores?.get(match.id);
  if (simulatedScore) return simulatedScore.home;
  return match.home_score ?? match.provisional_home_score ?? null;
}

function resultAwayScore(match: MatchWithTeams, simulatedScores?: SimulatedScoreMap): number | null {
  const simulatedScore = simulatedScores?.get(match.id);
  if (simulatedScore) return simulatedScore.away;
  return match.away_score ?? match.provisional_away_score ?? null;
}

function hasResult(match: MatchWithTeams, simulatedScores?: SimulatedScoreMap) {
  return resultHomeScore(match, simulatedScores) !== null && resultAwayScore(match, simulatedScores) !== null;
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

function applyScoreToRows(home: StandingRow, away: StandingRow, homeScore: number, awayScore: number) {
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
  if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
  const rankA = fifaRankValue(a.team);
  const rankB = fifaRankValue(b.team);
  if (rankA !== rankB) return rankA - rankB;
  return a.team.name.localeCompare(b.team.name, 'de-AT');
}

function buildMiniTable(rows: StandingRow[], matches: MatchWithTeams[], simulatedScores?: SimulatedScoreMap) {
  const tiedIds = new Set(rows.map((row) => row.team.id));
  const miniRows = new Map(rows.map((row) => [row.team.id, emptyStanding(row.team)]));

  for (const match of matches) {
    if (!match.home_team || !match.away_team || !hasResult(match, simulatedScores)) continue;
    if (!tiedIds.has(match.home_team.id) || !tiedIds.has(match.away_team.id)) continue;

    const home = miniRows.get(match.home_team.id);
    const away = miniRows.get(match.away_team.id);
    if (!home || !away) continue;
    applyMatchToRows(match, home, away, simulatedScores);
  }

  return miniRows;
}

function sortStandingRows(rows: StandingRow[], groupMatches: MatchWithTeams[], simulatedScores?: SimulatedScoreMap) {
  const pointBuckets = new Map<number, StandingRow[]>();
  for (const row of rows) {
    if (!pointBuckets.has(row.points)) pointBuckets.set(row.points, []);
    pointBuckets.get(row.points)?.push(row);
  }

  return Array.from(pointBuckets.entries())
    .sort(([pointsA], [pointsB]) => pointsB - pointsA)
    .flatMap(([, bucket]) => {
      const miniTable = bucket.length > 1 ? buildMiniTable(bucket, groupMatches, simulatedScores) : null;

      return [...bucket].sort((a, b) => {
        if (miniTable) {
          const miniA = miniTable.get(a.team.id);
          const miniB = miniTable.get(b.team.id);
          if (miniA && miniB) {
            if (miniB.points !== miniA.points) return miniB.points - miniA.points;
            if (miniB.goalDifference !== miniA.goalDifference) return miniB.goalDifference - miniA.goalDifference;
            if (miniB.goalsFor !== miniA.goalsFor) return miniB.goalsFor - miniA.goalsFor;
          }
        }

        if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
        if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
        const rankA = fifaRankValue(a.team);
        const rankB = fifaRankValue(b.team);
        if (rankA !== rankB) return rankA - rankB;
        return a.team.name.localeCompare(b.team.name, 'de-AT');
      });
    });
}

function buildRowsForGroup(teams: Team[], groupMatches: MatchWithTeams[], simulatedScores?: SimulatedScoreMap) {
  const rows = new Map(teams.map((team) => [team.id, emptyStanding(team)]));

  for (const match of groupMatches) {
    if (!match.home_team || !match.away_team || !hasResult(match, simulatedScores)) continue;
    const home = rows.get(match.home_team.id);
    const away = rows.get(match.away_team.id);
    if (!home || !away) continue;
    applyMatchToRows(match, home, away, simulatedScores);
  }

  return Array.from(rows.values());
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeScorePool(pool: ScoreOption[]) {
  const filtered = pool.filter((score) => score.probability > 0);
  const total = filtered.reduce((sum, score) => sum + score.probability, 0);
  if (total <= 0) return [{ home: 1, away: 1, probability: 1 }];
  return filtered.map((score) => ({ ...score, probability: score.probability / total }));
}

function hasStoredOptimizerInput(input: OptimizerInputRow | undefined) {
  return Boolean(
    input && ((input.odds_text ?? '').trim() !== '' || (input.probabilities_text ?? '').trim() !== ''),
  );
}

function buildFallbackScorePool(match: MatchWithTeams): ScoreOption[] {
  const homeRank = match.home_team ? fifaRankValue(match.home_team) : 80;
  const awayRank = match.away_team ? fifaRankValue(match.away_team) : 80;
  const rankEdge = clamp((awayRank - homeRank) / 120, -0.22, 0.22);
  const drawProbability = 0.28;
  const homeProbability = clamp(0.36 + rankEdge, 0.14, 0.68);
  const awayProbability = clamp(1 - drawProbability - homeProbability, 0.14, 0.68);

  return normalizeScorePool([
    { home: 1, away: 0, probability: homeProbability * 0.42 },
    { home: 2, away: 1, probability: homeProbability * 0.3 },
    { home: 2, away: 0, probability: homeProbability * 0.18 },
    { home: 3, away: 1, probability: homeProbability * 0.1 },
    { home: 0, away: 0, probability: drawProbability * 0.35 },
    { home: 1, away: 1, probability: drawProbability * 0.48 },
    { home: 2, away: 2, probability: drawProbability * 0.17 },
    { home: 0, away: 1, probability: awayProbability * 0.42 },
    { home: 1, away: 2, probability: awayProbability * 0.3 },
    { home: 0, away: 2, probability: awayProbability * 0.18 },
    { home: 1, away: 3, probability: awayProbability * 0.1 },
  ]);
}

function buildScorePoolFromOptimizer(
  match: MatchWithTeams,
  input: OptimizerInputRow | undefined,
  sourceBlendWeight: number,
): { pool: ScoreOption[]; usedStoredData: boolean } {
  if (!hasStoredOptimizerInput(input)) {
    return { pool: buildFallbackScorePool(match), usedStoredData: false };
  }

  const result = runTipOptimizer({
    oddsText: input?.odds_text ?? '',
    probabilitiesText: input?.probabilities_text ?? '',
    sourceMode: 'odds',
    match,
    homeRating: null,
    awayRating: null,
    maxGoals: Number(input?.max_goals ?? 7),
    sourceBlendWeight,
  });

  const pool = result.possibleResults.map((score) => ({
    home: score.home,
    away: score.away,
    probability: score.probability,
  }));

  if (pool.length === 0) {
    return { pool: buildFallbackScorePool(match), usedStoredData: false };
  }

  return { pool: normalizeScorePool(pool), usedStoredData: true };
}

function pickScoreFromPool(pool: ScoreOption[]): SimulatedScore {
  let draw = Math.random();

  for (const score of pool) {
    draw -= score.probability;
    if (draw <= 0) return { home: score.home, away: score.away };
  }

  const fallback = pool[pool.length - 1];
  return { home: fallback.home, away: fallback.away };
}

function formatProbability(value: number) {
  if (value > 0 && value < 0.005) return '<1 %';
  if (value > 0.995 && value < 1) return '>99 %';
  return `${Math.round(value * 100)} %`;
}

function formatAverage(value: number) {
  return value.toFixed(1).replace('.', ',');
}

function runQualificationSimulation(
  teams: Team[],
  matches: MatchWithTeams[],
  optimizerInputs: OptimizerInputRow[],
  sourceBlendWeight: number,
  runs = SIMULATION_RUNS,
) {
  const groupMatches = matches.filter((match) => match.stage === 'group');
  const teamsByGroup = new Map<string, Team[]>();
  const optimizerInputByMatchId = new Map(optimizerInputs.map((input) => [input.match_id, input]));
  const scorePoolsByMatchId = new Map<string, ScoreOption[]>();
  const stats = new Map(
    teams.map((team) => [
      team.id,
      {
        advanced: 0,
        first: 0,
        second: 0,
        thirdQualified: 0,
        thirdTotal: 0,
        thirdPointsSum: 0,
        thirdGoalDifferenceSum: 0,
        pointsSum: 0,
        goalDifferenceSum: 0,
      },
    ]),
  );
  let matchesWithStoredData = 0;
  let matchesWithFallback = 0;

  for (const team of teams) {
    if (!team.group_name) continue;
    if (!teamsByGroup.has(team.group_name)) teamsByGroup.set(team.group_name, []);
    teamsByGroup.get(team.group_name)?.push(team);
  }

  for (const match of groupMatches) {
    if (hasResult(match) || !match.home_team || !match.away_team) continue;
    const { pool, usedStoredData } = buildScorePoolFromOptimizer(
      match,
      optimizerInputByMatchId.get(match.id),
      sourceBlendWeight,
    );
    scorePoolsByMatchId.set(match.id, pool);
    if (usedStoredData) matchesWithStoredData += 1;
    else matchesWithFallback += 1;
  }

  for (let run = 0; run < runs; run++) {
    const simulatedScores: SimulatedScoreMap = new Map();
    for (const [matchId, pool] of scorePoolsByMatchId.entries()) {
      simulatedScores.set(matchId, pickScoreFromPool(pool));
    }

    const thirdPlacedRows: StandingRow[] = [];

    for (const [groupName, groupTeams] of teamsByGroup.entries()) {
      const matchesForGroup = groupMatches.filter((match) => match.group_name === groupName);
      const rows = buildRowsForGroup(groupTeams, matchesForGroup, simulatedScores);
      const sortedRows = sortStandingRows(rows, matchesForGroup, simulatedScores);

      sortedRows.forEach((row, index) => {
        const item = stats.get(row.team.id);
        if (!item) return;
        item.pointsSum += row.points;
        item.goalDifferenceSum += row.goalDifference;
        if (index === 0) item.first += 1;
        if (index === 1) item.second += 1;
        if (index === 2) {
          item.thirdTotal += 1;
          item.thirdPointsSum += row.points;
          item.thirdGoalDifferenceSum += row.goalDifference;
        }
      });

      for (const row of sortedRows.slice(0, 2)) {
        const item = stats.get(row.team.id);
        if (item) item.advanced += 1;
      }

      if (sortedRows[2]) thirdPlacedRows.push(sortedRows[2]);
    }

    thirdPlacedRows
      .sort(compareThirdPlaceRows)
      .slice(0, 8)
      .forEach((row) => {
        const item = stats.get(row.team.id);
        if (!item) return;
        item.advanced += 1;
        item.thirdQualified += 1;
      });
  }

  const rows: TeamSimulationRow[] = teams
    .filter((team) => Boolean(team.group_name))
    .map((team) => {
      const item = stats.get(team.id);
      return {
        team,
        groupName: team.group_name ?? '',
        advancementProbability: (item?.advanced ?? 0) / runs,
        firstProbability: (item?.first ?? 0) / runs,
        secondProbability: (item?.second ?? 0) / runs,
        thirdQualifiedProbability: (item?.thirdQualified ?? 0) / runs,
        thirdTotalProbability: (item?.thirdTotal ?? 0) / runs,
        thirdConditionalAdvancementProbability: (item?.thirdTotal ?? 0) > 0 ? (item?.thirdQualified ?? 0) / (item?.thirdTotal ?? 1) : 0,
        averagePoints: (item?.pointsSum ?? 0) / runs,
        averageGoalDifference: (item?.goalDifferenceSum ?? 0) / runs,
        thirdAveragePoints: (item?.thirdTotal ?? 0) > 0 ? (item?.thirdPointsSum ?? 0) / (item?.thirdTotal ?? 1) : 0,
        thirdAverageGoalDifference: (item?.thirdTotal ?? 0) > 0 ? (item?.thirdGoalDifferenceSum ?? 0) / (item?.thirdTotal ?? 1) : 0,
      };
    })
    .sort((a, b) => {
      const groupDiff = a.groupName.localeCompare(b.groupName, 'de-AT');
      if (groupDiff !== 0) return groupDiff;
      return b.advancementProbability - a.advancementProbability;
    });

  return { rows, runs, matchesWithStoredData, matchesWithFallback };
}

export default async function SimulationPage() {
  const user = await requireAdmin();

  const [{ data: teamsData }, { data: matchesData }, { data: optimizerInputsData }, { data: optimizerSettings }] =
    await Promise.all([
      supabaseAdmin.from('teams').select('*').order('group_name', { ascending: true }).order('name', { ascending: true }),
      supabaseAdmin
        .from('matches')
        .select(
          `
          *,
          home_team:teams!matches_home_team_id_fkey(*),
          away_team:teams!matches_away_team_id_fkey(*)
        `,
        )
        .order('kickoff_time', { ascending: true }),
      supabaseAdmin.from('tip_optimizer_inputs').select('match_id, odds_text, probabilities_text, max_goals'),
      supabaseAdmin.from('tip_optimizer_settings').select('source_blend_weight').eq('id', 1).maybeSingle(),
    ]);

  const rawTeams = (teamsData ?? []) as Team[];
  const matches = (matchesData ?? []) as MatchWithTeams[];
  const optimizerInputs = (optimizerInputsData ?? []) as OptimizerInputRow[];
  const sourceBlendWeight = Number(optimizerSettings?.source_blend_weight ?? 0.5);
  const specialEffectActive = await getUserSpecialEffectActive(user.id);
  const simulation = runQualificationSimulation(rawTeams, matches, optimizerInputs, sourceBlendWeight);
  const rowsByGroup = new Map<string, TeamSimulationRow[]>();

  for (const row of simulation.rows) {
    if (!rowsByGroup.has(row.groupName)) rowsByGroup.set(row.groupName, []);
    rowsByGroup.get(row.groupName)?.push(row);
  }

  const expectedThirdRows = Array.from(rowsByGroup.entries())
    .map(([groupName, rows]) => {
      const row = [...rows]
        .filter((item) => item.thirdTotalProbability > 0)
        .sort((a, b) => b.thirdTotalProbability - a.thirdTotalProbability)[0];
      return row ? { ...row, groupName } : null;
    })
    .filter((row): row is TeamSimulationRow => row !== null)
    .sort((a, b) => {
      if (b.thirdAveragePoints !== a.thirdAveragePoints) {
        return b.thirdAveragePoints - a.thirdAveragePoints;
      }
      if (b.thirdAverageGoalDifference !== a.thirdAverageGoalDifference) {
        return b.thirdAverageGoalDifference - a.thirdAverageGoalDifference;
      }
      if (b.thirdConditionalAdvancementProbability !== a.thirdConditionalAdvancementProbability) {
        return b.thirdConditionalAdvancementProbability - a.thirdConditionalAdvancementProbability;
      }
      return a.team.name.localeCompare(b.team.name, 'de-AT');
    });

  return (
    <>
      <Nav user={user} />
      <main className="page simulationPage">
        <h1>Simulation</h1>

        <div className="simulationMetaLine">
          {simulation.runs.toLocaleString('de-AT')} Simulationen · {simulation.matchesWithStoredData} Spiele mit Daten · {simulation.matchesWithFallback} Fallback-Spiele
        </div>

        <section className="simulationGroupsGrid">
          {Array.from(rowsByGroup.entries()).map(([groupName, rows]) => (
            <article className="card simulationGroupCard" key={groupName}>
              <h2>Gruppe {groupName}</h2>
              <div className="simulationTableWrap">
                <table className="simulationTable">
                  <thead>
                    <tr>
                      <th>Team</th>
                      <th>Weiter</th>
                      <th>1.</th>
                      <th>2.</th>
                      <th>3W</th>
                      <th>ØP</th>
                      <th>ØGD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const displayTeam = applySpecialEffectToTeam(row.team, specialEffectActive) ?? row.team;
                      return (
                        <tr key={row.team.id}>
                          <td>
                            <span className="simulationTeamCell">
                              <Flag team={displayTeam} />
                              <span>{displayTeam.name}</span>
                            </span>
                          </td>
                          <td className="simulationProbabilityStrong">{formatProbability(row.advancementProbability)}</td>
                          <td>{formatProbability(row.firstProbability)}</td>
                          <td>{formatProbability(row.secondProbability)}</td>
                          <td>{formatProbability(row.thirdQualifiedProbability)}</td>
                          <td>{formatAverage(row.averagePoints)}</td>
                          <td>{formatAverage(row.averageGoalDifference)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </section>

        <section className="card expectedThirdCard">
          <h2>Erwartete Drittplatzierte</h2>
          <div className="expectedThirdTableWrap">
            <table className="expectedThirdTable">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Grp</th>
                  <th>Team</th>
                  <th>3.</th>
                  <th>Weiter</th>
                  <th>Ø Pkt</th>
                  <th>Ø GD</th>
                </tr>
              </thead>
              <tbody>
                {expectedThirdRows.map((row, index) => {
                  const displayTeam = applySpecialEffectToTeam(row.team, specialEffectActive) ?? row.team;
                  const statusClass = index < 8 ? 'expectedThirdQualified' : 'expectedThirdEliminated';
                  return (
                    <tr className={statusClass} key={row.groupName}>
                      <td>{index + 1}</td>
                      <td>{row.groupName}</td>
                      <td>
                        <span className="simulationTeamCell">
                          <Flag team={displayTeam} />
                          <span>{displayTeam.name}</span>
                        </span>
                      </td>
                      <td>{formatProbability(row.thirdTotalProbability)}</td>
                      <td className="simulationProbabilityStrong">{formatProbability(row.thirdConditionalAdvancementProbability)}</td>
                      <td>{formatAverage(row.thirdAveragePoints)}</td>
                      <td>{formatAverage(row.thirdAverageGoalDifference)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}
