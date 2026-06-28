'use client';

import { useEffect } from 'react';
import type { Stage } from '@/lib/types';

export function BracketAutoScroll({
  currentStage,
  targetMatchNumber,
}: {
  currentStage: Stage | 'group';
  targetMatchNumber?: number | null;
}) {
  useEffect(() => {
    const scroller = document.querySelector<HTMLElement>('[data-bracket-scroll]');
    if (!scroller) return;

    const scrollToElement = (target: HTMLElement) => {
      const scrollerRect = scroller.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const left = Math.max(
        0,
        scroller.scrollLeft + targetRect.left - scrollerRect.left - 18,
      );
      scroller.scrollTo({ left, behavior: 'smooth' });
    };

    if (targetMatchNumber) {
      const targetMatch = scroller.querySelector<HTMLElement>(
        `[data-bracket-match-number="${targetMatchNumber}"]`,
      );
      if (targetMatch) {
        scrollToElement(targetMatch);
        return;
      }
    }

    if (currentStage === 'group') {
      scroller.scrollTo({ left: 0, behavior: 'smooth' });
      return;
    }

    const targetStage = scroller.querySelector<HTMLElement>(`[data-bracket-stage="${currentStage}"]`);
    if (targetStage) scrollToElement(targetStage);
  }, [currentStage, targetMatchNumber]);

  return null;
}
