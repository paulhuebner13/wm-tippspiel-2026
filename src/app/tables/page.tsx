import { BracketAutoScroll } from '@/components/BracketAutoScroll';
import { Flag } from '@/components/Flag';
import { Nav } from '@/components/Nav';
import { getStageLabel } from '@/lib/scoring';
import { getFifaRanking } from '@/lib/fifaRankings';
import { requireUser } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { formatKickoff } from '@/lib/time';
import type { Match, Stage, Team } from '@/lib/types';

type MatchWithTeams = Match & {
  home_team?: Team | null;
  away_team?: Team | null;
};

type StandingStatus = 'qualified' | 'eliminated' | 'open';

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

const BRACKET_STAGES: Stage[] = ['round_of_32', 'round_of_16', 'quarter_final', 'semi_final', 'final'];

function teamName(match: MatchWithTeams, side: 'home' | 'away') {
  if (side === 'home') return match.home_team?.name ?? match.home_placeholder ?? 'Offen';
  return match.away_team?.name ?? match.away_placeholder ?? 'Offen';
}

function resultHomeScore(match: MatchWithTeams): number | null {
  return match.home_score ?? match.provisional_home_score ?? null;
}

function resultAwayScore(match: MatchWithTeams): number | null {
  return match.away_score ?? match.provisional_away_score ?? null;
}

function resultWinnerTeamId(match: MatchWithTeams): string | null {
  return match.winner_team_id ?? match.provisional_winner_team_id ?? null;
}

function hasResult(match: MatchWithTeams) {
  return resultHomeScore(match) !== null && resultAwayScore(match) !== null;
}

function matchIsFinishedForTables(match: MatchWithTeams) {
  return match.is_finished || hasResult(match);
}

function getCurrentStage(matches: MatchWithTeams[]): Stage | 'group' {
  const groupMatches = matches.filter((match) => match.stage === 'group');
  if (groupMatches.some((match) => !matchIsFinishedForTables(match))) return 'group';

  for (const stage of BRACKET_STAGES) {
    const stageMatches = matches.filter((match) => match.stage === stage);
    if (stageMatches.some((match) => !matchIsFinishedForTables(match))) return stage;
  }

  return 'final';
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
    status: 'open',
  };
}

