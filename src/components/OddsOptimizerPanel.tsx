'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { saveOptimizerOddsInlineAction } from '@/app/actions';
import { runTipOptimizer, type OptimizerSourceMode } from '@/lib/optimizer';
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
  initialInputMode: OptimizerSourceMode;
  homeRating: number | null;
  awayRating: number | null;
  initialMaxGoals: number;
  initialRankingWeight: number;
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
  initialInputMode,
  homeRating,
  awayRating,
  initialMaxGoals,
  initialRankingWeight,
}: Props) {
  const [oddsText, setOddsText] = useState(initialOddsText);
  const [probabilitiesText, setProbabilitiesText] = useState(initialProbabilitiesText);
  const [inputMode, setInputMode] = useState<OptimizerSourceMode>(initialInputMode ?? 'odds');
  const [maxGoals, setMaxGoals] = useState(Number.isFinite(initialMaxGoals) ? initialMaxGoals : 7);
  const [rankingWeight, setRankingWeight] = useState(
    Number.isFinite(initialRankingWeight) ? initialRankingWeight : 0.15,
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
      sourceMode: inputMode,
      match,
      homeRating,
      awayRating,
      maxGoals,
      currentHome: Number.isFinite(currentHomeValue) ? currentHomeValue : null,
      currentAway: Number.isFinite(currentAwayValue) ? currentAwayValue : null,
      rankingWeight,
    });
  }, [awayRating, currentAwayValue, currentHomeValue, homeRating, inputMode, match, maxGoals, oddsText, probabilitiesText, rankingWeight]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSaveState('saving');
      startTransition(async () => {
        const response = await saveOptimizerOddsInlineAction({
          matchId: match.id,
          oddsText,
          probabilitiesText,
          inputMode,
          maxGoals,
          rankingWeight,
        });
        setSaveState(response.ok ? 'saved' : 'error');
      });
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [inputMode, match.id, maxGoals, oddsText, probabilitiesText, rankingWeight, startTransition]);

  const canOptimize = Boolean(match.home_team && match.away_team);
  const statusText = saveState === 'saving' ? 'speichert ...' : saveState === 'saved' ? 'gespeichert' : saveState === 'error' ? 'konnte nicht gespeichert werden' : 'bereit';
  const oddsWeight = 1 - rankingWeight;
  const activeInputCount = result.summary.inputOddsCount;

  async function readProbabilityFile(file: File | null) {
    if (!file) return;
    const text = await file.text();
    setProbabilitiesText(text);
    setInputMode('probabilities');
  }

  return (
    <div className="optimizerStack">
      <section className="card optimizerMatchCard adminSoftCard">
        <div className="optimizerMatchHeader">
          <div className="optimizerTeamSide">
            {match.home_team ? <Flag team={match.home_team} /> : <span className="placeholderFlag" />}
            <strong>{match.home_team?.name ?? match.home_placeholder ?? 'Offen'}</strong>
            <span>FIFA {homeRating?.toFixed(0) ?? '-'}</span>
          </div>
          <div className="optimizerVersus">vs.</div>
          <div className="optimizerTeamSide">
            {match.away_team ? <Flag team={match.away_team} /> : <span className="placeholderFlag" />}
            <strong>{match.away_team?.name ?? match.away_placeholder ?? 'Offen'}</strong>
            <span>FIFA {awayRating?.toFixed(0) ?? '-'}</span>
          </div>
        </div>

        <div className="optimizerMetaLine">
          <span>Spiel {match.match_number}</span>
          <span>{match.stage}</span>
          <span>Gewichtung {formatWeight(oddsWeight)} / {formatWeight(rankingWeight)}</span>
          <span>{inputMode === 'probabilities' ? 'CSV-Wahrscheinlichkeiten' : 'Quoten'}</span>
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
              <span>{inputMode === 'probabilities' ? `direkt ${activeInputCount}` : `geschätzt ${result.summary.estimatedCount}`}</span>
              <span>{inputMode === 'probabilities' ? 'Wahrscheinlichkeiten' : 'Quoten'} {activeInputCount}</span>
            </div>
          </>
        ) : (
          <p className="subtle">
            {inputMode === 'probabilities'
              ? 'Lade eine Wahrscheinlichkeits-CSV hoch, um die erwarteten Punkte zu berechnen.'
              : 'Füge Quoten ein, um die erwarteten Punkte zu berechnen.'}
          </p>
        )}
      </section>

      <section className="card optimizerInputCard adminSoftCard">
        <div className="optimizerInputHeader">
          <div>
            <label className="fieldLabel">Berechnungsquelle</label>
            <div className="optimizerModeToggle" role="group" aria-label="Berechnungsquelle auswählen">
              <button
                type="button"
                className={inputMode === 'odds' ? 'active' : ''}
                onClick={() => setInputMode('odds')}
              >
                Quoten
              </button>
              <button
                type="button"
                className={inputMode === 'probabilities' ? 'active' : ''}
                onClick={() => setInputMode('probabilities')}
              >
                Wahrscheinlichkeiten CSV
              </button>
            </div>
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

        {inputMode === 'odds' ? (
          <>
            <label className="fieldLabel" htmlFor="oddsText">Quoten einfügen</label>
            <textarea
              id="oddsText"
              className="optimizerTextarea"
              value={oddsText}
              onChange={(event) => setOddsText(event.target.value)}
              placeholder={'1:0 7.00\n2:0 9.25\n2:1 8.50'}
            />
            <p className="subtle smallText">Format pro Zeile: Ergebnis und Quote, z. B. 2:1 8.50. Die Quoten werden automatisch für dieses Spiel gespeichert.</p>
          </>
        ) : (
          <>
            <label className="fieldLabel" htmlFor="probabilitiesText">Score-Wahrscheinlichkeiten einfügen oder hochladen</label>
            <textarea
              id="probabilitiesText"
              className="optimizerTextarea"
              value={probabilitiesText}
              onChange={(event) => setProbabilitiesText(event.target.value)}
              placeholder={'home_goals,away_goals,score,probability,probability_percent\n2,1,2:1,0.083,8.3'}
            />
            <p className="subtle smallText">Akzeptiert CSVs wie dein Modell-Output mit home_goals, away_goals, score und probability/probability_percent. Die Datei wird als Text für dieses Spiel gespeichert.</p>
          </>
        )}
      </section>

      {canOptimize && result.rows.length > 0 && (
        <section className="card optimizerOutputCard">
          <h2>Alle Tipps</h2>
          <TipTable rows={result.rows} />
        </section>
      )}

      <section className="card optimizerSettingsCard">
        <h2>Einstellungen</h2>
        <div className="optimizerPresetRow">
          <button type="button" onClick={() => setRankingWeight(0.15)}>85 / 15</button>
          <button type="button" onClick={() => setRankingWeight(0.10)}>90 / 10</button>
          <button type="button" onClick={() => setRankingWeight(0.20)}>80 / 20</button>
        </div>

        <label className="optimizerSliderLabel">
          <span>Quoten/FIFA-Gewichtung: {formatWeight(oddsWeight)} / {formatWeight(rankingWeight)}</span>
          <input
            type="range"
            min="0"
            max="35"
            step="1"
            value={formatWeight(rankingWeight)}
            onChange={(event) => setRankingWeight(Number(event.target.value) / 100)}
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

        <p className="subtle smallText">Max. Tore und Gewichtung werden gespeichert. Der Mindeststand ist nur für Live-Quoten gedacht und bleibt lokal.</p>
      </section>
    </div>
  );
}
