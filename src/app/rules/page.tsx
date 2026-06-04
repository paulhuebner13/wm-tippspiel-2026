import { Nav } from '@/components/Nav';
import { requireUser } from '@/lib/session';
import { POINTS, STAGE_MULTIPLIERS } from '@/lib/scoring';

export default async function RulesPage() {
  const user = await requireUser();

  return (
    <>
      <Nav user={user} />
      <main className="page rulesPage">
        <h1>Regeln</h1>
        <p className="subtle">Hier stehen die wichtigsten Regeln für das WM Tippspiel.</p>

        <section className="card rulesCard">
          <h2>Punkte pro Tipp</h2>
          <div className="rulesGrid">
            <div>
              <strong>Exaktes Ergebnis</strong>
              <span>{POINTS.exact} Punkte</span>
              <p>Beispiel: Ergebnis 2:1, Tipp 2:1.</p>
            </div>
            <div>
              <strong>Richtiges Torverhältnis</strong>
              <span>{POINTS.goalDifference} Punkte</span>
              <p>Beispiel: Ergebnis 2:1, Tipp 3:2 oder 1:0.</p>
            </div>
            <div>
              <strong>Richtiger Ausgang</strong>
              <span>{POINTS.outcome} Punkte</span>
              <p>Der Sieger oder ein Unentschieden wurde richtig getippt.</p>
            </div>
            <div>
              <strong>K.-o.-Weiterkommer</strong>
              <span>+{POINTS.knockoutAdvanceWinner} Punkte</span>
              <p>Nur wenn du in einem K.-o.-Spiel Unentschieden tippst und den Weiterkommer richtig auswählst.</p>
            </div>
          </div>
        </section>

        <section className="card rulesCard">
          <h2>Multiplikatoren</h2>
          <div className="multiplierList">
            <div><span>Gruppenphase</span><strong>×{STAGE_MULTIPLIERS.group}</strong></div>
            <div><span>Sechzehntelfinale</span><strong>×{STAGE_MULTIPLIERS.round_of_32}</strong></div>
            <div><span>Achtelfinale</span><strong>×{STAGE_MULTIPLIERS.round_of_16}</strong></div>
            <div><span>Viertelfinale</span><strong>×{STAGE_MULTIPLIERS.quarter_final}</strong></div>
            <div><span>Halbfinale</span><strong>×{STAGE_MULTIPLIERS.semi_final}</strong></div>
            <div><span>Spiel um Platz 3</span><strong>×{STAGE_MULTIPLIERS.third_place}</strong></div>
            <div><span>Finale</span><strong>×{STAGE_MULTIPLIERS.final}</strong></div>
          </div>
        </section>

        <section className="card rulesCard">
          <h2>Tipps ändern</h2>
          <p>
            Du kannst deinen Tipp bis <strong>15 Minuten vor Spielbeginn</strong> ändern. Danach ist das Spiel gesperrt und der Tipp kann nicht mehr bearbeitet werden.
          </p>
          <p>
            Bei K.-o.-Spielen erscheint die Auswahl <strong>„Wer kommt weiter?“</strong> erst dann, wenn du ein Unentschieden eintippst. Dann musst du eines der beiden Teams auswählen, bevor du speichern kannst.
          </p>
        </section>

        <section className="card rulesCard">
          <h2>Tipps der anderen ansehen</h2>
          <p>
            Vor der Tipp-Sperre siehst du nur deinen eigenen Tipp. Sobald ein Spiel gesperrt ist, also ab 15 Minuten vor Spielbeginn, können die Tipps der anderen angezeigt werden.
          </p>
          <p>
            Auf der Ergebnisseite kannst du auswählen, von welchem Spieler du die Tipps und Punkte sehen möchtest.
          </p>
        </section>
      </main>
    </>
  );
}
