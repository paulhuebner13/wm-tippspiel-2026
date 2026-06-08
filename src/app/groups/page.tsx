import Link from 'next/link';
import { createGroupAction, updateGroupMembersAction } from '@/app/actions';
import { DeleteGroupForm } from '@/components/DeleteGroupForm';
import { Nav } from '@/components/Nav';
import { requireAdmin } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { GroupMember, PlayerGroup, Profile } from '@/lib/types';

type GroupsPageProps = {
  searchParams?: Promise<{ groupId?: string }>;
};

export default async function GroupsPage({ searchParams }: GroupsPageProps) {
  const user = await requireAdmin();
  const params = await searchParams;

  const { data: groupsData } = await supabaseAdmin
    .from('player_groups')
    .select('*')
    .order('name', { ascending: true });

  const { data: profilesData } = await supabaseAdmin
    .from('profiles')
    .select('id, username, is_admin')
    .order('username', { ascending: true });

  const groups = (groupsData ?? []) as PlayerGroup[];
  const profiles = (profilesData ?? []) as Profile[];
  const selectedGroupId = params?.groupId ?? groups[0]?.id ?? '';
  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? null;

  const { data: memberData } = selectedGroup
    ? await supabaseAdmin.from('group_members').select('group_id, profile_id').eq('group_id', selectedGroup.id)
    : { data: [] };

  const members = (memberData ?? []) as GroupMember[];
  const memberIds = new Set(members.map((member) => member.profile_id));

  return (
    <>
      <Nav user={user} />
      <main className="page">
        <h1>Gruppen</h1>

        <section className="card groupsCreateCard">
          <h2>Neue Gruppe erstellen</h2>
          <form action={createGroupAction} className="groupsCreateForm">
            <label>
              Gruppenname
              <input name="name" placeholder="z. B. Familie, Arbeit, Freunde" required />
            </label>
            <button type="submit">Gruppe erstellen</button>
          </form>
        </section>

        <section className="groupsLayout">
          <aside className="card groupListCard">
            <h2>Bestehende Gruppen</h2>
            {groups.length === 0 && <p className="subtle">Noch keine Gruppen erstellt.</p>}
            <div className="groupLinkList">
              {groups.map((group) => (
                <Link key={group.id} href={`/groups?groupId=${group.id}`} className={group.id === selectedGroupId ? 'groupLink active' : 'groupLink'}>
                  {group.name}
                </Link>
              ))}
            </div>
          </aside>

          <section className="card groupMembersCard">
            {selectedGroup ? (
              <>
                <div className="groupMembersHeader">
                  <div>
                    <h2>{selectedGroup.name}</h2>
                    <p className="subtle smallSubtle">Alle ausgewählten Spieler sehen sich gegenseitig in Ranking, Ergebnissen und Tipps, sobald diese sichtbar sind.</p>
                  </div>
                  <DeleteGroupForm groupId={selectedGroup.id} groupName={selectedGroup.name} />
                </div>

                <form key={selectedGroup.id} action={updateGroupMembersAction} className="groupMembersForm">
                  <input type="hidden" name="groupId" value={selectedGroup.id} />
                  <div key={`members-${selectedGroup.id}`} className="memberCheckboxGrid">
                    {profiles.map((profile) => (
                      <label key={`${selectedGroup.id}-${profile.id}`} className="memberCheckbox">
                        <input name="memberIds" type="checkbox" value={profile.id} defaultChecked={memberIds.has(profile.id)} />
                        <span>{profile.username}</span>
                        {profile.is_admin && <small>Admin</small>}
                      </label>
                    ))}
                  </div>
                  <button type="submit">Mitglieder speichern</button>
                </form>
              </>
            ) : (
              <p className="subtle">Erstelle zuerst eine Gruppe.</p>
            )}
          </section>
        </section>
      </main>
    </>
  );
}
