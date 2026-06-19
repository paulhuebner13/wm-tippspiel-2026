export const LOCK_MINUTES_BEFORE_KICKOFF = 0;
export const MATCH_RELEVANT_HOURS_AFTER_KICKOFF = 3;
export const DEFAULT_DISPLAY_TIME_ZONE = 'Europe/Vienna';

export function getLockTime(kickoffTime: string): Date {
  const kickoff = new Date(kickoffTime);
  return new Date(kickoff.getTime() - LOCK_MINUTES_BEFORE_KICKOFF * 60 * 1000);
}

export function isPredictionLocked(kickoffTime: string, now = new Date()): boolean {
  return now >= getLockTime(kickoffTime);
}

export function isMatchStillRelevant(kickoffTime: string, now = new Date()): boolean {
  const kickoff = new Date(kickoffTime);
  const relevantUntil = new Date(kickoff.getTime() + MATCH_RELEVANT_HOURS_AFTER_KICKOFF * 60 * 60 * 1000);
  return relevantUntil > now;
}

export function formatKickoff(
  kickoffTime: string,
  timeZone = DEFAULT_DISPLAY_TIME_ZONE,
): string {
  return new Intl.DateTimeFormat('de-AT', {
    timeZone,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(kickoffTime));
}

export function formatDateTime(
  value: string,
  timeZone = DEFAULT_DISPLAY_TIME_ZONE,
): string {
  const date = new Date(value);
  const datePart = new Intl.DateTimeFormat('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone,
  }).format(date);
  const timePart = new Intl.DateTimeFormat('de-AT', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(date);

  return `${datePart} um ${timePart}`;
}
