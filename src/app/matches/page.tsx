import { Nav } from '@/components/Nav';
import { MatchCard } from '@/components/MatchCard';
import { AutoScrollToCurrent } from '@/components/AutoScrollToCurrent';
import { requireUser } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getVisibleProfilesForUser, getVisibleProfileIdSet } from '@/lib/visibility';
import { isMatchStillRelevant, isPredictionLocked } from '@/lib/time';
import { runTipOptimizer } from '@/lib/optimizer';
import type { Match, Prediction, Profile } from '@/lib/types';
import type { OptimizerMatchPreview } from '@/components/MatchCard';

function buildOptimizerPreview(match: Match, optimizerInput: any, sourceBlendWeight: number): OptimizerMatchPreview | null {
  if (!match.home_team || !match.away_team || !optimizerInput) return null;
  if (!String(optimizerInput.odds_text ?? '').trim() && !String(optimizerInput.probabilities_text ?? '').trim()) return null;

  const result = runTipOptimizer({
    match,
    oddsText: optimizerInput.odds_text ?? '',
    probabilitiesText: optimizerInput.probabilities_text ?? '',
    homeRating: null,
    awayRating: null,
    maxGoals: Number(optimizerInput.max_goals ?? 7),
    sourceBlendWeight,
  });

  if (result.possibleResults.length === 0 || result.bestThree.length === 0) return null;

  const outcomes = result.possibleResults.reduce(
    (totals, possibleResult) => {
      if (possibleResult.home > possibleResult.away) totals.home += possibleResult.probability;
      else if (possibleResult.home < possibleResult.away) totals.away += possibleResult.probability;
      else totals.draw += possibleResult.probability;
      return totals;
    },
    { home: 0, draw: 0, away: 0 },
  );

  const diffMap = new Map<number, number>();
  for (const possibleResult of result.possibleResults) {
    const diff = possibleResult.home - possibleResult.away;
    diffMap.set(diff, (diffMap.get(diff) ?? 0) + possibleResult.probability);
  }

  return {
    outcomes,
    bestThree: result.bestThree.map((row) => ({ label: row.label, expectedPoints: row.expectedPoints })),
    alternativeDiffs: result.alternativeDiffs.map((row) => ({ label: row.label, expectedPoints: row.expectedPoints })),
    topScores: [...result.possibleResults]
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 7)
      .map((row) => ({ home: row.home, away: row.away, label: row.label, probability: row.probability })),
    topDiffs: Array.from(diffMap.entries())
      .map(([diff, probability]) => ({ diff, probability }))
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 7),
  };
}

export default async function MatchesPage() {
  const user = await requireUser();

  const { data: matchesData, error: matchesError } = await supabaseAdmin
    .from('matches')
    .select(`
      *,
      home_team:teams!matches_home_team_id_fkey(*),
      away_team:teams!matches_away_team_id_fkey(*)
    `)
    .order('kickoff_time', { ascending: true });

  if (matchesError) throw new Error(matchesError.message);

  const visibleProfiles = await getVisibleProfilesForUser(user);
  const visibleProfileIds = getVisibleProfileIdSet(visibleProfiles);

  const { data: predictionsData } = await supabaseAdmin
    .from('predictions')
    .select(`
      *,
      profile:profiles!predictions_user_id_fkey(id, username, is_admin)
    `);

  const matches = (matchesData ?? []) as Match[];
  const predictions = ((predictionsData ?? []) as Prediction[]).filter((prediction) => prediction.user_id === user.id || visibleProfileIds.has(prediction.user_id));
  const optimizerPreviewByMatchId = new Map<string, OptimizerMatchPreview>();

  if (user.is_admin && matches.length > 0) {
    const [{ data: optimizerInputs }, { data: optimizerSettings }] = await Promise.all([
      supabaseAdmin
        .from('tip_optimizer_inputs')
        .select('match_id, odds_text, probabilities_text, max_goals')
        .in('match_id', matches.map((match) => match.id)),
      supabaseAdmin
        .from('tip_optimizer_settings')
        .select('source_blend_weight')
        .eq('id', 1)
        .maybeSingle(),
    ]);

    const sourceBlendWeight = Number(optimizerSettings?.source_blend_weight ?? 0.5);
    const optimizerInputByMatchId = new Map((optimizerInputs ?? []).map((input: any) => [input.match_id, input]));

    for (const match of matches) {
      const preview = buildOptimizerPreview(match, optimizerInputByMatchId.get(match.id), sourceBlendWeight);
      if (preview) optimizerPreviewByMatchId.set(match.id, preview);
    }
  }

  const now = new Date();
  const currentMatchId = matches.find((match) => isMatchStillRelevant(match.kickoff_time, now))?.id;
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
      <main className="page">
        <AutoScrollToCurrent />
        <h1>Tipps</h1>
        <p className="subtle">Tipps können bis zum Anpfiff geändert werden. Änderungen werden automatisch gespeichert.</p>
        <div className="list">
          {matches.map((match) => {
            const matchPredictions = predictions.filter((prediction) => prediction.match_id === match.id);
            const ownPrediction = matchPredictions.find((prediction) => prediction.user_id === user.id);
            const showAllPredictions = isPredictionLocked(match.kickoff_time, now);

            return (
              <MatchCard
                key={match.id}
                match={{ ...match, predictions: matchPredictions }}
                ownPrediction={ownPrediction}
                showAllPredictions={showAllPredictions}
                currentUserId={user.id}
                visibleProfiles={visibleProfiles as Profile[]}
                current={match.id === currentMatchId}
                displayMatchNumber={displayNumbers.get(match.id)}
                showOptimizerControl={user.is_admin}
                optimizerPreview={user.is_admin ? optimizerPreviewByMatchId.get(match.id) : undefined}
              />
            );
          })}
        </div>
      </main>
    </>
  );
}
