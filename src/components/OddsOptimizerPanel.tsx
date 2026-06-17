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
  initialProbabilitiesText: string;
  homeRating: number | null;
  awayRating: number | null;
  initialMaxGoals: number;
  initialSourceBlendWeight: number;
};

function formatNumber(value: number, digits = 3) {
  return value.toFixed(digits);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)} %`;
}

function formatWeight(value: number) {
  return Math.round(value * 100);
}

function DrawFlag() {
  return <span className="drawFlagMini">Draw</span>;
}

function formatSignedDiff(value: number) {
  if (value > 0) return `+${value}`;
  return String(value);
}

function getProbabilityInsights(possibleResults: ReturnType<typeof runTipOptimizer>['possibleResults']) {
  const outcomeProbabilities = possibleResults.reduce(
    (totals, result) => {
      if (result.home > result.away) totals.home += result.probability;
      else if (result.home < result.away) totals.away += result.probability;
      else totals.draw += result.probability;
      return totals;
    },
    { home: 0, draw: 0, away: 0 },
  );

  const topScores = [...possibleResults]
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 7)
    .map((result) => ({ label: result.label, probability: result.probability }));

  const diffMap = new Map<number, number>();
  for (const result of possibleResults) {
    const diff = result.home - result.away;
    diffMap.set(diff, (diffMap.get(diff) ?? 0) + result.probability);
  }

  const topDiffs = Array.from(diffMap.entries())
    .map(([diff, probability]) => ({ diff, probability }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 7);

  return { outcomeProbabilities, topScores, topDiffs };
}

function TipTable({ rows }: { rows: ReturnType<typeof runTipOptimizer>['rows'] }) {
  if (rows.length === 0) return null;

  return (
    <div className="optimizerTableWrap">
      <table className="optimizerTable">
        <thead>
          <tr>
            <th>Tipp</th>
            <th>EP</th>
            <th>Exakt</th>
            <th>Differenz</th>
            <th>Ausgang</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.label} className={index === 0 ? 'optimizerBestRow' : undefined}>
              <td>{row.label}</td>
              <td>{formatNumber(row.expectedPoints)}</td>
              <td>{formatPercent(row.exactProbability)}</td>
              <td>{formatPercent(row.diffProbability)}</td>
              <td>{formatPercent(row.totalOutcomeProbability)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OddsOptimizerPanel({
  match,
  initialOddsText,
  initialProbabilitiesText,
  homeRating,
  awayRating,
  initialMaxGoals,
  initialSourceBlendWeight,
}: Props) {
  const [oddsText, setOddsText] = useState(initialOddsText);
  const [probabilitiesText, setProbabilitiesText] = useState(initialProbabilitiesText);
  const [maxGoals, setMaxGoals] = useState(Number.isFinite(initialMaxGoals) ? initialMaxGoals : 7);
  const [sourceBlendWeight, setSourceBlendWeight] = useState(
    Number.isFinite(initialSourceBlendWeight) ? initialSourceBlendWeight : 0.5,
  );
  const [currentHome, setCurrentHome] = useState('');
  const [currentAway, setCurrentAway] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [, startTransition] = useTransition();

  const currentHomeValue = currentHome === '' ? null : Number(currentHome);
  const currentAwayValue = currentAway === '' ? null : Number(currentAway);

  const result = useMemo(() => {
    return runTipOptimizer({
      oddsText,
      probabilitiesText,
      match,
      homeRating,
      awayRating,
      maxGoals,
      currentHome: Number.isFinite(currentHomeValue) ? currentHomeValue : null,
      currentAway: Number.isFinite(currentAwayValue) ? currentAwayValue : null,
      sourceBlendWeight,
    });
  }, [awayRating, currentAwayValue, currentHomeValue, homeRating, match, maxGoals, oddsText, probabilitiesText, sourceBlendWeight]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSaveState('saving');
      startTransition(async () => {
        const response = await saveOptimizerOddsInlineAction({
          matchId: match.id,
          oddsText,
          probabilitiesText,
          maxGoals,
          sourceBlendWeight,
        });
        setSaveState(response.ok ? 'saved' : 'error');
      });
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [match.id, maxGoals, oddsText, probabilitiesText, sourceBlendWeight, startTransition]);

  const canOptimize = Boolean(match.home_team && match.away_team);
  const statusText = saveState === 'saving' ? 'speichert ...' : saveState === 'saved' ? 'gespeichert' : saveState === 'error' ? 'konnte nicht gespeichert werden' : 'bereit';
  const oddsWeight = 1 - sourceBlendWeight;
  const modelWeight = sourceBlendWeight;
  const probabilityInsights = useMemo(() => getProbabilityInsights(result.possibleResults), [result.possibleResults]);
  const outcomeTotal =
    probabilityInsights.outcomeProbabilities.home +
    probabilityInsights.outcomeProbabilities.draw +
    probabilityInsights.outcomeProbabilities.away;

  async function readProbabilityFile(file: File | null) {
    if (!file) return;
    const text = await file.text();
    setProbabilitiesText(text);
  }

  return (
    <div className="optimizerStack">
      <section className="card optimizerMatchCard adminSoftCard">
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
          <span>Quoten {formatWeight(oddsWeight)} / CSV {formatWeight(modelWeight)}</span>
          <span>{statusText}</span>
        </div>

        {!canOptimize && (
          <p className="optimizerWarning">Für die Berechnung müssen beide Teams feststehen.</p>
        )}
      </section>

      <section className="card optimizerTopCard">
        <h2>Beste Tipps</h2>
        {result.errors.length > 0 && <div className="errorBox">{result.errors.join('\n')}</div>}
        {canOptimize && result.bestThree.length > 0 ? (
          <>
            <div className="optimizerOutcomeBlock" aria-label="1X2-Wahrscheinlichkeiten">
              <div className="optimizerOutcomeHeader">
                <div>
                  {match.home_team && <Flag team={match.home_team} />}
                  <strong>{formatPercent(probabilityInsights.outcomeProbabilities.home)}</strong>
                </div>
                <div>
                  <DrawFlag />
                  <strong>{formatPercent(probabilityInsights.outcomeProbabilities.draw)}</strong>
                </div>
                <div>
                  {match.away_team && <Flag team={match.away_team} />}
                  <strong>{formatPercent(probabilityInsights.outcomeProbabilities.away)}</strong>
                </div>
              </div>
              <div className="optimizerOutcomeBar">
                <div
                  className="optimizerOutcomeSegment optimizerOutcomeHome"
                  style={{ flexGrow: Math.max(probabilityInsights.outcomeProbabilities.home, 0.01) }}
                />
                <div
                  className="optimizerOutcomeSegment optimizerOutcomeDraw"
                  style={{ flexGrow: Math.max(probabilityInsights.outcomeProbabilities.draw, 0.01) }}
                />
                <div
                  className="optimizerOutcomeSegment optimizerOutcomeAway"
                  style={{ flexGrow: Math.max(probabilityInsights.outcomeProbabilities.away, 0.01) }}
                />
              </div>
            </div>

            <div className="optimizerTopTips compactTopTips">
              {result.bestThree.map((row, index) => (
                <div className="optimizerTipCard" key={row.label}>
                  <span className="optimizerTipRank">#{index + 1}</span>
                  <strong>{row.label}</strong>
                  <span>{formatNumber(row.expectedPoints)} EP</span>
                </div>
              ))}
            </div>

            <div className="optimizerAltTips compactAltTips">
              {result.alternativeDiffs.map((row) => (
                <div className="optimizerAltTip" key={row.label}>
                  <strong>{row.label}</strong>
                  <span>{formatNumber(row.expectedPoints)} EP</span>
                </div>
              ))}
            </div>

            <div className="optimizerSummary compactSummary">
              <span>Multiplikator ×{result.summary.stageMultiplier}</span>
              <span>Quoten {result.summary.inputOddsCount}</span>
              <span>CSV {result.summary.inputProbabilityCount}</span>
              <span>geschätzt {result.summary.estimatedCount}</span>
            </div>
          </>
        ) : (
          <p className="subtle">Füge Quoten ein oder lade eine Wahrscheinlichkeits-CSV hoch, um die erwarteten Punkte zu berechnen.</p>
        )}
      </section>

      <section className="card optimizerInputCard adminSoftCard">
        <div className="optimizerInputHeader">
          <div>
            <label className="fieldLabel">Eingaben</label>
            <p className="subtle smallText">Du kannst nur Quoten, nur CSV oder beides verwenden. Wenn beides vorhanden ist, entscheidet der globale Slider unten die Gewichtung.</p>
          </div>

          <label className="optimizerFileButton">
            CSV hochladen
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                void readProbabilityFile(event.target.files?.[0] ?? null);
                event.currentTarget.value = '';
              }}
            />
          </label>
        </div>

        <div className="optimizerDualInputs">
          <div>
            <label className="fieldLabel" htmlFor="oddsText">Quoten einfügen</label>
            <textarea
              id="oddsText"
              className="optimizerTextarea"
              value={oddsText}
              onChange={(event) => setOddsText(event.target.value)}
              placeholder={'1:0 7.00\n2:0 9.25\n2:1 8.50'}
            />
            <p className="subtle smallText">Format pro Zeile: Ergebnis und Quote, z. B. 2:1 8.50.</p>
          </div>

          <div>
            <label className="fieldLabel" htmlFor="probabilitiesText">Score-Wahrscheinlichkeiten</label>
            <textarea
              id="probabilitiesText"
              className="optimizerTextarea"
              value={probabilitiesText}
              onChange={(event) => setProbabilitiesText(event.target.value)}
              placeholder={'home_goals,away_goals,score,probability,probability_percent\n2,1,2:1,0.083,8.3'}
            />
            <p className="subtle smallText">Akzeptiert CSVs wie dein Modell-Output. Der Text wird für dieses Spiel gespeichert.</p>
          </div>
        </div>
      </section>

      {canOptimize && result.rows.length > 0 && (
        <>
          <section className="card optimizerProbabilityCard">
            <h2>Wahrscheinlichkeiten</h2>
            <div className="optimizerProbabilityGrid">
              <div>
                <h3>Wahrscheinlichste Ergebnisse</h3>
                <div className="optimizerProbabilityList">
                  {probabilityInsights.topScores.map((score) => (
                    <div className="optimizerProbabilityRow" key={score.label}>
                      <strong>{score.label}</strong>
                      <span>{formatPercent(score.probability)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3>Wahrscheinlichste Tordifferenzen</h3>
                <div className="optimizerProbabilityList">
                  {probabilityInsights.topDiffs.map((entry) => (
                    <div className="optimizerProbabilityRow" key={entry.diff}>
                      <strong>{formatSignedDiff(entry.diff)}</strong>
                      <span>{formatPercent(entry.probability)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <p className="subtle smallText">Basis: gemischte Ergebniswahrscheinlichkeiten aus Quoten und CSV. Summe 1X2: {formatPercent(outcomeTotal)}.</p>
          </section>

          <section className="card optimizerOutputCard">
            <h2>Alle Tipps</h2>
            <TipTable rows={result.rows} />
          </section>
        </>
      )}

      <section className="card optimizerSettingsCard">
        <h2>Einstellungen</h2>
        <div className="optimizerPresetRow">
          <button type="button" onClick={() => setSourceBlendWeight(0)}>100 / 0</button>
          <button type="button" onClick={() => setSourceBlendWeight(0.25)}>75 / 25</button>
          <button type="button" onClick={() => setSourceBlendWeight(0.5)}>50 / 50</button>
          <button type="button" onClick={() => setSourceBlendWeight(0.75)}>25 / 75</button>
          <button type="button" onClick={() => setSourceBlendWeight(1)}>0 / 100</button>
        </div>

        <label className="optimizerSliderLabel">
          <span>Quoten/CSV-Gewichtung: {formatWeight(oddsWeight)} / {formatWeight(modelWeight)}</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={formatWeight(sourceBlendWeight)}
            onChange={(event) => setSourceBlendWeight(Number(event.target.value) / 100)}
          />
        </label>

        <div className="optimizerSettingsGrid">
          <label>
            <span>Max. Tore je Team</span>
            <input
              type="number"
              min="4"
              max="10"
              value={maxGoals}
              onChange={(event) => setMaxGoals(Number(event.target.value || 7))}
            />
          </label>
          <label>
            <span>Mindeststand Heim</span>
            <input
              type="number"
              min="0"
              max="20"
              placeholder="auto"
              value={currentHome}
              onChange={(event) => setCurrentHome(event.target.value)}
            />
          </label>
          <label>
            <span>Mindeststand Auswärts</span>
            <input
              type="number"
              min="0"
              max="20"
              placeholder="auto"
              value={currentAway}
              onChange={(event) => setCurrentAway(event.target.value)}
            />
          </label>
        </div>

        <p className="subtle smallText">Die Quoten/CSV-Gewichtung wird global gespeichert und gilt für alle Spiele. Max. Tore wird weiter je Spiel gespeichert. Der Mindeststand bleibt lokal.</p>
      </section>
    </div>
  );
}
