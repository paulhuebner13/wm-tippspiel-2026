import { overridePredictionAction } from '@/app/actions';
import { ChangesAutoScroll } from '@/components/ChangesAutoScroll';
import { Flag } from '@/components/Flag';
import { Nav } from '@/components/Nav';
import { applyFixedTopTwoToMatches } from '@/lib/fixedGroupPlacements';
import { getStageLabel, isKnockoutStage } from '@/lib/scoring';
import { requireAdmin } from '@/lib/session';
import {
  applySpecialEffectsToMatches,
  getUserSpecialEffectActive,
} from '@/lib/specialEffects';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { formatKickoff, isPredictionLocked } from '@/lib/time';
import type { Match, Prediction, Profile, Team } from '@/lib/types';

type ChangesPageProps = {
  searchParams?: Promise<{ profileId?: string; matchNumber?: string; saved?: string; error?: string }>;
};

type MatchWithTeams = Match & {
  home_team?: Team | null;
  away_team?: Team | null;
};

function teamName(match: MatchWithTeams, side: 'home' | 'away') {
  if (side === 'home') return match.home_team?.name ?? match.home_placeholder ?? 'Offen';
  return match.away_team?.name ?? match.away_placeholder ?? 'Offen';
}

function scoreText(home: number | null, away: number | null) {
  if (home === null || away === null) return 'vs';
  return `${home}:${away}`;
}

function hasCompletePrediction(prediction: Prediction | undefined, match: MatchWithTeams) {
  if (!prediction || prediction.predicted_home_score === null || prediction.predicted_away_score === null) return false;
  if (
    isKnockoutStage(match.stage) &&
    prediction.predicted_home_score === prediction.predicted_away_score &&
    !prediction.advance_team_id
  ) {
    return false;
  }
  return true;
}

function predictionClass(match: MatchWithTeams, prediction: Prediction | undefined) {
  const started = isPredictionLocked(match.kickoff_time);
  const submitted = hasCompletePrediction(prediction, match);

  if (started && submitted) return 'changeMatchStartedSubmitted';
  if (started && !submitted) return 'changeMatchStartedMissing';
  if (!started && submitted) return 'changeMatchFutureSubmitted';
  return 'changeMatchFutureMissing';
}

function statusText(match: MatchWithTeams, prediction: Prediction | undefined) {
  const started = isPredictionLocked(match.kickoff_time);
  const submitted = hasCompletePrediction(prediction, match);

  if (started && submitted) return 'Begonnen, Tipp sichtbar';
  if (started && !submitted) return 'Begonnen, kein Tipp abgegeben';
  if (!started && submitted) return 'Tipp abgegeben, noch versteckt';
  return 'Noch nicht begonnen, kein Tipp';
}

function advanceTeamName(match: MatchWithTeams, prediction: Prediction | undefined) {
  if (!prediction?.advance_team_id) return null;
  if (prediction.advance_team_id === match.home_team_id) return teamName(match, 'home');
  if (prediction.advance_team_id === match.away_team_id) return teamName(match, 'away');
  return null;
}

