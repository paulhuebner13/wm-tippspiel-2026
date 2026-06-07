'use client';

import { useEffect } from 'react';

export function ResultsAutoScroll({ targetMatchNumber }: { targetMatchNumber: number | null }) {
  useEffect(() => {
    if (!targetMatchNumber) return;

    const timeout = window.setTimeout(() => {
      const element = document.querySelector(`[data-result-scroll-target="${targetMatchNumber}"]`);
      element?.scrollIntoView({ block: 'end', behavior: 'smooth' });
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [targetMatchNumber]);

  return null;
}
