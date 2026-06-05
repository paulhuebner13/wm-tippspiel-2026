import { createProfileAction } from '@/app/actions';
import { Nav } from '@/components/Nav';
import { DeleteProfileForm } from '@/components/DeleteProfileForm';
import { requireAdmin } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { Profile } from '@/lib/types';

export default async function PlayersPage() {
  const user = await requireAdmin();

  const { data: profilesData } = await supabaseAdmin
    .from('profiles')
    .select('id, username, is_admin')
    .order('username', { ascending: true });

  const profiles = (profilesData ?? []) as Profile[];

  return (
    <>
      <Nav user={user} />
      <main className="page">
        <h1>Spieler</h1>

        <section className="card userAdminCard adminSectionCard">
          <h2>Spieler verwalten</h2>
          <p className="subtle smallSubtle">Neue Spieler erstellen, Passwörter überschreiben oder Spieler löschen.</p>

          <form action={createProfileAction} className="userCreateForm">
            <label>
              Name
              <input name="username" placeholder="z. B. Lukas" autoComplete="off" required />
            </label>
            <label>
              Passwort
              <input name="password" type="text" placeholder="z. B. CR7" autoComplete="off" required />
            </label>
            <label className="checkboxLabel">
              <input name="isAdmin" type="checkbox" />
              Admin-Rechte geben
            </label>
            <button type="submit">Spieler speichern</button>
          </form>

          <div className="userList">
            {profiles.map((profile) => (
              <div className="userRow" key={profile.id}>
                <div>
                  <strong>{profile.username}</strong>
                  <span>{profile.is_admin ? 'Admin' : 'Spieler'}</span>
                </div>
                {profile.id !== user.id ? (
                  <DeleteProfileForm profileId={profile.id} username={profile.username} />
                ) : (
                  <span className="selfBadge">Du</span>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
