import { Nav } from '@/components/Nav';
import { Flag } from '@/components/Flag';
import { ResultsAutoScroll } from '@/components/ResultsAutoScroll';
import { ResultsComparePicker } from '@/components/ResultsComparePicker';
import { requireUser } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getVisibleProfilesForUser } from '@/lib/visibility';
import { calculateTotalPoints, getStageLabel } from '@/lib/scoring';
import { formatKickoff } from '@/lib/time';
import type { Match, Prediction, Profile } from '@/lib/types';

type ResultsPageProps = {
  searchParams?: Promise<{ compareUserId?: string }>;
};

function resultTeamName(match: Match, side: 'home' | 'away') {
  if (side === 'home') return match.home_team?.name ?? match.home_placeholder ?? 'Offen';
  return match.away_team?.name ?? match.away_placeholder ?? 'Offen';
}

function hasResult(match: Match) {
  return match.home_score !== null && match.away_score !== null;
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
  if (!hasResult(match) || !match.is_finished) return '–';
  if (!hasCompletePrediction(prediction, match)) return '0';
  return String(calculateTotalPoints(match, prediction as Prediction));
}

function resultScoreText(match: Match) {
  if (!hasResult(match)) return '–:–';
  return `${match.home_score}:${match.away_score}`;
}

function ResultPlayerPanel({ profile, match, prediction, self }: { profile: Profile; match: Match; prediction?: Prediction; self: boolean }) {
  const complete = hasCompletePrediction(prediction, match);
  const finished = hasResult(match) && match.is_finished;
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
  const selectedCompareUserId =
    params?.compareUserId && otherProfiles.some((profile) => profile.id === params.compareUserId) ? params.compareUserId : null;
  const compareProfile = otherProfiles.find((profile) => profile.id === selectedCompareUserId) ?? null;
  const shownProfiles = compareProfile ? [user, compareProfile] : [user];
  const shownProfileIds = shownProfiles.map((profile) => profile.id);

  const { data: matchesData } = await supabaseAdmin
    .from('matches')
    .select(`
      *,
      home_team:teams!matches_home_team_id_fkey(*),
      away_team:teams!matches_away_team_id_fkey(*)
    `)
    .order('kickoff_time', { ascending: true });

  const { data: predictionsData } = await supabaseAdmin.from('predictions').select('*').in('user_id', shownProfileIds);

  const matches = (matchesData ?? []) as Match[];
  const predictions = (predictionsData ?? []) as Prediction[];
  const predictionsByKey = new Map(predictions.map((prediction) => [`${prediction.user_id}:${prediction.match_id}`, prediction]));

  const finishedMatches = matches.filter((match) => match.is_finished && hasResult(match));
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

        <ResultsComparePicker profiles={otherProfiles} selectedCompareUserId={selectedCompareUserId} />

        <div className="list resultsListNew">
          {matches.map((match) => {
            return (
              <article className="card resultMatchCard" key={match.id} data-result-scroll-target={match.match_number}>
                <div className="matchTitleLine">
                  <span>Spiel {match.match_number}</span>
                  <span>{match.stage === 'group' && match.group_name ? `Gruppe ${match.group_name}` : getStageLabel(match.stage)}</span>
                  <span>{formatKickoff(match.kickoff_time)}</span>
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

                <div className={`resultPlayersGrid ${compareProfile ? 'resultPlayersGridCompare' : ''}`}>
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
