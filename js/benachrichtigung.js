/**
 * Schickt Mitteilungen über ntfy.sh. Wer den Kanal in der ntfy-App abonniert hat, bekommt sie als
 * Push-Nachricht auf den Sperrbildschirm. Der Kanalname ist das einzige Geheimnis: wer ihn kennt,
 * kann mitlesen und senden. Deshalb ist er lang und zufällig und liegt nur auf den Geräten.
 */

const NTFY_URL = "https://ntfy.sh/";
const KANAL_MUSTER = /^[A-Za-z0-9_-]{16,64}$/;
export const MARKIERUNG_ABGESCHLOSSEN = "abgeschlossen";

export function istGueltigerKanal(kanal) {
  return KANAL_MUSTER.test(kanal);
}

/** Sendet eine Nachricht; wirft Error mit verständlicher Meldung, wenn es nicht klappt. */
export async function sende(kanal, { titel, text, markierungen = [] }) {
  if (!istGueltigerKanal(kanal)) {
    throw new Error("Der Kanalname fehlt oder ist ungültig. Bitte unter „Einstellungen“ eintragen.");
  }
  let antwort;
  try {
    // JSON statt Header, weil HTTP-Header keine Umlaute erlauben.
    antwort = await fetch(NTFY_URL, {
      method: "POST",
      body: JSON.stringify({ topic: kanal, title: titel, message: text, tags: markierungen }),
    });
  } catch {
    throw new Error("Keine Verbindung zu ntfy.sh. Bist du online?");
  }
  if (!antwort.ok) {
    throw new Error(`ntfy.sh hat die Nachricht abgelehnt (Status ${antwort.status}).`);
  }
}
