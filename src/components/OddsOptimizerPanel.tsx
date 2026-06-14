'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { saveOptimizerOddsInlineAction } from '@/app/actions';
import { runTipOptimizer } from '@/lib/optimizer';
import type { Match } from '@/lib/types';
import { Flag } from '@/components/Flag';

type OptimizerMatch = Match & {
  home_team?: { id: string; name: string; flag_path: string; short_name: string; group_name: string | null } | null;
  away_team?: { id: string; name: string; flag_path: string; short_name: string; group_name: string | null } | null;
};

type Props = {
  match: OptimizerMatch;
  initialOddsText: string;
  homeRating: number | null;
  awayRating: number | null;
};

function formatNumber(value: number, digits = 3) {
  return value.toFixed(digits);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)} %`;
}

function TipTable({ rows, compact = false }: { rows: ReturnType<typeof runTipOptimizer>['rows']; compact?: boolean }) {
  if (rows.length === 0) return null;

  return (
    <div className="optimizerTableWrap">
      <table className="optimizerTable">
        <thead>
          <tr>
            <th>Tipp</th>
            <th>Erw. Punkte</th>
            {!compact && <th>Exakt</th>}
            {!compact && <th>Differenz</th>}
            {!compact && <th>Ausgang</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.label} className={index === 0 ? 'optimizerBestRow' : undefined}>
              <td>{row.label}</td>
              <td>{formatNumber(row.expectedPoints)}</td>
              {!compact && <td>{formatPercent(row.exactProbability)}</td>}
              {!compact && <td>{formatPercent(row.diffProbability)}</td>}
              {!compact && <td>{formatPercent(row.totalOutcomeProbability)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OddsOptimizerPanel({ match, initialOddsText, homeRating, awayRating }: Props) {
  const [oddsText, setOddsText] = useState(initialOddsText);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [, startTransition] = useTransition();

  const result = useMemo(() => {
    return runTipOptimizer({
      oddsText,
      match,
      homeRating,
      awayRating,
      maxGoals: 7,
      rankingWeight: 0.15,
    });
  }, [awayRating, homeRating, match, oddsText]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSaveState('saving');
      startTransition(async () => {
        const response = await saveOptimizerOddsInlineAction({
          matchId: match.id,
          oddsText,
          maxGoals: 7,
          rankingWeight: 0.15,
        });
        setSaveState(response.ok ? 'saved' : 'error');
      });
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [match.id, oddsText, startTransition]);

  const canOptimize = Boolean(match.home_team && match.away_team);
  const statusText = saveState === 'saving' ? 'speichert ...' : saveState === 'saved' ? 'gespeichert' : saveState === 'error' ? 'konnte nicht gespeichert werden' : 'bereit';

  return (
    <div className="optimizerGrid">
      <section className="card optimizerInputCard adminSoftCard">
        <div className="optimizerMatchHeader">
          <div className="optimizerTeamSide">
            {match.home_team ? <Flag team={match.home_team} /> : <span className="placeholderFlag" />}
            <strong>{match.home_team?.name ?? match.home_placeholder ?? 'Offen'}</strong>
          </div>
          <div className="optimizerVersus">vs.</div>
          <div className="optimizerTeamSide">
            {match.away_team ? <Flag team={match.away_team} /> : <span className="placeholderFlag" />}
            <strong>{match.away_team?.name ?? match.away_placeholder ?? 'Offen'}</strong>
          </div>
        </div>

        <div className="optimizerMetaLine">
          <span>Spiel {match.match_number}</span>
          <span>{match.stage}</span>
          <span>FIFA: {homeRating?.toFixed(0) ?? '-'} : {awayRating?.toFixed(0) ?? '-'}</span>
          <span>{statusText}</span>
        </div>

        {!canOptimize && (
          <p className="optimizerWarning">Für die Berechnung müssen beide Teams feststehen.</p>
        )}

        <label className="fieldLabel" htmlFor="oddsText">Quoten als Text</label>
        <textarea
          id="oddsText"
          className="optimizerTextarea"
          value={oddsText}
          onChange={(event) => setOddsText(event.target.value)}
          placeholder={'1:0 7.00\n2:0 9.25\n2:1 8.50'}
        />
        <p className="subtle smallText">Format pro Zeile: Ergebnis und Quote, z. B. 2:1 8.50. Die Quoten werden automatisch für dieses Spiel gespeichert.</p>
      </section>

      <section className="card optimizerOutputCard">
        <h2>Beste Tipps</h2>
        {result.errors.length > 0 && <div className="errorBox">{result.errors.join('\n')}</div>}
        {canOptimize && result.bestThree.length > 0 ? (
          <>
            <div className="optimizerTopTips">
              {result.bestThree.map((row, index) => (
                <div className="optimizerTipCard" key={row.label}>
                  <span className="optimizerTipRank">#{index + 1}</span>
                  <strong>{row.label}</strong>
                  <span>{formatNumber(row.expectedPoints)} EP</span>
                </div>
              ))}
            </div>

            <h3>Andere Tordifferenzen</h3>
            <div className="optimizerAltTips">
              {result.alternativeDiffs.map((row) => (
                <div className="optimizerAltTip" key={row.label}>
                  <strong>{row.label}</strong>
                  <span>{formatNumber(row.expectedPoints)} EP</span>
                </div>
              ))}
            </div>

            <div className="optimizerSummary">
              <span>Quoten/FIFA-Gewichtung: 85 % / 15 %</span>
              <span>Multiplikator: ×{result.summary.stageMultiplier}</span>
              <span>geschätzte Ergebnisse: {result.summary.estimatedCount}</span>
            </div>

            <h3>Alle Tipps</h3>
            <TipTable rows={result.rows.slice(0, 25)} />
          </>
        ) : (
          <p className="subtle">Füge Quoten ein, um die erwarteten Punkte zu berechnen.</p>
        )}
      </section>
    </div>
  );
}
