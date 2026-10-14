/**
 * Erster Schritt der Morgen-Routine: entscheidet, ob es neue Aufgaben braucht oder der letzte
 * Aufgabensatz wiederholt wird. Neue Aufgaben gibt es nur, wenn die App für den Tag aus
 * data/heute.json den Wunsch danach gemeldet hat (alles bearbeitet oder „Überspringen und neue
 * Aufgabe“). Sonst bekommt der Satz das heutige Datum, und die Routine spart sich das Erzeugen.
 *
 * Aufruf: node tools/aufgaben-wiederholen.mjs --kanal <ntfy-kanal-des-vaters> [heute.json]
 *
 * Ausgabe (eine Zeile auf stdout):
 *   aktuell     data/heute.json ist schon von heute, nichts zu tun
 *   wiederholt  Satz mit heutigem Datum neu geschrieben, nur noch committen und pushen
 *   neu         Niklas wünscht neue Aufgaben
 *   unbekannt   Status bei ntfy nicht abrufbar (Grund auf stderr); neue Aufgaben erzeugen
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { heutigesDatum } from "../js/ablauf.js";
import { NTFY_URL, enthaeltNeueAufgabenWunsch, istGueltigerKanal, statusKanal } from "../js/benachrichtigung.js";

const STANDARD_DATEN = fileURLToPath(new URL("../data/heute.json", import.meta.url));
const DATUM_MUSTER = /^\d{4}-\d{2}-\d{2}$/;
const ABFRAGE_TIMEOUT_MS = 15000;

const ERGEBNIS = Object.freeze({
  aktuell: "aktuell",
  wiederholt: "wiederholt",
  neu: "neu",
  unbekannt: "unbekannt",
});

class AufrufFehler extends Error {}

/** Alle gespeicherten Meldungen des Statuskanals, auch die noch nicht zugestellten (geplanten). */
async function ladeStatus(kanal) {
  // Geplante Nachrichten liefert ntfy nur mit since=all und scheduled=true aus.
  const url = `${NTFY_URL}${statusKanal(kanal)}/json?poll=1&since=all&scheduled=true`;
  const antwort = await fetch(url, { signal: AbortSignal.timeout(ABFRAGE_TIMEOUT_MS) });
  if (!antwort.ok) throw new Error(`ntfy.sh antwortet mit Status ${antwort.status}`);
  return antwort.text();
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { kanal: { type: "string" } },
  });
  const kanal = values.kanal?.trim() ?? "";
  if (!istGueltigerKanal(kanal)) {
    throw new AufrufFehler("Aufruf: node tools/aufgaben-wiederholen.mjs --kanal <ntfy-kanal> [heute.json]");
  }
  const datei = positionals[0] ?? STANDARD_DATEN;
  const daten = JSON.parse(await readFile(datei, "utf8"));
  if (typeof daten.datum !== "string" || !DATUM_MUSTER.test(daten.datum)) {
    throw new AufrufFehler(`${datei} enthält kein gültiges Datum (JJJJ-MM-TT).`);
  }

  const heute = heutigesDatum();
  if (daten.datum === heute) return ERGEBNIS.aktuell;

  let status;
  try {
    status = await ladeStatus(kanal);
  } catch (fehler) {
    process.stderr.write(`Status nicht abrufbar: ${fehler.message}\n`);
    return ERGEBNIS.unbekannt;
  }
  if (enthaeltNeueAufgabenWunsch(status, daten.datum)) return ERGEBNIS.neu;

  // Gleicher Satz (gleiches Salz), neues Datum: Die App beginnt den Tag frisch, die Action plant die
  // Mitternachts-Erinnerung für heute.
  await writeFile(datei, `${JSON.stringify({ ...daten, datum: heute, wiederholung: true }, null, 2)}\n`, "utf8");
  return ERGEBNIS.wiederholt;
}

main()
  .then((ergebnis) => process.stdout.write(`${ergebnis}\n`))
  .catch((fehler) => {
    process.stderr.write(`Fehler: ${fehler instanceof AufrufFehler ? fehler.message : fehler.stack}\n`);
    process.exitCode = 1;
  });
