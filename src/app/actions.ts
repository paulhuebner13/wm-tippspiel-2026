'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';
import { createSession, destroySession, requireAdmin, requireUser } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isKnockoutStage } from '@/lib/scoring';
import { isPredictionLocked } from '@/lib/time';

function readNumber(value: FormDataEntryValue | null): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

export async function loginAction(formData: FormData) {
  const username = String(formData.get('username') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!username || !password) {
    redirect('/login?error=missing');
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, username, password_hash, is_admin')
    .eq('username', username)
    .single();

  if (!profile) {
    redirect('/login?error=invalid');
  }

  const passwordIsCorrect = await bcrypt.compare(password, profile.password_hash);

  if (!passwordIsCorrect) {
    redirect('/login?error=invalid');
  }

  await createSession({ id: profile.id, username: profile.username, is_admin: profile.is_admin });
  redirect('/matches');
}

export async function logoutAction() {
  await destroySession();
  redirect('/login');
}

export async function savePredictionAction(formData: FormData) {
  const user = await requireUser();
  const matchId = String(formData.get('matchId') ?? '');
  const predictedHomeScore = readNumber(formData.get('predictedHomeScore'));
  const predictedAwayScore = readNumber(formData.get('predictedAwayScore'));
  const advanceTeamIdRaw = String(formData.get('advanceTeamId') ?? '');
  const advanceTeamId = advanceTeamIdRaw.length > 0 ? advanceTeamIdRaw : null;

  if (!matchId || predictedHomeScore === null || predictedAwayScore === null) {
    redirect('/matches?error=invalid_prediction');
  }

  const { data: match } = await supabaseAdmin
    .from('matches')
    .select('id, kickoff_time, stage, is_finished, is_open_for_predictions, home_team_id, away_team_id')
    .eq('id', matchId)
    .single();

  if (!match || match.is_finished || !match.is_open_for_predictions || isPredictionLocked(match.kickoff_time)) {
    redirect('/matches?error=locked');
  }

  if (isKnockoutStage(match.stage) && predictedHomeScore === predictedAwayScore) {
    const validAdvanceTeam = advanceTeamId === match.home_team_id || advanceTeamId === match.away_team_id;
    if (!validAdvanceTeam) {
      redirect('/matches?error=missing_advance_team');
    }
  }

  await supabaseAdmin.from('predictions').upsert(
    {
      user_id: user.id,
      match_id: matchId,
      predicted_home_score: predictedHomeScore,
      predicted_away_score: predictedAwayScore,
      advance_team_id: advanceTeamId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,match_id' }
  );

  revalidatePath('/matches');
  redirect('/matches?saved=1');
}

export async function saveResultAction(formData: FormData) {
  await requireAdmin();

  const matchId = String(formData.get('matchId') ?? '');
  const homeScore = readNumber(formData.get('homeScore'));
  const awayScore = readNumber(formData.get('awayScore'));
  const winnerTeamIdRaw = String(formData.get('winnerTeamId') ?? '');
  const winnerTeamId = winnerTeamIdRaw.length > 0 ? winnerTeamIdRaw : null;

  if (!matchId || homeScore === null || awayScore === null) {
    redirect('/admin?error=invalid_result');
  }

  const { data: match } = await supabaseAdmin
    .from('matches')
    .select('stage, home_team_id, away_team_id')
    .eq('id', matchId)
    .single();

  if (!match) redirect('/admin?error=match_not_found');

  const knockout = isKnockoutStage(match.stage);
  const isDraw = homeScore === awayScore;

  if (knockout && isDraw) {
    const validWinner = winnerTeamId === match.home_team_id || winnerTeamId === match.away_team_id;
    if (!validWinner) redirect('/admin?error=missing_winner');
  }

  const automaticWinner = homeScore > awayScore ? match.home_team_id : homeScore < awayScore ? match.away_team_id : winnerTeamId;

  await supabaseAdmin
    .from('matches')
    .update({
      home_score: homeScore,
      away_score: awayScore,
      winner_team_id: knockout ? automaticWinner : null,
      is_finished: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', matchId);

  revalidatePath('/admin');
  revalidatePath('/results');
  revalidatePath('/ranking');
  redirect('/admin?saved=1');
}

export async function updateKnockoutTeamsAction(formData: FormData) {
  await requireAdmin();

  const matchId = String(formData.get('matchId') ?? '');
  const homeTeamId = String(formData.get('homeTeamId') ?? '') || null;
  const awayTeamId = String(formData.get('awayTeamId') ?? '') || null;
  const openForPredictions = formData.get('openForPredictions') === 'on';

  if (!matchId) redirect('/admin?error=missing_match');

  await supabaseAdmin
    .from('matches')
    .update({
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      home_placeholder: homeTeamId ? null : undefined,
      away_placeholder: awayTeamId ? null : undefined,
      is_open_for_predictions: openForPredictions,
      updated_at: new Date().toISOString(),
    })
    .eq('id', matchId);

  revalidatePath('/admin');
  revalidatePath('/matches');
  redirect('/admin?saved=1');
}
