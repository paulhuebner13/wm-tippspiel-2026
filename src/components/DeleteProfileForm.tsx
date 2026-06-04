'use client';

import { deleteProfileAction } from '@/app/actions';

export function DeleteProfileForm({ profileId, username }: { profileId: string; username: string }) {
  return (
    <form
      action={deleteProfileAction}
      onSubmit={(event) => {
        const confirmed = window.confirm(`Willst du ${username} wirklich löschen? Alle Tipps dieses Spielers werden damit ebenfalls gelöscht.`);
        if (!confirmed) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="profileId" value={profileId} />
      <button className="dangerButton" type="submit">Löschen</button>
    </form>
  );
}
