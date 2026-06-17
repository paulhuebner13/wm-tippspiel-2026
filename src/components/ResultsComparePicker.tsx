'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Profile } from '@/lib/types';

export function ResultsComparePicker({ profiles, selectedCompareUserIds }: { profiles: Profile[]; selectedCompareUserIds: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (selectedCompareUserIds.length === 0) return;

    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (navigation?.type === 'reload') {
      router.replace('/results', { scroll: false });
    }
  }, [router, selectedCompareUserIds.length]);

  function toggleProfile(profileId: string) {
    const params = new URLSearchParams(searchParams.toString());
    const nextSelectedIds = new Set(selectedCompareUserIds);

    if (nextSelectedIds.has(profileId)) {
      nextSelectedIds.delete(profileId);
    } else {
      nextSelectedIds.add(profileId);
    }

    params.delete('compareUserId');
    if (nextSelectedIds.size > 0) {
      params.set('compareUserIds', Array.from(nextSelectedIds).join(','));
    } else {
      params.delete('compareUserIds');
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
          const selected = selectedCompareUserIds.includes(profile.id);
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