export default async function ChangesPage({ searchParams }: ChangesPageProps) {
  const user = await requireAdmin();
  const params = await searchParams;

  const { data: profilesData } = await supabaseAdmin
    .from('profiles')
    .select('id, username, is_admin')
    .order('username', { ascending: true });

  const profiles = (profilesData ?? []) as Profile[];
  const selectedProfileId =
    params?.profileId && profiles.some((profile) => profile.id === params.profileId)
      ? params.profileId
      : profiles[0]?.id ?? '';
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? null;

  const [{ data: matchesData }, { data: teamsData }, { data: predictionsData }] = await Promise.all([
    supabaseAdmin
      .from('matches')
      .select(`
        *,
        home_team:teams!matches_home_team_id_fkey(*),
        away_team:teams!matches_away_team_id_fkey(*)
      `)
      .order('kickoff_time', { ascending: true }),
    supabaseAdmin.from('teams').select('*'),
    selectedProfileId
      ? supabaseAdmin.from('predictions').select('*').eq('user_id', selectedProfileId)
      : Promise.resolve({ data: [] }),
  ]);

  const rawMatches = (matchesData ?? []) as MatchWithTeams[];
  const teams = (teamsData ?? []) as Team[];
  const predictions = (predictionsData ?? []) as Prediction[];
  const predictionByMatchId = new Map(predictions.map((prediction) => [prediction.match_id, prediction]));
  const specialEffectActive = selectedProfileId ? await getUserSpecialEffectActive(selectedProfileId) : false;
  const matchesWithFixedTeams = applyFixedTopTwoToMatches(rawMatches, teams) as MatchWithTeams[];
  const matches = applySpecialEffectsToMatches(matchesWithFixedTeams, specialEffectActive) as MatchWithTeams[];

  const firstMissingMatchId =
    matches.find((match) => !hasCompletePrediction(predictionByMatchId.get(match.id), match))?.id ?? null;

  return (
    <>
      <Nav user={user} />
      <ChangesAutoScroll />
      <main className="page">
        <h1>Änderungen</h1>

        <section className="card changePlayerSelectBar">
          <form className="changePlayerSelectForm" method="get" action="/changes">
            <label>
              Spieler auswählen
              <select name="profileId" defaultValue={selectedProfileId}>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.username}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">Anzeigen</button>
          </form>
        </section>

        {selectedProfile && (
          <div className="changePlayerBanner">
            <span>Tipps bearbeiten für</span>
            <strong>{selectedProfile.username}</strong>
          </div>
        )}

        {params?.saved === '1' && <p className="changeSavedMessage">Tipp wurde gespeichert.</p>}
        {params?.error && <p className="errorText">Fehler: {params.error}</p>}

        {!selectedProfile && <p className="subtle">Es wurde noch kein Spieler gefunden.</p>}

        {selectedProfile && (
          <div className="list">
            {matches.map((match) => {
              const prediction = predictionByMatchId.get(match.id);
              const started = isPredictionLocked(match.kickoff_time);
              const submitted = hasCompletePrediction(prediction, match);
              const hideExistingTip = submitted && !started;
              const knockout = isKnockoutStage(match.stage);
              const advanceName = advanceTeamName(match, prediction);
              const scrollTarget = match.id === firstMissingMatchId;
              const homeDefault = hideExistingTip ? '' : prediction?.predicted_home_score?.toString() ?? '';
              const awayDefault = hideExistingTip ? '' : prediction?.predicted_away_score?.toString() ?? '';
              const advanceDefault = hideExistingTip ? '' : prediction?.advance_team_id ?? '';

              return (
                <section
                  key={match.id}
                  className={`card changeMatchCard ${predictionClass(match, prediction)}`}
                  data-change-scroll-target={scrollTarget ? 'true' : 'false'}
                >
                  <div className="matchTitleLine">
                    <span>Spiel {match.match_number}</span>
                    <span>{match.stage === 'group' && match.group_name ? `Gruppe ${match.group_name}` : getStageLabel(match.stage)}</span>
                    <span>{formatKickoff(match.kickoff_time)}</span>
                  </div>

                  <div className="lockedTeamsRow">
                    <div className="predictionTeam predictionTeamHome">
                      <span className="teamName">{teamName(match, 'home')}</span>
                      <Flag team={match.home_team} />
                    </div>
                    <strong className="lockedScoreBox">
                      {scoreText(match.home_score ?? match.provisional_home_score ?? null, match.away_score ?? match.provisional_away_score ?? null)}
                    </strong>
                    <div className="predictionTeam predictionTeamAway">
                      <Flag team={match.away_team} />
                      <span className="teamName">{teamName(match, 'away')}</span>
                    </div>
                  </div>

                  <div className="changeMatchStatusLine">
                    <span className="changeMatchStatusBadge">{statusText(match, prediction)}</span>
                    {started && submitted && prediction && (
                      <span>
                        Tipp: {prediction.predicted_home_score}:{prediction.predicted_away_score}
                        {advanceName ? `, weiter: ${advanceName}` : ''}
                      </span>
                    )}
                  </div>

                  <form action={overridePredictionAction} className="changePredictionForm">
                    <input type="hidden" name="userId" value={selectedProfile.id} />
                    <input type="hidden" name="matchId" value={match.id} />
                    <input type="hidden" name="matchNumber" value={String(match.match_number)} />

                    {hideExistingTip && (
                      <p className="changeFutureHiddenNote">
                        Für dieses noch nicht begonnene Spiel wurde ein Tipp abgegeben. Der Inhalt bleibt verborgen.
                      </p>
                    )}

                    <input
                      className="scoreLeft"
                      name="predictedHomeScore"
                      inputMode="numeric"
                      min="0"
                      type="number"
                      placeholder={hideExistingTip ? 'neu' : '0'}
                      defaultValue={homeDefault}
                      required
                    />
                    <span className="scoreSep">:</span>
                    <input
                      className="scoreRight"
                      name="predictedAwayScore"
                      inputMode="numeric"
                      min="0"
                      type="number"
                      placeholder={hideExistingTip ? 'neu' : '0'}
                      defaultValue={awayDefault}
                      required
                    />

                    {knockout && match.home_team_id && match.away_team_id && (
                      <select className="changeAdvanceSelect" name="advanceTeamId" defaultValue={advanceDefault}>
                        <option value="">Wer kommt weiter? Nur bei Unentschieden nötig</option>
                        <option value={match.home_team_id}>{teamName(match, 'home')}</option>
                        <option value={match.away_team_id}>{teamName(match, 'away')}</option>
                      </select>
                    )}

                    <button className="changeSaveButton" type="submit">
                      Tipp speichern
                    </button>
                  </form>
                </section>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
