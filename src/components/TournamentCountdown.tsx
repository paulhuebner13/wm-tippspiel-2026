'use client';

import { useEffect, useMemo, useState } from 'react';
import { Flag } from '@/components/Flag';
import type { Match } from '@/lib/types';

function getTeamName(match: Match, side: 'home' | 'away') {
  if (side === 'home') return match.home_team?.name ?? match.home_placeholder ?? 'Offen';
  return match.away_team?.name ?? match.away_placeholder ?? 'Offen';
}

function formatCountdown(targetTime: string, now: Date) {
  const target = new Date(targetTime).getTime();
  const diff = Math.max(0, target - now.getTime());

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { days, hours, minutes, seconds, isStarted: diff <= 0 };
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function pickCountdownMatch(openingMatch: Match, austriaMatches: Match[], finalMatch: Match, now: Date) {
  const openingKickoff = new Date(openingMatch.kickoff_time);

  if (now < openingKickoff) {
    return openingMatch;
  }

  const nextAustriaMatch = austriaMatches.find((match) => new Date(match.kickoff_time) > now);

  return nextAustriaMatch ?? finalMatch;
}

export function TournamentCountdown({
  openingMatch,
  austriaMatches,
  finalMatch,
}: {
  openingMatch: Match;
  austriaMatches: Match[];
  finalMatch: Match;
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const selectedMatch = useMemo(
    () => pickCountdownMatch(openingMatch, austriaMatches, finalMatch, now),
    [openingMatch, austriaMatches, finalMatch, now],
  );

  const countdown = formatCountdown(selectedMatch.kickoff_time, now);

  return (
    <section className="countdownHero">
      <div className="countdownMatchLine">
        <div className="countdownTeam countdownHomeTeam">
          <Flag team={selectedMatch.home_team} />
          <span>{getTeamName(selectedMatch, 'home')}</span>
        </div>

        <div className="countdownVersus">vs</div>

        <div className="countdownTeam countdownAwayTeam">
          <Flag team={selectedMatch.away_team} />
          <span>{getTeamName(selectedMatch, 'away')}</span>
        </div>
      </div>

      <div className="countdownClock" aria-label="Countdown bis zum Anpfiff">
        <div>
          <strong>{countdown.days}</strong>
          <span>Tage</span>
        </div>
        <div>
          <strong>{pad(countdown.hours)}</strong>
          <span>Std.</span>
        </div>
        <div>
          <strong>{pad(countdown.minutes)}</strong>
          <span>Min.</span>
        </div>
        <div>
          <strong>{pad(countdown.seconds)}</strong>
          <span>Sek.</span>
        </div>
      </div>
    </section>
  );
}
