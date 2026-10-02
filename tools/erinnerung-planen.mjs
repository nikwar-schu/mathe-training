/**
 * Plant bei ntfy die Nachricht „nicht erledigt“ für die Mitternacht nach dem Aufgabentag aus
 * data/heute.json. Die App löscht sie, sobald alle Aufgaben erledigt sind; sonst bekommt der Vater
 * sie um 0 Uhr deutscher Zeit (Sommer- und Winterzeit berücksichtigt).
 *
 * Läuft als GitHub Action nach jedem neuen Aufgabensatz. Der Kanal kommt aus der Umgebungsvariable
 * NTFY_KANAL (Repository-Secret), weil er nicht im öffentlichen Repo stehen darf.
 *
 * Aufruf: NTFY_KANAL=… node tools/erinnerung-planen.mjs [heute.json]
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { erinnerungNachricht, mitternachtNach } from "../js/ablauf.js";
import {
  MARKIERUNG_NICHT_ERLEDIGT,
  PRIORITAET_HOCH,
  erinnerungsKennung,
  istGueltigerKanal,
  istPlanbar,
  sende,
} from "../js/benachrichtigung.js";

const STANDARD_DATEN = fileURLToPath(new URL("../data/heute.json", import.meta.url));
const DATUM_MUSTER = /^\d{4}-\d{2}-\d{2}$/;

async function main() {
  const kanal = process.env.NTFY_KANAL?.trim() ?? "";
  if (!istGueltigerKanal(kanal)) {
    throw new Error("NTFY_KANAL fehlt oder ist ungültig (Repository-Secret prüfen).");
  }

  const datei = process.argv[2] ?? STANDARD_DATEN;
  const { datum } = JSON.parse(await readFile(datei, "utf8"));
  if (typeof datum !== "string" || !DATUM_MUSTER.test(datum)) {
    throw new Error(`${datei} enthält kein gültiges Datum (JJJJ-MM-TT).`);
  }

  const zeitpunkt = mitternachtNach(datum);
  if (!istPlanbar(zeitpunkt, Math.floor(Date.now() / 1000))) {
    // Etwa ein nachträglich neu gestarteter Lauf für einen vergangenen Tag: nichts zu planen.
    console.log(`Mitternacht nach ${datum} liegt außerhalb des planbaren Zeitraums, keine Erinnerung geplant.`);
    return;
  }

  // Gleiche Kennung wie ein früherer Lauf desselben Tages: ntfy ersetzt die geplante Nachricht.
  await sende(kanal, {
    ...erinnerungNachricht(datum),
    markierungen: [MARKIERUNG_NICHT_ERLEDIGT],
    prioritaet: PRIORITAET_HOCH,
    zeitpunkt,
    kennung: erinnerungsKennung(datum),
  });
  console.log(`Erinnerung für ${datum} geplant: ${new Date(zeitpunkt * 1000).toISOString()}.`);
}

main().catch((fehler) => {
  console.error(fehler.message);
  process.exitCode = 1;
});
