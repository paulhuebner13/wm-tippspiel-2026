import { Nav } from '@/components/Nav';
import { Flag } from '@/components/Flag';
import { ResultsAutoScroll } from '@/components/ResultsAutoScroll';
import { ResultsComparePicker } from '@/components/ResultsComparePicker';
import { requireUser } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getVisibleProfilesForUser } from '@/lib/visibility';
import { calculateTotalPoints, getStageLabel } from '@/lib/scoring';
import { formatKickoff } from '@/lib/time';
import { applyFixedTopTwoToMatches } from '@/lib/fixedGroupPlacements';
import { applySpecialEffectsToMatches, getUserSpecialEffectActive } from '@/lib/specialEffects';
import type { Match, Prediction, Profile, Team } from '@/lib/types';

type ResultsPageProps = {
  searchParams?: Promise<{ compareUserId?: string; compareUserIds?: string }>;
};

function resultTeamName(match: Match, side: 'home' | 'away') {
  if (side === 'home') return match.home_team?.name ?? match.home_placeholder ?? 'Offen';
  return match.away_team?.name ?? match.away_placeholder ?? 'Offen';
}

function resultHomeScore(match: Match) {
  return match.home_score ?? match.provisional_home_score ?? null;
}

function resultAwayScore(match: Match) {
  return match.away_score ?? match.provisional_away_score ?? null;
}

function hasResult(match: Match) {
  return resultHomeScore(match) !== null && resultAwayScore(match) !== null;
}

function resultIsFinished(match: Match) {
  return match.is_finished || hasResult(match);
}

function matchForScoring(match: Match): Match {
  return {
    ...match,
    home_score: resultHomeScore(match),
    away_score: resultAwayScore(match),
    winner_team_id: match.winner_team_id ?? match.provisional_winner_team_id ?? null,
    is_finished: resultIsFinished(match),
  };
}

function hasCompletePrediction(prediction: Prediction | undefined, match: Match) {
  if (!prediction || prediction.predicted_home_score === null || prediction.predicted_away_score === null) return false;
  if (match.stage !== 'group' && prediction.predicted_home_score === prediction.predicted_away_score && !prediction.advance_team_id) {
    return false;
  }
  return true;
}

function predictionStatusText(prediction: Prediction | undefined, match: Match) {
  if (!prediction) return 'Kein Tipp abgegeben';
  if (!hasCompletePrediction(prediction, match)) return 'Tipp unvollständig';
  return 'Tipp abgegeben';
}

function advanceWinnerName(prediction: Prediction | undefined, match: Match) {
  if (!prediction?.advance_team_id) return null;
  if (match.home_team?.id === prediction.advance_team_id) return resultTeamName(match, 'home');
  if (match.away_team?.id === prediction.advance_team_id) return resultTeamName(match, 'away');
  return null;
}

function pointsText(match: Match, prediction: Prediction | undefined) {
  if (!hasResult(match) || !resultIsFinished(match)) return '–';
  if (!hasCompletePrediction(prediction, match)) return '0';
  return String(calculateTotalPoints(matchForScoring(match), prediction as Prediction));
}

function resultScoreText(match: Match) {
  if (!hasResult(match)) return '–:–';
  return `${resultHomeScore(match)}:${resultAwayScore(match)}`;
}

function ResultPlayerPanel({ profile, match, prediction, self }: { profile: Profile; match: Match; prediction?: Prediction; self: boolean }) {
  const complete = hasCompletePrediction(prediction, match);
  const finished = hasResult(match) && resultIsFinished(match);
  const advanceName = finished ? advanceWinnerName(prediction, match) : null;

  return (
    <div className={`resultPlayerPanel ${self ? 'resultPlayerPanelSelf' : ''}`}>
      <div className="resultPlayerNameCell">
        <span>{self ? 'Du' : profile.username}</span>
      </div>

      <div className="resultPanelDivider" aria-hidden="true" />

      <div className="resultPlayerTipCell">
        {finished && complete ? (
          <div className="resultTipVisual">
            <div className="resultTipTeam resultTipTeamHome">
              <Flag team={match.home_team} />
              <span>{resultTeamName(match, 'home')}</span>
            </div>
            <div className="resultTipScore">
              {prediction?.predicted_home_score}:{prediction?.predicted_away_score}
            </div>
            <div className="resultTipTeam resultTipTeamAway">
              <Flag team={match.away_team} />
              <span>{resultTeamName(match, 'away')}</span>
            </div>
            {advanceName && <div className="resultAdvanceLine">Weiter: {advanceName}</div>}
          </div>
        ) : (
          <div className={`resultPredictionText ${complete ? 'resultPredictionComplete' : 'resultPredictionMissing'}`}>
            {predictionStatusText(prediction, match)}
          </div>
        )}
      </div>

      <div className="resultPlayerPointsBox">
        <span>{pointsText(match, prediction)}</span>
      </div>
    </div>
  );
}

