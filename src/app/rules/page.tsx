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
              <strong>K.-o.-Weiterkommer bei Remis</strong>
              <span>+{POINTS.knockoutAdvanceWinner} Punkte</span>
              <p>
                Wenn du in einem K.-o.-Spiel nach 90 Minuten Unentschieden tippst
                und den richtigen Weiterkommer auswählst.
              </p>
            </div>
            <div>
              <strong>K.-o.-Weiterkommer trotz anderem 90-Minuten-Ergebnis</strong>
              <span>+{POINTS.knockoutAdvanceTeam} Punkte</span>
              <p>
                Wenn dein ausgewähltes oder durch den Tipp gemeintes Team weiterkommt,
                aber das Ergebnis nach 90 Minuten anders war. Dieser Bonus ist nur ein Zusatzpunkt.
              </p>
            </div>
          </div>
        </section>

        <section className="card rulesCard">
          <h2>K.-o.-Spiele</h2>
          <p>
            Bei K.-o.-Spielen wird immer das <strong>Ergebnis nach 90 Minuten</strong> getippt,
            also nicht das Ergebnis nach Verlängerung oder Elfmeterschießen.
          </p>
          <p>
            Tippst du nach 90 Minuten ein Unentschieden, musst du zusätzlich auswählen,
            welches Team weiterkommt. Ist beides richtig, gibt es zusätzlich{' '}
            <strong>+{POINTS.knockoutAdvanceWinner} Punkte</strong>.
          </p>
          <p>
            Es gibt außerdem <strong>+{POINTS.knockoutAdvanceTeam} Punkte</strong>, wenn dein
            Weiterkommen-Team richtig ist, aber das 90-Minuten-Ergebnis anders war: zum Beispiel
            du tippst Remis und wählst ein Team aus, dieses Team gewinnt aber schon nach 90 Minuten;
            oder du tippst einen Sieger nach 90 Minuten, aber das Spiel endet nach 90 Minuten Remis
            und dein getipptes Team kommt danach weiter.
          </p>
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
            Du kannst deinen Tipp bis zum <strong>Anpfiff</strong> ändern. Ab Spielbeginn ist das Spiel gesperrt und der Tipp kann nicht mehr bearbeitet werden.
          </p>
          <p>
            Bei K.-o.-Spielen erscheint die Auswahl <strong>„Wer kommt weiter?“</strong> erst dann, wenn du ein Unentschieden eintippst. Ein Tipp ist erst vollständig, wenn dann auch ein Weiterkommer ausgewählt ist.
          </p>
        </section>

        <section className="card rulesCard">
          <h2>Tipps der anderen ansehen</h2>
          <p>
            Vor dem Anpfiff siehst du bei anderen Spielern nur, ob ein Tipp abgegeben wurde. Die konkreten Tipps werden erst ab Spielbeginn sichtbar.
          </p>
        </section>
      </main>
    </>
  );
}