function applyMatchToRows(match: MatchWithTeams, home: StandingRow, away: StandingRow) {
  const homeScore = resultHomeScore(match);
  const awayScore = resultAwayScore(match);
  if (homeScore === null || awayScore === null) return;

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

function fifaRankValue(team: Team) {
  return getFifaRanking(team.name)?.rank ?? 999;
}

function buildMiniTable(rows: StandingRow[], matches: MatchWithTeams[]) {
  const tiedIds = new Set(rows.map((row) => row.team.id));
  const miniRows = new Map(rows.map((row) => [row.team.id, emptyStanding(row.team)]));

  for (const match of matches) {
    if (!match.home_team || !match.away_team || !hasResult(match)) continue;
    if (!tiedIds.has(match.home_team.id) || !tiedIds.has(match.away_team.id)) continue;

    const home = miniRows.get(match.home_team.id);
    const away = miniRows.get(match.away_team.id);
    if (!home || !away) continue;
    applyMatchToRows(match, home, away);
  }

  return miniRows;
}

function sortStandingRows(rows: StandingRow[], groupMatches: MatchWithTeams[]) {
  const pointBuckets = new Map<number, StandingRow[]>();
  for (const row of rows) {
    if (!pointBuckets.has(row.points)) pointBuckets.set(row.points, []);
    pointBuckets.get(row.points)?.push(row);
  }

  return Array.from(pointBuckets.entries())
    .sort(([pointsA], [pointsB]) => pointsB - pointsA)
    .flatMap(([, bucket]) => {
      const miniTable = bucket.length > 1 ? buildMiniTable(bucket, groupMatches) : null;

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

function remainingMatchesForTeam(teamId: string, groupMatches: MatchWithTeams[]) {
  return groupMatches.filter(
    (match) =>
      !hasResult(match) &&
      (match.home_team_id === teamId || match.away_team_id === teamId),
  ).length;
}

function markStandingStatuses(rows: StandingRow[], groupMatches: MatchWithTeams[]) {
  const totalMatches = groupMatches.length;
  const finishedMatches = groupMatches.filter(hasResult).length;
  const groupComplete = totalMatches > 0 && finishedMatches === totalMatches;

  if (groupComplete) {
    return rows.map((row, index) => ({
      ...row,
      status: index < 2 ? 'qualified' : index === rows.length - 1 ? 'eliminated' : 'open',
    }));
  }

  return rows.map((row) => {
    const maxPoints = row.points + 3 * remainingMatchesForTeam(row.team.id, groupMatches);
    const teamsThatCanStillReachThisTeam = rows.filter(
      (other) => other.team.id !== row.team.id && other.points + 3 * remainingMatchesForTeam(other.team.id, groupMatches) >= row.points,
    ).length;
    const teamsAlreadyOutOfReach = rows.filter(
      (other) => other.team.id !== row.team.id && other.points > maxPoints,
    ).length;

    if (teamsThatCanStillReachThisTeam <= 1) {
      return { ...row, status: 'qualified' as StandingStatus };
    }

    if (teamsAlreadyOutOfReach >= 3) {
      return { ...row, status: 'eliminated' as StandingStatus };
    }

    return { ...row, status: 'open' as StandingStatus };
  });
}

function buildStandings(teams: Team[], matches: MatchWithTeams[]) {
  const groups = new Map<string, Map<string, StandingRow>>();

  for (const team of teams) {
    if (!team.group_name) continue;
    if (!groups.has(team.group_name)) groups.set(team.group_name, new Map());
    groups.get(team.group_name)?.set(team.id, emptyStanding(team));
  }

  for (const match of matches) {
    if (match.stage !== 'group' || !hasResult(match) || !match.home_team || !match.away_team) continue;

    const groupName = match.group_name ?? match.home_team.group_name ?? match.away_team.group_name;
    if (!groupName) continue;

    const group = groups.get(groupName);
    const home = group?.get(match.home_team.id);
    const away = group?.get(match.away_team.id);
    if (!home || !away) continue;

    applyMatchToRows(match, home, away);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b, 'de-AT'))
    .map(([groupName, rows]) => {
      const groupMatches = matches.filter((match) => match.stage === 'group' && match.group_name === groupName);
      const sortedRows = sortStandingRows(Array.from(rows.values()), groupMatches);

      return {
        groupName,
        rows: markStandingStatuses(sortedRows, groupMatches),
      };
    });
}

function BracketTeam({ match, side }: { match: MatchWithTeams; side: 'home' | 'away' }) {
  const team = side === 'home' ? match.home_team : match.away_team;
  const score = side === 'home' ? resultHomeScore(match) : resultAwayScore(match);
  const won = resultWinnerTeamId(match) && team?.id === resultWinnerTeamId(match);

  return (
    <div className={`bracketTeam ${won ? 'bracketTeamWinner' : ''}`}>
      <Flag team={team} />
      <span>{teamName(match, side)}</span>
      <strong>{score ?? '-'}</strong>
    </div>
  );
}

function BracketMatch({ match, displayNumber }: { match: MatchWithTeams; displayNumber: number }) {
  return (
    <article className={`bracketMatch ${hasResult(match) ? 'bracketMatchDone' : ''}`}>
      <div className="bracketMatchMeta">
        <span>Spiel {displayNumber}</span>
        <span>{formatKickoff(match.kickoff_time)}</span>
      </div>
      <BracketTeam match={match} side="home" />
      <BracketTeam match={match} side="away" />
    </article>
  );
}

export default async function TablesPage() {
  const user = await requireUser();

  const { data: teamsData } = await supabaseAdmin
    .from('teams')
    .select('*')
    .order('group_name', { ascending: true })
    .order('name', { ascending: true });

  const { data: matchesData } = await supabaseAdmin
    .from('matches')
    .select(`
      *,
      home_team:teams!matches_home_team_id_fkey(*),
      away_team:teams!matches_away_team_id_fkey(*)
    `)
    .order('kickoff_time', { ascending: true });

  const teams = (teamsData ?? []) as Team[];
  const matches = (matchesData ?? []) as MatchWithTeams[];
  const standings = buildStandings(teams, matches);
  const currentStage = getCurrentStage(matches);
  const thirdPlaceMatch = matches.find((match) => match.stage === 'third_place');
  const displayNumbers = new Map(
    [...matches]
      .sort((a, b) => {
        const dateDiff = new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime();
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
              <h2>Gruppe {group.groupName}</h2>
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
                    {group.rows.map((row) => (
                      <tr
                        className={row.status === 'qualified' ? 'standingQualified' : row.status === 'eliminated' ? 'standingEliminated' : undefined}
                        key={row.team.id}
                      >
                        <td>
                          <span className="standingTeam">
                            <Flag team={row.team} />
                            <span>{row.team.name}</span>
                          </span>
                        </td>
                        <td>{row.played}</td>
                        <td>{row.won}</td>
                        <td>{row.drawn}</td>
                        <td>{row.lost}</td>
                        <td className="standingsPoints">{row.points}</td>
                        <td>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </section>

        <section className="card bracketCard">
          <div className="bracketHeader">
            <h2>Turnierbaum</h2>
            <span>{currentStage === 'group' ? 'Gruppenphase' : getStageLabel(currentStage)}</span>
          </div>

          <div className="bracketScroll" data-bracket-scroll>
            <BracketAutoScroll currentStage={currentStage} />
            <div className="bracketBoard">
              {BRACKET_STAGES.map((stage) => {
                const stageMatches = matches
                  .filter((match) => match.stage === stage)
                  .sort((a, b) => {
                    const dateDiff = new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime();
                    return dateDiff !== 0 ? dateDiff : a.match_number - b.match_number;
                  });

                return (
                  <section className={`bracketColumn bracketColumn-${stage}`} data-bracket-stage={stage} key={stage}>
                    <h3>{getStageLabel(stage)}</h3>
                    <div className="bracketColumnMatches">
                      {stageMatches.map((match) => (
                        <BracketMatch key={match.id} match={match} displayNumber={displayNumbers.get(match.id) ?? match.match_number} />
                      ))}
                    </div>
                  </section>
                );
              })}

              {thirdPlaceMatch && (
                <section className="bracketColumn bracketColumn-third_place" data-bracket-stage="third_place">
                  <h3>Spiel um Platz 3</h3>
                  <div className="bracketColumnMatches">
                    <BracketMatch match={thirdPlaceMatch} displayNumber={displayNumbers.get(thirdPlaceMatch.id) ?? thirdPlaceMatch.match_number} />
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
