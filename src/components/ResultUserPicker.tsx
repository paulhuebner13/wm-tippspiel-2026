'use client';

import { useRouter } from 'next/navigation';
import type { Profile } from '@/lib/types';

export function ResultUserPicker({ profiles, selectedUserId, ownUserId }: { profiles: Profile[]; selectedUserId: string; ownUserId: string }) {
  const router = useRouter();

  return (
    <div className="resultUserPicker">
      <label htmlFor="userId">Spieler auswählen</label>
      <select
        id="userId"
        name="userId"
        value={selectedUserId}
        onChange={(event) => {
          router.push(`/results?userId=${event.target.value}`);
        }}
      >
        {profiles.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.id === ownUserId ? `${profile.username} (du)` : profile.username}
          </option>
        ))}
      </select>
    </div>
  );
}
