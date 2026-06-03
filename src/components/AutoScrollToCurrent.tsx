'use client';

import { useEffect } from 'react';

export function AutoScrollToCurrent() {
  useEffect(() => {
    const scrollToCurrentMatch = () => {
      const element = document.querySelector('[data-current-match="true"]') as HTMLElement | null;
      if (!element) {
        return;
      }

      const topbar = document.querySelector('.topbar') as HTMLElement | null;
      const topbarHeight = topbar ? topbar.getBoundingClientRect().height : 0;
      const extraGap = 18;
      const targetTop = element.getBoundingClientRect().top + window.scrollY - topbarHeight - extraGap;

      window.scrollTo({
        top: Math.max(targetTop, 0),
        behavior: 'smooth',
      });
    };

    const timeoutId = window.setTimeout(scrollToCurrentMatch, 150);
    return () => window.clearTimeout(timeoutId);
  }, []);

  return null;
}
