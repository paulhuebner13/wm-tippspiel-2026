'use client';

import { useEffect } from 'react';
import type { Stage } from '@/lib/types';

export function BracketAutoScroll({ currentStage }: { currentStage: Stage | 'group' }) {
  useEffect(() => {
    const scroller = document.querySelector<HTMLElement>('[data-bracket-scroll]');
    if (!scroller) return;

    if (currentStage === 'group') {
      scroller.scrollTo({ left: 0, behavior: 'smooth' });
      return;
    }

    const target = scroller.querySelector<HTMLElement>(`[data-bracket-stage="${currentStage}"]`);
    if (!target) return;

    const left = Math.max(0, target.offsetLeft - 18);
    scroller.scrollTo({ left, behavior: 'smooth' });
  }, [currentStage]);

  return null;
}
