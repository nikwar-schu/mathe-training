/**
 * Speichert Einstellungen, Tagesfortschritt und Rechenblätter im localStorage des Geräts.
 * Alle Zugriffe sind abgesichert, weil der Speicher im privaten Modus oder bei vollem
 * Kontingent Fehler wirft; die App funktioniert dann weiter, nur ohne Erinnerung.
 */

const SCHLUESSEL_ZUSTAND = "mathe-training:v1";
const PRAEFIX_BLATT = "mathe-training:blatt:";
const BLATT_AUFBEWAHRUNG_TAGE = 3;

function lesenJson(schluessel, ersatz) {
  try {
    const text = localStorage.getItem(schluessel);
    return text ? JSON.parse(text) : ersatz;
  } catch {
    return ersatz;
  }
}

function schreibenJson(schluessel, wert) {
  try {
    localStorage.setItem(schluessel, JSON.stringify(wert));
    return true;
  } catch {
    return false;
  }
}

function leererZustand() {
  return { kanal: "", tage: {} };
}

export function ladeZustand() {
  const zustand = lesenJson(SCHLUESSEL_ZUSTAND, leererZustand());
  return { ...leererZustand(), ...zustand };
}

export function speichereZustand(zustand) {
  return schreibenJson(SCHLUESSEL_ZUSTAND, zustand);
}

/** Liefert den Fortschritt eines Tages und legt ihn bei Bedarf an. */
export function tagesstand(zustand, datum, anzahlAufgaben) {
  if (!zustand.tage[datum]) {
    zustand.tage[datum] = {
      aufgaben: Array.from({ length: anzahlAufgaben }, () => ({ status: "offen", versuche: 0, grund: "" })),
      gemeldet: false,
    };
  }
  return zustand.tage[datum];
}

export function ladeBlatt(datum, nummer) {
  return lesenJson(`${PRAEFIX_BLATT}${datum}:${nummer}`, null);
}

export function speichereBlatt(datum, nummer, blatt) {
  return schreibenJson(`${PRAEFIX_BLATT}${datum}:${nummer}`, blatt);
}

/** Löscht Rechenblätter älterer Tage, damit der Speicher nicht vollläuft. */
export function raeumeBlaetterAuf(heute) {
  const grenze = new Date(`${heute}T00:00:00`);
  grenze.setDate(grenze.getDate() - BLATT_AUFBEWAHRUNG_TAGE);
  try {
    Object.keys(localStorage)
      .filter((schluessel) => schluessel.startsWith(PRAEFIX_BLATT))
      .filter((schluessel) => new Date(`${schluessel.slice(PRAEFIX_BLATT.length, PRAEFIX_BLATT.length + 10)}T00:00:00`) < grenze)
      .forEach((schluessel) => localStorage.removeItem(schluessel));
  } catch {
    // Aufräumen ist optional; ohne Speicherzugriff gibt es auch nichts aufzuräumen.
  }
}
