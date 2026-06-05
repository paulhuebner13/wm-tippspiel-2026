import { supabaseAdmin } from './supabaseAdmin';
import type { Profile } from './types';

export async function getVisibleProfilesForUser(user: Profile): Promise<Profile[]> {
  const { data: profilesData } = await supabaseAdmin
    .from('profiles')
    .select('id, username, is_admin')
    .order('username', { ascending: true });

  const profiles = (profilesData ?? []) as Profile[];

  if (user.is_admin) {
    return profiles;
  }

  const { data: membershipsData } = await supabaseAdmin
    .from('group_members')
    .select('group_id')
    .eq('profile_id', user.id);

  const groupIds = (membershipsData ?? []).map((membership: { group_id: string }) => membership.group_id);

  if (groupIds.length === 0) {
    return profiles.filter((profile) => profile.id === user.id);
  }

  const { data: visibleMembershipsData } = await supabaseAdmin
    .from('group_members')
    .select('profile_id')
    .in('group_id', groupIds);

  const visibleProfileIds = new Set<string>([user.id]);
  for (const membership of visibleMembershipsData ?? []) {
    visibleProfileIds.add((membership as { profile_id: string }).profile_id);
  }

  return profiles.filter((profile) => visibleProfileIds.has(profile.id));
}

export function getVisibleProfileIdSet(profiles: Profile[]): Set<string> {
  return new Set(profiles.map((profile) => profile.id));
}
