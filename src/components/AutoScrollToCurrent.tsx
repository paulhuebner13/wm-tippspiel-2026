'use client';

import { useEffect } from 'react';

export function AutoScrollToCurrent() {
  useEffect(() => {
    const element = document.querySelector('[data-current-match="true"]');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  return null;
}
