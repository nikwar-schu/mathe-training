/**
 * Wandelt einen Aufgabenentwurf (mit Klartext-Lösungen) in data/heute.json um:
 * Ergebnisse werden gehasht, Thema und Musterlösungen verschlüsselt.
 *
 * Mit --zusammenfassung wird zusätzlich der Abschnitt `anker` aus der Zusammenfassung als
 * verschlüsselte Hilfe mitgeliefert.
 *
 * Aufruf: node tools/aufgaben-erstellen.mjs <entwurf.json> [ausgabe.json] [--zusammenfassung <datei.html>]
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseArgs } from "node:util";

import { berechne } from "../js/rechner.js";
import { schneideAbschnitt } from "./abschnitt.mjs";
import {
  hashErgebnis,
  kanonisch,
  liegtAufRundungsgrenze,
  neuesSalz,
  runden,
  verschluesseln,
} from "../js/pruefung.js";

const STANDARD_AUSGABE = fileURLToPath(new URL("../data/heute.json", import.meta.url));
const ANZAHL_AUFGABEN = 2;
const DATUM_MUSTER = /^\d{4}-\d{2}-\d{2}$/;

class EntwurfFehler extends Error {}

// Zwei Backslashes vor einem Befehl wie "\," oder "\cdot" heißen: beim Schreiben des JSON einmal zu
// oft escaped. KaTeX liest "\\" als Zeilenumbruch, und die Aufgabe zerfällt in der App in Zeilen.
const DOPPELT_ESCAPED = /\\\\(?=[A-Za-z,;:! |{])/;

function pruefeText(wert, bezeichnung) {
  if (typeof wert !== "string" || wert.trim() === "") {
    throw new EntwurfFehler(`${bezeichnung} fehlt oder ist leer.`);
  }
  if (DOPPELT_ESCAPED.test(wert)) {
    throw new EntwurfFehler(
      `${bezeichnung} enthält zwei Backslashes vor einem LaTeX-Befehl (zu oft escaped). ` +
        'Im JSON-Entwurf "\\\\," schreiben, nicht "\\\\\\\\,".',
    );
  }
}

function pruefeAufgabe(aufgabe, nummer) {
  const ort = `Aufgabe ${nummer}`;
  pruefeText(aufgabe.stufe, `${ort}: stufe`);
  pruefeText(aufgabe.text, `${ort}: text`);
  if (!Array.isArray(aufgabe.felder) || aufgabe.felder.length === 0) {
    throw new EntwurfFehler(`${ort}: felder muss mindestens ein Eingabefeld enthalten.`);
  }
  aufgabe.felder.forEach((feld, i) => pruefeText(feld, `${ort}: felder[${i}]`));
  if (!Array.isArray(aufgabe.ergebnis) || aufgabe.ergebnis.length !== aufgabe.felder.length) {
    throw new EntwurfFehler(`${ort}: ergebnis braucht genau einen Wert pro Eingabefeld.`);
  }
  if (!Array.isArray(aufgabe.loesung) || aufgabe.loesung.length === 0) {
    throw new EntwurfFehler(`${ort}: loesung muss mindestens einen Schritt enthalten.`);
  }
  aufgabe.loesung.forEach((schritt, i) => pruefeText(schritt, `${ort}: loesung[${i}]`));
}

function pruefeEntwurf(entwurf) {
  if (!DATUM_MUSTER.test(entwurf.datum ?? "")) {
    throw new EntwurfFehler("datum muss im Format JJJJ-MM-TT angegeben sein.");
  }
  pruefeText(entwurf.thema, "thema");
  if (!Array.isArray(entwurf.aufgaben) || entwurf.aufgaben.length !== ANZAHL_AUFGABEN) {
    throw new EntwurfFehler(`Es müssen genau ${ANZAHL_AUFGABEN} Aufgaben sein.`);
  }
  entwurf.aufgaben.forEach((aufgabe, i) => pruefeAufgabe(aufgabe, i + 1));
}

async function oeffentlicheAufgabe(aufgabe, nummer) {
  const werte = aufgabe.ergebnis.map((ausdruck) => berechne(String(ausdruck)));
  const grenzwerte = werte.filter(liegtAufRundungsgrenze);
  if (grenzwerte.length > 0) {
    throw new EntwurfFehler(
      `Aufgabe ${nummer}: Ergebnis ${grenzwerte.join(", ")} liegt auf einer Rundungsgrenze. ` +
        "Bitte Zahlen so wählen, dass das Runden auf zwei Stellen eindeutig ist.",
    );
  }
  const ungeordnet = Boolean(aufgabe.ungeordnet);
  const salz = neuesSalz();
  return {
    oeffentlich: {
      stufe: aufgabe.stufe,
      text: aufgabe.text,
      felder: aufgabe.felder,
      ungeordnet,
      salz,
      hash: await hashErgebnis(salz, kanonisch(werte, ungeordnet)),
    },
    geheim: {
      loesung: aufgabe.loesung,
      ergebnis: aufgabe.felder.map((feld, i) => `${feld} = ${aufgabe.ergebnis[i]}`),
      gerundet: werte.map(runden),
    },
  };
}

async function leseDatei(pfad, bezeichnung) {
  try {
    return await readFile(pfad, "utf8");
  } catch (fehler) {
    throw new EntwurfFehler(`${bezeichnung} nicht lesbar (${pfad}): ${fehler.code ?? fehler.message}`);
  }
}

/** Der Aufschrieb zum Thema für den Hilfe-Knopf, wörtlich aus der Zusammenfassung übernommen. */
async function hilfeAbschnitt(zusammenfassungPfad, anker) {
  const html = await leseDatei(zusammenfassungPfad, "Zusammenfassung");
  try {
    return schneideAbschnitt(html, anker);
  } catch (fehler) {
    throw new EntwurfFehler(fehler.message);
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { zusammenfassung: { type: "string" } },
  });
  const [entwurfPfad, ausgabePfad = STANDARD_AUSGABE] = positionals;
  const zusammenfassungPfad = values.zusammenfassung;
  if (!entwurfPfad) {
    throw new EntwurfFehler(
      "Aufruf: node tools/aufgaben-erstellen.mjs <entwurf.json> [ausgabe.json] [--zusammenfassung <datei.html>]",
    );
  }

  const entwurf = await leseDatei(entwurfPfad, "Entwurf").then(JSON.parse).catch((fehler) => {
    throw new EntwurfFehler(`Entwurf nicht lesbar: ${fehler.message}`);
  });
  pruefeEntwurf(entwurf);

  const teile = await Promise.all(entwurf.aufgaben.map((a, i) => oeffentlicheAufgabe(a, i + 1)));
  const heute = {
    datum: entwurf.datum,
    aufgaben: teile.map((teil) => teil.oeffentlich),
    geheim: await verschluesseln({
      thema: entwurf.thema,
      aufgaben: teile.map((teil) => teil.geheim),
    }),
  };
  if (zusammenfassungPfad) {
    heute.hilfe = await verschluesseln(await hilfeAbschnitt(zusammenfassungPfad, entwurf.anker));
  }

  await writeFile(ausgabePfad, `${JSON.stringify(heute, null, 2)}\n`, "utf8");
  const gerundet = teile.map((teil) => teil.geheim.gerundet.join(", ")).join(" / ");
  process.stdout.write(`${path.relative(process.cwd(), ausgabePfad)} geschrieben. Gerundete Ergebnisse: ${gerundet}\n`);
}

main().catch((fehler) => {
  const nachricht = fehler instanceof EntwurfFehler || fehler.name === "EingabeFehler" ? fehler.message : fehler.stack;
  process.stderr.write(`Fehler: ${nachricht}\n`);
  process.exitCode = 1;
});
