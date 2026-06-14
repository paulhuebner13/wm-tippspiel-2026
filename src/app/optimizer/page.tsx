import { Nav } from '@/components/Nav';
import { OddsOptimizerPanel } from '@/components/OddsOptimizerPanel';
import { requireAdmin } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { Match } from '@/lib/types';

type SearchParams = Promise<{ matchNumber?: string }>;

export default async function OptimizerPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireAdmin();
  const params = await searchParams;
  const matchNumber = Number(params.matchNumber ?? '');

  type OptimizerPageMatch = Match & { home_team?: any; away_team?: any };
  let match: OptimizerPageMatch | null = null;
  let oddsText = '';
  let maxGoals = 7;
  let rankingWeight = 0.15;
  let homeRating: number | null = null;
  let awayRating: number | null = null;

  if (Number.isInteger(matchNumber) && matchNumber > 0) {
    const { data: matchData } = await supabaseAdmin
      .from('matches')
      .select(`
        *,
        home_team:teams!matches_home_team_id_fkey(*),
        away_team:teams!matches_away_team_id_fkey(*)
      `)
      .eq('match_number', matchNumber)
      .single();

    match = matchData as OptimizerPageMatch | null;

    if (match) {
      const { data: storedOdds } = await supabaseAdmin
        .from('tip_optimizer_inputs')
        .select('odds_text, max_goals, ranking_weight')
        .eq('match_id', match.id)
        .maybeSingle();

      oddsText = storedOdds?.odds_text ?? '';
      maxGoals = Number(storedOdds?.max_goals ?? 7);
      rankingWeight = Number(storedOdds?.ranking_weight ?? 0.15);

      const teamIds = [match.home_team_id, match.away_team_id].filter(Boolean) as string[];
      if (teamIds.length > 0) {
        const { data: ratings } = await supabaseAdmin
          .from('team_ratings')
          .select('team_id, fifa_points')
          .in('team_id', teamIds);

        const ratingMap = new Map((ratings ?? []).map((rating) => [rating.team_id, rating.fifa_points]));
        homeRating = match.home_team_id ? Number(ratingMap.get(match.home_team_id) ?? null) : null;
        awayRating = match.away_team_id ? Number(ratingMap.get(match.away_team_id) ?? null) : null;
      }
    }
  }

  return (
    <>
      <Nav user={user} />
      <main className="page">
        <h1>Optimierer</h1>
        <p className="subtle">Quoten einfügen, erwartete Punkte berechnen und Quoten je Spiel speichern. Das ändert keine Tipps.</p>

        <form className="searchCard" action="/optimizer">
          <label className="fieldLabel" htmlFor="matchNumber">Spielnummer</label>
          <div className="searchRow">
            <input id="matchNumber" name="matchNumber" type="number" min="1" placeholder="z. B. 31" defaultValue={Number.isInteger(matchNumber) ? matchNumber : ''} />
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
            homeRating={homeRating}
            awayRating={awayRating}
            initialMaxGoals={maxGoals}
            initialRankingWeight={rankingWeight}
          />
        )}
      </main>
    </>
  );
}
