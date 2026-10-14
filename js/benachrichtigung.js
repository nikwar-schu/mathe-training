/**
 * Schickt Mitteilungen über ntfy.sh. Wer den Kanal in der ntfy-App abonniert hat, bekommt sie als
 * Push-Nachricht auf den Sperrbildschirm. Der Kanalname ist das einzige Geheimnis: wer ihn kennt,
 * kann mitlesen und senden. Deshalb ist er lang und zufällig und liegt nur auf den Geräten.
 */

import { tagNach, zeitpunktAm } from "./ablauf.js";

export const NTFY_URL = "https://ntfy.sh/";
const KANAL_MUSTER = /^[A-Za-z0-9_-]{16,64}$/;
const ERINNERUNG_PRAEFIX = "fehlt-";
const STATUS_KANAL_SUFFIX = "-status";
const STATUS_KENNUNG_PRAEFIX = "status-";
const NEUE_AUFGABEN_PRAEFIX = "neu:";
// Die Statusmeldung wird erst am Mittag nach dem Aufgabentag zugestellt: Bis dahin liegt sie bei ntfy
// als geplante Nachricht, danach noch 12 Stunden im Cache. So findet die Routine sie am Morgen sicher.
const STATUS_ZUSTELLUNG_UHRZEIT = "12:00";
const ZUFALL_ZEICHEN = "abcdefghijkmnpqrstuvwxyz23456789";
const ZUFALL_LAENGE = 16;
export const MARKIERUNG_ABGESCHLOSSEN = "abgeschlossen";
export const MARKIERUNG_NICHT_ERLEDIGT = "warning";
export const PRIORITAET_HOCH = 4;
// ntfy.sh nimmt geplante Nachrichten frühestens 10 Sekunden und höchstens 3 Tage im Voraus an.
export const MIN_VORLAUF_SEKUNDEN = 10;
export const MAX_VORLAUF_SEKUNDEN = 3 * 24 * 60 * 60;

export function istGueltigerKanal(kanal) {
  return KANAL_MUSTER.test(kanal);
}

/** Neuer zufälliger Kanalname mit `praefix`; ohne leicht verwechselbare Zeichen wie l, 1, o, 0. */
export function zufallsKanal(praefix) {
  const zufall = crypto.getRandomValues(new Uint8Array(ZUFALL_LAENGE));
  return praefix + Array.from(zufall, (wert) => ZUFALL_ZEICHEN[wert % ZUFALL_ZEICHEN.length]).join("");
}

/** Ob ntfy eine Nachricht für `zeitpunkt` (Unix-Sekunden) zum Zeitpunkt `jetzt` planen kann. */
export function istPlanbar(zeitpunkt, jetzt) {
  const vorlauf = zeitpunkt - jetzt;
  return vorlauf >= MIN_VORLAUF_SEKUNDEN && vorlauf <= MAX_VORLAUF_SEKUNDEN;
}

/** Kennung der Mitternachts-Erinnerung eines Tages; über sie lässt sie sich vor dem Versand löschen. */
export function erinnerungsKennung(datum) {
  return `${ERINNERUNG_PRAEFIX}${datum}`;
}

function pruefeKanal(kanal) {
  if (!istGueltigerKanal(kanal)) {
    throw new Error("Der Kanalname fehlt oder ist ungültig. Bitte unter „Einstellungen“ eintragen.");
  }
}

async function anfrage(url, optionen, handlung) {
  let antwort;
  try {
    antwort = await fetch(url, optionen);
  } catch {
    throw new Error("Keine Verbindung zu ntfy.sh. Bist du online?");
  }
  if (!antwort.ok) {
    throw new Error(`ntfy.sh hat ${handlung} abgelehnt (Status ${antwort.status}).`);
  }
}

/**
 * Sendet eine Nachricht; wirft Error mit verständlicher Meldung, wenn es nicht klappt.
 * Mit `zeitpunkt` (Unix-Sekunden) stellt ntfy sie erst dann zu, mit `kennung` lässt sie sich bis
 * dahin ersetzen oder löschen.
 */
export async function sende(kanal, { titel, text, markierungen = [], prioritaet, zeitpunkt, kennung }) {
  pruefeKanal(kanal);
  // JSON statt Header, weil HTTP-Header keine Umlaute erlauben.
  const nachricht = { topic: kanal, title: titel, message: text, tags: markierungen };
  if (prioritaet !== undefined) nachricht.priority = prioritaet;
  if (zeitpunkt !== undefined) nachricht.delay = String(zeitpunkt);
  if (kennung !== undefined) nachricht.sequence_id = kennung;
  await anfrage(NTFY_URL, { method: "POST", body: JSON.stringify(nachricht) }, "die Nachricht");
}

/**
 * Löscht eine geplante Nachricht über ihre Kennung. Gibt es keine, meldet ntfy trotzdem Erfolg,
 * daher darf das bei einem erneuten Versuch beliebig oft passieren.
 */
export async function loesche(kanal, kennung) {
  pruefeKanal(kanal);
  // GET-Variante statt DELETE, damit der Browser keine CORS-Vorabanfrage braucht.
  const url = `${NTFY_URL}${kanal}/${encodeURIComponent(kennung)}/delete`;
  await anfrage(url, { method: "GET" }, "das Löschen der Nachricht");
}

/** Löscht die für Mitternacht geplante Erinnerung von `datum`. */
export function loescheErinnerung(kanal, datum) {
  return loesche(kanal, erinnerungsKennung(datum));
}

/**
 * Kanal, über den die App der Routine mitteilt, ob es neue Aufgaben geben soll. Niemand abonniert
 * ihn; er leitet sich vom Kanal des Vaters ab, damit kein zweites Geheimnis nötig ist.
 */
export function statusKanal(kanal) {
  return `${kanal}${STATUS_KANAL_SUFFIX}`;
}

export function neueAufgabenText(datum) {
  return `${NEUE_AUFGABEN_PRAEFIX}${datum}`;
}

/**
 * Teilt der Routine mit, dass auf die Aufgaben von `datum` neue folgen sollen. Ohne diese Meldung
 * wiederholt sie den Aufgabensatz. Gleiche Kennung bei erneutem Senden: ntfy ersetzt die Meldung.
 */
export async function meldeNeueAufgabenWunsch(kanal, datum, jetzt = Math.floor(Date.now() / 1000)) {
  const zustellung = zeitpunktAm(tagNach(datum, 1), STATUS_ZUSTELLUNG_UHRZEIT);
  await sende(statusKanal(kanal), {
    titel: "Mathe-Training: Status",
    text: neueAufgabenText(datum),
    // Liegt der Mittag schon zurück (Aufgaben verspätet erledigt), sofort senden; dann hält ntfy sie 12 Stunden.
    zeitpunkt: istPlanbar(zustellung, jetzt) ? zustellung : undefined,
    kennung: `${STATUS_KENNUNG_PRAEFIX}${datum}`,
  });
}

/** Ob die Antwort einer ntfy-Abfrage (eine JSON-Nachricht pro Zeile) den Wunsch nach neuen Aufgaben für `datum` enthält. */
export function enthaeltNeueAufgabenWunsch(antwortText, datum) {
  const gesucht = neueAufgabenText(datum);
  return antwortText
    .split("\n")
    .filter((zeile) => zeile.trim() !== "")
    .some((zeile) => {
      try {
        const nachricht = JSON.parse(zeile);
        return nachricht.event === "message" && nachricht.message === gesucht;
      } catch {
        return false;
      }
    });
}