export default async function ResultsPage({ searchParams }: ResultsPageProps) {
  const user = await requireUser();
  const params = await searchParams;

  const visibleProfiles = await getVisibleProfilesForUser(user);
  const otherProfiles = visibleProfiles.filter((profile) => profile.id !== user.id);
  const requestedCompareUserIds = [
    ...(params?.compareUserIds ?? '').split(','),
    ...(params?.compareUserId ? [params.compareUserId] : []),
  ].filter(Boolean);
  const selectedCompareUserIds = Array.from(
    new Set(requestedCompareUserIds.filter((profileId) => otherProfiles.some((profile) => profile.id === profileId))),
  );
  const compareProfiles = selectedCompareUserIds
    .map((profileId) => otherProfiles.find((profile) => profile.id === profileId))
    .filter((profile): profile is Profile => Boolean(profile));
  const shownProfiles = [user, ...compareProfiles];
  const shownProfileIds = shownProfiles.map((profile) => profile.id);

  const [
    { data: matchesData },
    { data: teamsData },
    { data: predictionsData },
  ] = await Promise.all([
    supabaseAdmin
      .from('matches')
      .select(`
        *,
        home_team:teams!matches_home_team_id_fkey(*),
        away_team:teams!matches_away_team_id_fkey(*)
      `)
      .order('kickoff_time', { ascending: true }),
    supabaseAdmin.from('teams').select('*'),
    supabaseAdmin.from('predictions').select('*').in('user_id', shownProfileIds),
  ]);

  const teams = (teamsData ?? []) as Team[];
  const specialEffectActive = await getUserSpecialEffectActive(user.id);
  const matchesWithFixedTeams = applyFixedTopTwoToMatches((matchesData ?? []) as Match[], teams);
  const matches = applySpecialEffectsToMatches(matchesWithFixedTeams, specialEffectActive);
  const predictions = (predictionsData ?? []) as Prediction[];
  const predictionsByKey = new Map(predictions.map((prediction) => [`${prediction.user_id}:${prediction.match_id}`, prediction]));

  const finishedMatches = matches.filter((match) => resultIsFinished(match) && hasResult(match));
  const lastFinishedMatchNumber = finishedMatches.length > 0 ? finishedMatches[finishedMatches.length - 1].match_number : null;

  return (
    <>
      <Nav user={user} />
      <ResultsAutoScroll targetMatchNumber={lastFinishedMatchNumber} />
      <main className="page resultsPageNew">
        <div className="pageHeaderBlock resultsHeaderBlock">
          <div>
            <h1>Ergebnisse</h1>
          </div>
        </div>

        <ResultsComparePicker profiles={otherProfiles} selectedCompareUserIds={selectedCompareUserIds} />

        <div className="list resultsListNew">
          {matches.map((match) => {
            return (
              <article
                className={`card resultMatchCard ${hasResult(match) && resultIsFinished(match) ? 'resultMatchEvaluated' : ''}`}
                key={match.id}
                data-result-scroll-target={match.match_number}
              >
                <div className="matchHeader resultPageMatchHeader">
                  <div>
                    <div className="matchTitleLine resultTitleLine">
                      <span>Spiel {match.match_number}</span>
                      <span>{match.stage === 'group' && match.group_name ? `Gruppe ${match.group_name}` : getStageLabel(match.stage)}</span>
                      <span>{formatKickoff(match.kickoff_time)}</span>
                    </div>
                  </div>
                </div>

                <div className="resultMatchGrid">
                  <div className="team resultTeamSide sideHome">
                    <span className="teamName">{resultTeamName(match, 'home')}</span>
                    <Flag team={match.home_team} />
                  </div>

                  <div className="resultFinalScoreBox">
                    <span>Ergebnis</span>
                    <strong>{resultScoreText(match)}</strong>
                  </div>

                  <div className="team resultTeamSide sideAway">
                    <Flag team={match.away_team} />
                    <span className="teamName">{resultTeamName(match, 'away')}</span>
                  </div>
                </div>

                <div className={`resultPlayersGrid ${shownProfiles.length > 1 ? 'resultPlayersGridCompare' : ''}`}>
                  {shownProfiles.map((profile) => (
                    <ResultPlayerPanel
                      key={profile.id}
                      profile={profile}
                      match={match}
                      prediction={predictionsByKey.get(`${profile.id}:${match.id}`)}
                      self={profile.id === user.id}
                    />
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </>
  );
}
