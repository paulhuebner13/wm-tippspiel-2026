import { ChangePredictionEditor } from '@/components/ChangePredictionEditor';
import { ChangesAutoScroll } from '@/components/ChangesAutoScroll';
import { Nav } from '@/components/Nav';
import { applyFixedTopTwoToMatches } from '@/lib/fixedGroupPlacements';
import { requireAdmin } from '@/lib/session';
import {
  applySpecialEffectsToMatches,
  getUserSpecialEffectActive,
} from '@/lib/specialEffects';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isKnockoutStage } from '@/lib/scoring';
import type { Match, Prediction, Profile, Team } from '@/lib/types';

type ChangesPageProps = {
  searchParams?: Promise<{ profileId?: string; error?: string }>;
};

type MatchWithTeams = Match & {
  home_team?: Team | null;
  away_team?: Team | null;
};

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
      : '';
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

  const firstMissingMatchId = selectedProfile
    ? matches.find((match) => !hasCompletePrediction(predictionByMatchId.get(match.id), match))?.id ?? null
    : null;

  return (
    <>
      <Nav user={user} />
      {selectedProfile && <ChangesAutoScroll />}
      <main className="page">
        <h1>Änderungen</h1>

        <section className="card changePlayerSelectBar">
          <form className="changePlayerSelectForm" method="get" action="/changes">
            <label>
              Spieler auswählen
              <select name="profileId" defaultValue={selectedProfileId} required>
                <option value="">Spieler auswählen</option>
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

        {params?.error && <p className="errorText">Fehler: {params.error}</p>}

        {selectedProfile && (
          <div className="list">
            {matches.map((match) => {
              const prediction = predictionByMatchId.get(match.id);
              const scrollTarget = match.id === firstMissingMatchId;

              return (
                <ChangePredictionEditor
                  key={match.id}
                  match={match}
                  selectedProfile={selectedProfile}
                  prediction={prediction}
                  scrollTarget={scrollTarget}
                />
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
