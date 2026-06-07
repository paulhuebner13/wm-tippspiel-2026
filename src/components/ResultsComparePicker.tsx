'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { Profile } from '@/lib/types';

export function ResultsComparePicker({ profiles, selectedCompareUserId }: { profiles: Profile[]; selectedCompareUserId: string | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function toggleProfile(profileId: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (selectedCompareUserId === profileId) {
      params.delete('compareUserId');
    } else {
      params.set('compareUserId', profileId);
    }

    const query = params.toString();
    router.replace(query ? `/results?${query}` : '/results', { scroll: false });
  }

  if (profiles.length === 0) {
    return null;
  }

  return (
    <div className="resultCompareSticky">
      <div className="resultCompareScroller" aria-label="Spieler vergleichen">
        {profiles.map((profile) => {
          const selected = selectedCompareUserId === profile.id;
          return (
            <button
              key={profile.id}
              type="button"
              className={`resultCompareChip ${selected ? 'resultCompareChipActive' : ''}`}
              onClick={() => toggleProfile(profile.id)}
            >
              {profile.username}
            </button>
          );
        })}
      </div>
    </div>
  );
}
