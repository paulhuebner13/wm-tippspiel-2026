'use client';

import { deleteGroupAction } from '@/app/actions';

export function DeleteGroupForm({ groupId, groupName }: { groupId: string; groupName: string }) {
  return (
    <form
      action={deleteGroupAction}
      onSubmit={(event) => {
        const confirmed = window.confirm(`Willst du die Gruppe „${groupName}“ wirklich löschen? Die Spieler und Tipps bleiben erhalten.`);
        if (!confirmed) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="groupId" value={groupId} />
      <button className="dangerButton" type="submit">Gruppe löschen</button>
    </form>
  );
}
