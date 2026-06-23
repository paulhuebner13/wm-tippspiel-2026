'use client';

import { useEffect } from 'react';

export function ChangesAutoScroll() {
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const element = document.querySelector<HTMLElement>('[data-change-scroll-target="true"]');
      if (!element) return;

      const topbar = document.querySelector<HTMLElement>('.topbar');
      const topbarHeight = topbar ? topbar.getBoundingClientRect().height : 0;
      const extraGap = 18;
      const targetTop = element.getBoundingClientRect().top + window.scrollY - topbarHeight - extraGap;

      window.scrollTo({
        top: Math.max(targetTop, 0),
        behavior: 'smooth',
      });
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, []);

  return null;
}
