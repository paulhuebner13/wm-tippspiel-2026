'use client';

import { useEffect, useState } from 'react';
import {
  DEFAULT_DISPLAY_TIME_ZONE,
  formatDateTime,
  formatKickoff,
} from '@/lib/time';

type LocalDateTimeProps = {
  value: string;
  variant?: 'kickoff' | 'dateTime';
  className?: string;
};

function formatValue(value: string, variant: LocalDateTimeProps['variant'], timeZone: string) {
  return variant === 'dateTime'
    ? formatDateTime(value, timeZone)
    : formatKickoff(value, timeZone);
}

export function LocalDateTime({
  value,
  variant = 'kickoff',
  className,
}: LocalDateTimeProps) {
  const [text, setText] = useState(() =>
    formatValue(value, variant, DEFAULT_DISPLAY_TIME_ZONE),
  );

  useEffect(() => {
    const updateTimeZone = () => {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setText(formatValue(value, variant, timeZone || DEFAULT_DISPLAY_TIME_ZONE));
    };

    updateTimeZone();
    window.addEventListener('focus', updateTimeZone);
    return () => window.removeEventListener('focus', updateTimeZone);
  }, [value, variant]);

  return (
    <time className={className} dateTime={value} suppressHydrationWarning>
      {text}
    </time>
  );
}
