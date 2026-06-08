export const LOCK_MINUTES_BEFORE_KICKOFF = 0;
export const MATCH_RELEVANT_HOURS_AFTER_KICKOFF = 3;

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

export function formatKickoff(kickoffTime: string): string {
  return new Intl.DateTimeFormat('de-AT', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(kickoffTime));
}
