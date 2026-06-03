'use client';

import { useEffect, useMemo, useState } from 'react';
import { getLockTime } from '@/lib/time';

function formatRemaining(milliseconds: number): string {
  if (milliseconds <= 0) return 'Tipp gesperrt';

  const seconds = Math.floor(milliseconds / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (days >= 1) return `Noch ${days} Tag${days === 1 ? '' : 'e'}`;
  if (hours >= 1) return `Noch ${hours} Std. ${minutes} Min.`;
  if (minutes >= 1) return `Noch ${minutes} Min. ${secs} Sek.`;
  return `Noch ${secs} Sek.`;
}

export function Countdown({ kickoffTime }: { kickoffTime: string }) {
  const lockTime = useMemo(() => getLockTime(kickoffTime), [kickoffTime]);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const remaining = lockTime.getTime() - now.getTime();
  const locked = remaining <= 0;

  return <span className={locked ? 'badge locked' : 'badge'}>{formatRemaining(remaining)}</span>;
}
