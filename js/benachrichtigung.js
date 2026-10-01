/**
 * Schickt Mitteilungen über ntfy.sh. Wer den Kanal in der ntfy-App abonniert hat, bekommt sie als
 * Push-Nachricht auf den Sperrbildschirm. Der Kanalname ist das einzige Geheimnis: wer ihn kennt,
 * kann mitlesen und senden. Deshalb ist er lang und zufällig und liegt nur auf den Geräten.
 */

const NTFY_URL = "https://ntfy.sh/";
const KANAL_MUSTER = /^[A-Za-z0-9_-]{16,64}$/;
const ERINNERUNG_PRAEFIX = "fehlt-";
export const MARKIERUNG_ABGESCHLOSSEN = "abgeschlossen";
export const MARKIERUNG_NICHT_ERLEDIGT = "warning";
export const PRIORITAET_HOCH = 4;

export function istGueltigerKanal(kanal) {
  return KANAL_MUSTER.test(kanal);
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
 * Löscht die für Mitternacht geplante Erinnerung von `datum`. Gibt es keine, meldet ntfy trotzdem
 * Erfolg, daher darf das bei einem erneuten Versuch beliebig oft passieren.
 */
export async function loescheErinnerung(kanal, datum) {
  pruefeKanal(kanal);
  // GET-Variante statt DELETE, damit der Browser keine CORS-Vorabanfrage braucht.
  const url = `${NTFY_URL}${kanal}/${erinnerungsKennung(datum)}/delete`;
  await anfrage(url, { method: "GET" }, "das Löschen der Erinnerung");
}
