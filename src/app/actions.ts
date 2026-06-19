"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import {
  createSession,
  destroySession,
  requireAdmin,
  requireUser,
} from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isKnockoutStage } from "@/lib/scoring";
import { isPredictionLocked } from "@/lib/time";
import { getBracketTargetsForSource, getLoserTeamId } from "@/lib/bracket";

function readNumber(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

async function updatePredictionOpenState(matchId: string) {
  const { data: match } = await supabaseAdmin
    .from("matches")
    .select("home_team_id, away_team_id, is_finished")
    .eq("id", matchId)
    .single();

  if (!match) return;

  await supabaseAdmin
    .from("matches")
    .update({
      is_open_for_predictions: Boolean(
        match.home_team_id && match.away_team_id && !match.is_finished,
      ),
      updated_at: new Date().toISOString(),
    })
    .eq("id", matchId);
}

async function propagateKnockoutTeams(input: {
  sourceMatchNumber: number;
  homeTeamId: string | null;
  awayTeamId: string | null;
  winnerTeamId: string | null;
}) {
  const targets = getBracketTargetsForSource(input.sourceMatchNumber);
  if (targets.length === 0) return;

  const loserTeamId = getLoserTeamId({
    homeTeamId: input.homeTeamId,
    awayTeamId: input.awayTeamId,
    winnerTeamId: input.winnerTeamId,
  });

  for (const target of targets) {
    const teamId =
      target.sourceResult === "winner" ? input.winnerTeamId : loserTeamId;
    const teamColumn = target.side === "home" ? "home_team_id" : "away_team_id";
    const placeholderColumn =
      target.side === "home" ? "home_placeholder" : "away_placeholder";

    await supabaseAdmin
      .from("matches")
      .update({
        [teamColumn]: teamId,
        [placeholderColumn]: teamId ? null : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("match_number", target.targetMatchNumber);

    const { data: targetMatch } = await supabaseAdmin
      .from("matches")
      .select("id")
      .eq("match_number", target.targetMatchNumber)
      .single();

    if (targetMatch) {
      await updatePredictionOpenState(targetMatch.id);
    }
  }
}

export async function loginAction(formData: FormData) {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    redirect("/login?error=missing");
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, username, password_hash, is_admin, can_submit_results")
    .eq("username", username)
    .single();

  if (!profile) {
    redirect("/login?error=invalid");
  }

  const passwordIsCorrect = await bcrypt.compare(
    password,
    profile.password_hash,
  );

  if (!passwordIsCorrect) {
    redirect("/login?error=invalid");
  }

  await createSession({
    id: profile.id,
    username: profile.username,
    is_admin: profile.is_admin,
  });
  redirect("/matches");
}

export async function registerAction(formData: FormData) {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    redirect("/login?mode=register&error=missing");
  }

  if (username.length < 2 || password.length < 2) {
    redirect("/login?mode=register&error=user_data_too_short");
  }

  const { data: existingProfiles } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .ilike("username", username)
    .limit(1);

  if (existingProfiles && existingProfiles.length > 0) {
    redirect("/login?mode=register&error=user_exists");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .insert({
      username,
      password_hash: passwordHash,
      is_admin: false,
    })
    .select("id, username, is_admin, can_submit_results")
    .single();

  if (error || !profile) {
    redirect("/login?mode=register&error=register_failed");
  }

  await createSession({
    id: profile.id,
    username: profile.username,
    is_admin: profile.is_admin,
  });
  redirect("/matches");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function savePredictionAction(formData: FormData) {
  const user = await requireUser();
  const matchId = String(formData.get("matchId") ?? "");
  const predictedHomeScore = readNumber(formData.get("predictedHomeScore"));
  const predictedAwayScore = readNumber(formData.get("predictedAwayScore"));
  const advanceTeamIdRaw = String(formData.get("advanceTeamId") ?? "");
  const advanceTeamId = advanceTeamIdRaw.length > 0 ? advanceTeamIdRaw : null;

  if (!matchId || predictedHomeScore === null || predictedAwayScore === null) {
    redirect("/matches?error=invalid_prediction");
  }

  const { data: match } = await supabaseAdmin
    .from("matches")
    .select(
      "id, kickoff_time, stage, is_finished, is_open_for_predictions, home_team_id, away_team_id",
    )
    .eq("id", matchId)
    .single();

  if (
    !match ||
    match.is_finished ||
    !match.is_open_for_predictions ||
    isPredictionLocked(match.kickoff_time)
  ) {
    redirect("/matches?error=locked");
  }

  if (
    isKnockoutStage(match.stage) &&
    predictedHomeScore === predictedAwayScore
  ) {
    const validAdvanceTeam =
      advanceTeamId === match.home_team_id ||
      advanceTeamId === match.away_team_id;
    if (!validAdvanceTeam) {
      redirect("/matches?error=missing_advance_team");
    }
  }

  await supabaseAdmin.from("predictions").upsert(
    {
      user_id: user.id,
      match_id: matchId,
      predicted_home_score: predictedHomeScore,
      predicted_away_score: predictedAwayScore,
      advance_team_id: advanceTeamId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,match_id" },
  );

  revalidatePath("/matches");
  redirect("/matches?saved=1");
}

export async function savePredictionInlineAction(input: {
  matchId: string;
  predictedHomeScore: number | null;
  predictedAwayScore: number | null;
  advanceTeamId?: string | null;
}): Promise<
  | { ok: true; predictionId?: string; deleted?: boolean }
  | { ok: false; error: string }
> {
  const user = await requireUser();
  const { matchId, predictedHomeScore, predictedAwayScore } = input;
  const advanceTeamId = input.advanceTeamId ?? null;

  const scoreIsValid = (score: number | null) =>
    score === null || (Number.isInteger(score) && score >= 0);

  if (
    !matchId ||
    !scoreIsValid(predictedHomeScore) ||
    !scoreIsValid(predictedAwayScore)
  ) {
    return { ok: false, error: "invalid_prediction" };
  }

  const { data: match } = await supabaseAdmin
    .from("matches")
    .select(
      "id, kickoff_time, stage, is_finished, is_open_for_predictions, home_team_id, away_team_id",
    )
    .eq("id", matchId)
    .single();

  if (
    !match ||
    match.is_finished ||
    !match.is_open_for_predictions ||
    isPredictionLocked(match.kickoff_time)
  ) {
    return { ok: false, error: "locked" };
  }

  const isCompletelyEmpty =
    predictedHomeScore === null && predictedAwayScore === null;

  if (isCompletelyEmpty) {
    const { error } = await supabaseAdmin
      .from("predictions")
      .delete()
      .eq("user_id", user.id)
      .eq("match_id", matchId);

    if (error) {
      return { ok: false, error: "delete_failed" };
    }

    revalidatePath("/matches");
    revalidatePath("/results");
    revalidatePath("/ranking");
    return { ok: true, deleted: true };
  }

  const bothScoresComplete =
    predictedHomeScore !== null && predictedAwayScore !== null;
  const isKnockoutDraw =
    bothScoresComplete &&
    isKnockoutStage(match.stage) &&
    predictedHomeScore === predictedAwayScore;
  const validAdvanceTeam =
    advanceTeamId === match.home_team_id ||
    advanceTeamId === match.away_team_id;

  // Incomplete tips and knockout draws without selected advancing team are intentionally saved.
  // They stay yellow in the UI and do not count for points until they become complete.
  const storedAdvanceTeamId =
    isKnockoutDraw && validAdvanceTeam ? advanceTeamId : null;

  const { data, error } = await supabaseAdmin
    .from("predictions")
    .upsert(
      {
        user_id: user.id,
        match_id: matchId,
        predicted_home_score: predictedHomeScore,
        predicted_away_score: predictedAwayScore,
        advance_team_id: storedAdvanceTeamId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,match_id" },
    )
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: "save_failed" };
  }

  revalidatePath("/matches");
  revalidatePath("/results");
  revalidatePath("/ranking");
  return { ok: true, predictionId: data?.id };
}

export async function saveResultAction(formData: FormData) {
  await requireAdmin();

  const matchId = String(formData.get("matchId") ?? "");
  const homeScore = readNumber(formData.get("homeScore"));
  const awayScore = readNumber(formData.get("awayScore"));
  const winnerTeamIdRaw = String(formData.get("winnerTeamId") ?? "");
  const winnerTeamId = winnerTeamIdRaw.length > 0 ? winnerTeamIdRaw : null;

  if (!matchId || homeScore === null || awayScore === null) {
    redirect("/admin?error=invalid_result");
  }

  const { data: match } = await supabaseAdmin
    .from("matches")
    .select("match_number, stage, home_team_id, away_team_id")
    .eq("id", matchId)
    .single();

  if (!match) redirect("/admin?error=match_not_found");

  const knockout = isKnockoutStage(match.stage);
  const isDraw = homeScore === awayScore;

  if (knockout && isDraw) {
    const validWinner =
      winnerTeamId === match.home_team_id ||
      winnerTeamId === match.away_team_id;
    if (!validWinner) redirect("/admin?error=missing_winner");
  }

  const automaticWinner =
    homeScore > awayScore
      ? match.home_team_id
      : homeScore < awayScore
        ? match.away_team_id
        : winnerTeamId;

  await supabaseAdmin
    .from("matches")
    .update({
      home_score: homeScore,
      away_score: awayScore,
      winner_team_id: knockout ? automaticWinner : null,
      provisional_home_score: null,
      provisional_away_score: null,
      provisional_winner_team_id: null,
      provisional_submitted_by_name: null,
      provisional_updated_at: null,
      is_finished: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", matchId);

  if (knockout) {
    await propagateKnockoutTeams({
      sourceMatchNumber: match.match_number,
      homeTeamId: match.home_team_id,
      awayTeamId: match.away_team_id,
      winnerTeamId: automaticWinner,
    });
  }

  revalidatePath("/admin");
  revalidatePath("/results");
  revalidatePath("/ranking");
  redirect("/admin?saved=1");
}

export async function saveResultInlineAction(input: {
  matchId: string;
  homeScore: number | null;
  awayScore: number | null;
  winnerTeamId?: string | null;
}): Promise<
  { ok: true; winnerTeamId?: string | null } | { ok: false; error: string }
> {
  await requireAdmin();

  const { matchId, homeScore, awayScore } = input;
  const winnerTeamId = input.winnerTeamId ?? null;
  const scoreIsValid = (score: number | null) =>
    score === null || (Number.isInteger(score) && score >= 0);

  if (!matchId || !scoreIsValid(homeScore) || !scoreIsValid(awayScore)) {
    return { ok: false, error: "invalid_result" };
  }

  const { data: match } = await supabaseAdmin
    .from("matches")
    .select("id, match_number, stage, home_team_id, away_team_id")
    .eq("id", matchId)
    .single();

  if (!match) {
    return { ok: false, error: "match_not_found" };
  }

  const hasBothScores = homeScore !== null && awayScore !== null;
  const knockout = isKnockoutStage(match.stage);
  const isDraw = hasBothScores && homeScore === awayScore;
  let storedWinnerTeamId: string | null = null;
  let isFinished = false;

  if (hasBothScores) {
    if (knockout) {
      if (homeScore > awayScore) {
        storedWinnerTeamId = match.home_team_id;
        isFinished = true;
      } else if (homeScore < awayScore) {
        storedWinnerTeamId = match.away_team_id;
        isFinished = true;
      } else if (isDraw) {
        const validWinner =
          winnerTeamId === match.home_team_id ||
          winnerTeamId === match.away_team_id;
        if (validWinner) {
          storedWinnerTeamId = winnerTeamId;
          isFinished = true;
        } else {
          storedWinnerTeamId = null;
          isFinished = false;
        }
      }
    } else {
      storedWinnerTeamId = null;
      isFinished = true;
    }
  }

  const { error } = await supabaseAdmin
    .from("matches")
    .update({
      home_score: homeScore,
      away_score: awayScore,
      winner_team_id: knockout ? storedWinnerTeamId : null,
      provisional_home_score: isFinished ? null : undefined,
      provisional_away_score: isFinished ? null : undefined,
      provisional_winner_team_id: isFinished ? null : undefined,
      provisional_submitted_by_name: isFinished ? null : undefined,
      provisional_updated_at: isFinished ? null : undefined,
      is_finished: isFinished,
      updated_at: new Date().toISOString(),
    })
    .eq("id", matchId);

  if (error) {
    return { ok: false, error: "save_failed" };
  }

  if (knockout) {
    await propagateKnockoutTeams({
      sourceMatchNumber: match.match_number,
      homeTeamId: match.home_team_id,
      awayTeamId: match.away_team_id,
      winnerTeamId: isFinished ? storedWinnerTeamId : null,
    });
  }

  // Do not revalidate paths here. This action is used by the inline admin result editor.
  // Revalidating the current admin page while the user is still typing can cause the
  // server-rendered values to overwrite the local input fields. The UI updates
  // optimistically instead, and other pages will see the saved result on their next load.
  return { ok: true, winnerTeamId: storedWinnerTeamId };
}


export async function saveProvisionalResultInlineAction(input: {
  matchId: string;
  homeScore: number | null;
  awayScore: number | null;
  winnerTeamId?: string | null;
}): Promise<{ ok: true; winnerTeamId?: string | null } | { ok: false; error: string }> {
  const user = await requireUser();

  if (!user.is_admin && !user.can_submit_results) {
    return { ok: false, error: "forbidden" };
  }

  const { matchId, homeScore, awayScore } = input;
  const winnerTeamId = input.winnerTeamId ?? null;
  const scoreIsValid = (score: number | null) => score === null || (Number.isInteger(score) && score >= 0);

  if (!matchId || !scoreIsValid(homeScore) || !scoreIsValid(awayScore)) {
    return { ok: false, error: "invalid_result" };
  }

  const { data: match } = await supabaseAdmin
    .from("matches")
    .select("id, kickoff_time, stage, home_team_id, away_team_id, home_score, away_score, winner_team_id")
    .eq("id", matchId)
    .single();

  if (!match) {
    return { ok: false, error: "match_not_found" };
  }

  const hasOfficialResult = match.home_score !== null && match.away_score !== null;
  const knockout = isKnockoutStage(match.stage);
  const provisionalOpenAt = new Date(new Date(match.kickoff_time).getTime() + 105 * 60 * 1000);

  if (hasOfficialResult || knockout || Date.now() < provisionalOpenAt.getTime()) {
    return { ok: false, error: "locked" };
  }

  const hasBothScores = homeScore !== null && awayScore !== null;
  let storedWinnerTeamId: string | null = null;

  if (hasBothScores && knockout) {
    if (homeScore > awayScore) storedWinnerTeamId = match.home_team_id;
    else if (homeScore < awayScore) storedWinnerTeamId = match.away_team_id;
    else if (winnerTeamId === match.home_team_id || winnerTeamId === match.away_team_id) storedWinnerTeamId = winnerTeamId;
  }

  const { error } = await supabaseAdmin
    .from("matches")
    .update({
      provisional_home_score: homeScore,
      provisional_away_score: awayScore,
      provisional_winner_team_id: knockout ? storedWinnerTeamId : null,
      provisional_submitted_by_name: user.username,
      provisional_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", matchId);

  if (error) {
    return { ok: false, error: "save_failed" };
  }

  return { ok: true, winnerTeamId: storedWinnerTeamId };
}

export async function updateKnockoutTeamsAction(formData: FormData) {
  await requireAdmin();

  const matchId = String(formData.get("matchId") ?? "");
  const homeTeamId = String(formData.get("homeTeamId") ?? "") || null;
  const awayTeamId = String(formData.get("awayTeamId") ?? "") || null;

  if (!matchId) redirect("/admin?error=missing_match");

  await supabaseAdmin
    .from("matches")
    .update({
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      home_placeholder: homeTeamId ? null : undefined,
      away_placeholder: awayTeamId ? null : undefined,
      is_open_for_predictions: Boolean(homeTeamId && awayTeamId),
      updated_at: new Date().toISOString(),
    })
    .eq("id", matchId);

  revalidatePath("/admin");
  revalidatePath("/matches");
  redirect("/admin?saved=1");
}

const ROUND_OF_32_PLACEHOLDERS: Record<number, { home: string; away: string }> = {
  73: { home: "Zweiter Gruppe A", away: "Zweiter Gruppe B" },
  74: { home: "Erster Gruppe E", away: "Dritter Gruppe A/B/C/D/F" },
  75: { home: "Erster Gruppe F", away: "Zweiter Gruppe C" },
  76: { home: "Erster Gruppe C", away: "Zweiter Gruppe F" },
  77: { home: "Erster Gruppe I", away: "Dritter Gruppe C/D/F/G/H" },
  78: { home: "Zweiter Gruppe E", away: "Zweiter Gruppe I" },
  79: { home: "Erster Gruppe A", away: "Dritter Gruppe C/E/F/H/I" },
  80: { home: "Erster Gruppe L", away: "Dritter Gruppe E/H/I/J/K" },
  81: { home: "Erster Gruppe D", away: "Dritter Gruppe B/E/F/I/J" },
  82: { home: "Erster Gruppe G", away: "Dritter Gruppe A/E/H/I/J" },
  83: { home: "Zweiter Gruppe K", away: "Zweiter Gruppe L" },
  84: { home: "Erster Gruppe H", away: "Zweiter Gruppe J" },
  85: { home: "Erster Gruppe B", away: "Dritter Gruppe E/F/G/I/J" },
  86: { home: "Erster Gruppe J", away: "Zweiter Gruppe H" },
  87: { home: "Erster Gruppe K", away: "Dritter Gruppe D/E/I/J/L" },
  88: { home: "Zweiter Gruppe D", away: "Zweiter Gruppe G" },
};

function getRoundOf32Placeholder(matchNumber: number, side: "home" | "away") {
  const placeholders = ROUND_OF_32_PLACEHOLDERS[matchNumber];
  return placeholders ? placeholders[side] : "Offen";
}

export async function saveKnockoutTeamsInlineAction(input: {
  matchId: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
}): Promise<
  | {
      ok: true;
      openForPredictions: boolean;
      homeTeamId: string | null;
      awayTeamId: string | null;
      homePlaceholder: string | null;
      awayPlaceholder: string | null;
    }
  | { ok: false; error: string }
> {
  await requireAdmin();

  const { matchId, homeTeamId, awayTeamId } = input;

  if (!matchId) {
    return { ok: false, error: "missing_match" };
  }

  const { data: match } = await supabaseAdmin
    .from("matches")
    .select("id, stage, match_number, home_placeholder, away_placeholder")
    .eq("id", matchId)
    .single();

  if (!match) {
    return { ok: false, error: "match_not_found" };
  }

  if (match.stage !== "round_of_32") {
    return { ok: false, error: "manual_teams_only_for_round_of_32" };
  }

  const openForPredictions = Boolean(homeTeamId && awayTeamId);
  const homePlaceholder = homeTeamId
    ? null
    : getRoundOf32Placeholder(match.match_number, "home");
  const awayPlaceholder = awayTeamId
    ? null
    : getRoundOf32Placeholder(match.match_number, "away");

  const { error } = await supabaseAdmin
    .from("matches")
    .update({
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      home_placeholder: homePlaceholder,
      away_placeholder: awayPlaceholder,
      is_open_for_predictions: openForPredictions,
      updated_at: new Date().toISOString(),
    })
    .eq("id", matchId);

  if (error) {
    return { ok: false, error: "team_save_failed" };
  }

  return {
    ok: true,
    openForPredictions,
    homeTeamId,
    awayTeamId,
    homePlaceholder,
    awayPlaceholder,
  };
}

export async function createProfileAction(formData: FormData) {
  await requireAdmin();

  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const isAdmin = formData.get("isAdmin") === "on";

  if (!username || !password) {
    redirect("/players?error=missing_user_data");
  }

  if (username.length < 2 || password.length < 2) {
    redirect("/players?error=user_data_too_short");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await supabaseAdmin.from("profiles").upsert(
    {
      username,
      password_hash: passwordHash,
      is_admin: isAdmin,
      can_submit_results: false,
    },
    { onConflict: "username" },
  );

  revalidatePath("/players");
  revalidatePath("/results");
  revalidatePath("/ranking");
  redirect("/players?user_saved=1");
}

export async function deleteProfileAction(formData: FormData) {
  const admin = await requireAdmin();
  const profileId = String(formData.get("profileId") ?? "");

  if (!profileId) {
    redirect("/players?error=missing_profile");
  }

  if (profileId === admin.id) {
    redirect("/players?error=cannot_delete_self");
  }

  await supabaseAdmin.from("profiles").delete().eq("id", profileId);

  revalidatePath("/players");
  revalidatePath("/results");
  revalidatePath("/ranking");
  redirect("/players?user_deleted=1");
}


export async function toggleResultSubmitterAction(formData: FormData) {
  await requireAdmin();

  const profileId = String(formData.get("profileId") ?? "");
  const canSubmitResults = formData.get("canSubmitResults") === "on";

  if (!profileId) {
    redirect("/players?error=missing_profile");
  }

  await supabaseAdmin
    .from("profiles")
    .update({ can_submit_results: canSubmitResults })
    .eq("id", profileId);

  revalidatePath("/players");
  revalidatePath("/admin");
  redirect("/players?result_permission_saved=1");
}

export async function createGroupAction(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();

  if (!name) {
    redirect("/groups?error=missing_group_name");
  }

  const { data: group, error } = await supabaseAdmin
    .from("player_groups")
    .insert({ name })
    .select("id")
    .single();

  if (error || !group) {
    redirect("/groups?error=group_create_failed");
  }

  revalidatePath("/groups");
  redirect(`/groups?groupId=${group.id}`);
}

export async function updateGroupMembersAction(formData: FormData) {
  await requireAdmin();

  const groupId = String(formData.get("groupId") ?? "");
  const memberIds = formData.getAll("memberIds").map((value) => String(value));

  if (!groupId) {
    redirect("/groups?error=missing_group");
  }

  await supabaseAdmin.from("group_members").delete().eq("group_id", groupId);

  if (memberIds.length > 0) {
    await supabaseAdmin.from("group_members").insert(
      memberIds.map((profileId) => ({
        group_id: groupId,
        profile_id: profileId,
      })),
    );
  }

  revalidatePath("/groups");
  revalidatePath("/ranking");
  revalidatePath("/results");
  revalidatePath("/matches");
  redirect(`/groups?groupId=${groupId}&saved=1`);
}

export async function deleteGroupAction(formData: FormData) {
  await requireAdmin();
  const groupId = String(formData.get("groupId") ?? "");

  if (!groupId) {
    redirect("/groups?error=missing_group");
  }

  await supabaseAdmin.from("player_groups").delete().eq("id", groupId);

  revalidatePath("/groups");
  revalidatePath("/ranking");
  revalidatePath("/results");
  revalidatePath("/matches");
  redirect("/groups?deleted=1");
}

export async function overridePredictionAction(formData: FormData) {
  await requireAdmin();

  const userId = String(formData.get("userId") ?? "");
  const matchId = String(formData.get("matchId") ?? "");
  const matchNumber = String(formData.get("matchNumber") ?? "");
  const predictedHomeScore = readNumber(formData.get("predictedHomeScore"));
  const predictedAwayScore = readNumber(formData.get("predictedAwayScore"));
  const advanceTeamIdRaw = String(formData.get("advanceTeamId") ?? "");
  const advanceTeamId = advanceTeamIdRaw.length > 0 ? advanceTeamIdRaw : null;

  if (
    !userId ||
    !matchId ||
    predictedHomeScore === null ||
    predictedAwayScore === null
  ) {
    redirect("/changes?error=invalid_prediction");
  }

  const { data: match } = await supabaseAdmin
    .from("matches")
    .select("id, match_number, stage, home_team_id, away_team_id")
    .eq("id", matchId)
    .single();

  if (!match) {
    redirect("/changes?error=match_not_found");
  }

  if (
    isKnockoutStage(match.stage) &&
    predictedHomeScore === predictedAwayScore
  ) {
    const validAdvanceTeam =
      advanceTeamId === match.home_team_id ||
      advanceTeamId === match.away_team_id;
    if (!validAdvanceTeam) {
      redirect(
        `/changes?profileId=${userId}&matchNumber=${matchNumber}&error=missing_advance_team`,
      );
    }
  }

  await supabaseAdmin.from("predictions").upsert(
    {
      user_id: userId,
      match_id: matchId,
      predicted_home_score: predictedHomeScore,
      predicted_away_score: predictedAwayScore,
      advance_team_id: advanceTeamId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,match_id" },
  );

  revalidatePath("/changes");
  revalidatePath("/matches");
  revalidatePath("/results");
  revalidatePath("/ranking");
  redirect(`/changes?profileId=${userId}&matchNumber=${matchNumber}&saved=1`);
}

export async function saveOptimizerOddsInlineAction(input: {
  matchId: string;
  oddsText: string;
  probabilitiesText?: string;
  maxGoals?: number;
  sourceBlendWeight?: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();

  if (!input.matchId) {
    return { ok: false, error: 'missing_match' };
  }

  const { error } = await supabaseAdmin.from('tip_optimizer_inputs').upsert(
    {
      match_id: input.matchId,
      odds_text: input.oddsText,
      probabilities_text: input.probabilitiesText ?? '',
      max_goals: input.maxGoals ?? 7,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'match_id' },
  );

  if (error) {
    return { ok: false, error: 'optimizer_save_failed' };
  }

  const sourceBlendWeight = input.sourceBlendWeight ?? 0.5;
  const { error: settingsError } = await supabaseAdmin.from('tip_optimizer_settings').upsert(
    {
      id: 1,
      source_blend_weight: Math.max(0, Math.min(1, sourceBlendWeight)),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );

  if (settingsError) {
    return { ok: false, error: 'optimizer_settings_save_failed' };
  }

  return { ok: true };
}
