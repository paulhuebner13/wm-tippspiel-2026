import { Nav } from '@/components/Nav';
import { OddsOptimizerPanel } from '@/components/OddsOptimizerPanel';
import { applyFixedTopTwoToMatches } from '@/lib/fixedGroupPlacements';
import { requireAdmin } from '@/lib/session';
import {
  applySpecialEffectsToMatches,
  getUserSpecialEffectActive,
} from '@/lib/specialEffects';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { Match, Team } from '@/lib/types';

type SearchParams = Promise<{ matchNumber?: string }>;

export default async function OptimizerPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireAdmin();
  const params = await searchParams;
  const matchNumber = Number(params.matchNumber ?? '');

  type OptimizerPageMatch = Match & { home_team?: Team | null; away_team?: Team | null };
  let match: OptimizerPageMatch | null = null;
  let oddsText = '';
  let probabilitiesText = '';
  let maxGoals = 7;
  let sourceBlendWeight = 0.5;

  const { data: optimizerSettings } = await supabaseAdmin
    .from('tip_optimizer_settings')
    .select('source_blend_weight')
    .eq('id', 1)
    .maybeSingle();

  sourceBlendWeight = Number(optimizerSettings?.source_blend_weight ?? 0.5);

  if (Number.isInteger(matchNumber) && matchNumber > 0) {
    const [matchesResult, teamsResult] = await Promise.all([
      supabaseAdmin
        .from('matches')
        .select(`
          *,
          home_team:teams!matches_home_team_id_fkey(*),
          away_team:teams!matches_away_team_id_fkey(*)
        `)
        .order('kickoff_time', { ascending: true }),
      supabaseAdmin
        .from('teams')
        .select('*')
        .order('group_name', { ascending: true })
        .order('name', { ascending: true }),
    ]);

    if (matchesResult.error) throw new Error(matchesResult.error.message);
    if (teamsResult.error) throw new Error(teamsResult.error.message);

    const teams = (teamsResult.data ?? []) as Team[];
    const matchesWithFixedTeams = applyFixedTopTwoToMatches(
      (matchesResult.data ?? []) as Match[],
      teams,
    );
    const specialEffectActive = await getUserSpecialEffectActive(user.id);
    const visibleMatches = applySpecialEffectsToMatches(
      matchesWithFixedTeams,
      specialEffectActive,
    );

    match =
      (visibleMatches.find(
        (candidate) => candidate.match_number === matchNumber,
      ) as OptimizerPageMatch | undefined) ?? null;

    if (match) {
      const { data: storedOdds } = await supabaseAdmin
        .from('tip_optimizer_inputs')
        .select('odds_text, probabilities_text, max_goals')
        .eq('match_id', match.id)
        .maybeSingle();

      oddsText = storedOdds?.odds_text ?? '';
      probabilitiesText = storedOdds?.probabilities_text ?? '';
      maxGoals = Number(storedOdds?.max_goals ?? 7);
    }
  }

  return (
    <>
      <Nav user={user} />
      <main className="page">
        <h1>Optimierer</h1>
        <p className="subtle">Quoten und Modell-Wahrscheinlichkeiten kombinieren, erwartete Punkte berechnen und Eingaben je Spiel speichern. Das ändert keine Tipps.</p>

        <form className="searchCard" action="/optimizer">
          <label className="fieldLabel" htmlFor="matchNumber">Spiel Nr.</label>
          <div className="searchRow">
            <input id="matchNumber" name="matchNumber" type="number" min="1" placeholder="z. B. 89" defaultValue={Number.isInteger(matchNumber) ? matchNumber : ''} />
            <button type="submit">Suchen</button>
          </div>
        </form>

        {Number.isInteger(matchNumber) && matchNumber > 0 && !match && (
          <p className="errorBox">Dieses Spiel wurde nicht gefunden.</p>
        )}

        {match && (
          <OddsOptimizerPanel
            match={match}
            initialOddsText={oddsText}
            initialProbabilitiesText={probabilitiesText}
            homeRating={null}
            awayRating={null}
            initialMaxGoals={maxGoals}
            initialSourceBlendWeight={sourceBlendWeight}
          />
        )}
      </main>
    </>
  );
}
