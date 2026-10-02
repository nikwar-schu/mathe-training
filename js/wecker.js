/**
 * Mitteilungen an Niklas selbst („Wecker“), getrennt von den Nachrichten an den Vater: zu frei
 * wählbaren Uhrzeiten eine Mitteilung, solange die Aufgaben des Tages offen sind.
 *
 * Die App läuft ohne Server, deshalb plant sie die Mitteilungen bei ntfy im Voraus (höchstens drei
 * Tage) und gleicht sie bei jedem Öffnen und beim Abschluss des Tages ab. Jede Mitteilung trägt eine
 * Kennung aus Tag und Uhrzeit, über die sie sich wieder löschen lässt.
 */

import { tagNach, zeitpunktAm } from "./ablauf.js";
import { MAX_VORLAUF_SEKUNDEN, istGueltigerKanal, istPlanbar, loesche, sende } from "./benachrichtigung.js";

export const MAX_UHRZEITEN = 4;
export const STANDARD_UHRZEITEN = Object.freeze(["07:00", "16:00"]);
export const WECKER_KANAL_PRAEFIX = "mathe-wecker-";
const UHRZEIT_MUSTER = /^([01]\d|2[0-3]):[0-5]\d$/;
const KENNUNG_PRAEFIX = "wecker-";
const SEKUNDEN_PRO_TAG = 24 * 60 * 60;
// Heute plus so viele Folgetage, wie ntfy im Voraus annimmt.
const PLANUNGS_TAGE = Math.ceil(MAX_VORLAUF_SEKUNDEN / SEKUNDEN_PRO_TAG) + 1;

export function leereWeckerEinstellung() {
  return { an: false, kanal: "", uhrzeiten: [...STANDARD_UHRZEITEN], geplant: [] };
}

/**
 * Prüft die eingegebenen Uhrzeiten (HH:MM) und liefert sie sortiert ohne Doppelte.
 * Wirft Error mit verständlicher Meldung bei leeren, ungültigen oder zu vielen Uhrzeiten.
 */
export function bereinigeUhrzeiten(uhrzeiten) {
  const eindeutig = [...new Set(uhrzeiten.map((uhrzeit) => uhrzeit.trim()).filter(Boolean))].sort();
  if (eindeutig.length === 0) {
    throw new Error("Bitte mindestens eine Uhrzeit angeben.");
  }
  if (eindeutig.length > MAX_UHRZEITEN) {
    throw new Error(`Höchstens ${MAX_UHRZEITEN} Uhrzeiten pro Tag.`);
  }
  const ungueltig = eindeutig.find((uhrzeit) => !UHRZEIT_MUSTER.test(uhrzeit));
  if (ungueltig) {
    throw new Error(`„${ungueltig}“ ist keine gültige Uhrzeit (Format 07:00).`);
  }
  return eindeutig;
}

/** Wirft Error, wenn `kanal` ungültig ist oder Papas Kanal wäre (dann bekäme er die Mitteilungen). */
export function pruefeWeckerKanal(kanal, papaKanal) {
  if (!istGueltigerKanal(kanal)) {
    throw new Error("Dein Kanal muss 16 bis 64 Zeichen lang sein (Buchstaben, Ziffern, - und _). Tipp auf „Erzeugen“.");
  }
  if (kanal === papaKanal) {
    throw new Error("Das ist Papas Kanal. Nimm einen eigenen, sonst bekommt er deine Mitteilungen.");
  }
}

function kennung(datum, uhrzeit) {
  return `${KENNUNG_PRAEFIX}${datum}-${uhrzeit.replace(":", "")}`;
}

/**
 * Alle Mitteilungen, die ab `jetzt` (Unix-Sekunden) geplant sein sollen: jede Uhrzeit an heute und
 * den Folgetagen, soweit ntfy sie annimmt. Ist heute schon erledigt, entfallen die von heute.
 */
export function sollWecker({ uhrzeiten, heute, heuteErledigt, jetzt }) {
  const soll = [];
  for (let versatz = heuteErledigt ? 1 : 0; versatz < PLANUNGS_TAGE; versatz += 1) {
    const datum = tagNach(heute, versatz);
    for (const uhrzeit of uhrzeiten) {
      const zeitpunkt = zeitpunktAm(datum, uhrzeit);
      if (istPlanbar(zeitpunkt, jetzt)) soll.push({ kennung: kennung(datum, uhrzeit), zeitpunkt });
    }
  }
  return soll;
}

/**
 * Vergleicht geplante mit gewünschten Mitteilungen. Eine Mitteilung gilt als dieselbe, wenn Kanal
 * und Kennung übereinstimmen; wechselt der Kanal, wird im alten gelöscht und im neuen geplant.
 * Bereits zugestellte (vergangene) Mitteilungen fallen weg.
 */
export function abgleich(geplant, soll, jetzt) {
  const schluessel = (wecker) => `${wecker.kanal}/${wecker.kennung}`;
  const ausstehend = geplant.filter((wecker) => wecker.zeitpunkt > jetzt);
  const sollSchluessel = new Set(soll.map(schluessel));
  const ausstehendSchluessel = new Set(ausstehend.map(schluessel));
  return {
    behalten: ausstehend.filter((wecker) => sollSchluessel.has(schluessel(wecker))),
    loeschen: ausstehend.filter((wecker) => !sollSchluessel.has(schluessel(wecker))),
    senden: soll.filter((wecker) => !ausstehendSchluessel.has(schluessel(wecker))),
  };
}

export function weckerNachricht() {
  return { titel: "Mathe-Training", text: "Deine Mathe-Aufgaben für heute sind noch offen." };
}

/**
 * Bringt die bei ntfy geplanten Mitteilungen auf den Stand der Einstellung und schreibt das
 * Ergebnis nach `einstellung.geplant`. Gibt die erste Fehlermeldung zurück oder null.
 * Fehlgeschlagene Löschungen bleiben vermerkt und werden beim nächsten Abgleich wiederholt.
 */
export async function gleicheWeckerAb(einstellung, { heute, heuteErledigt, jetzt = Math.floor(Date.now() / 1000) }) {
  const aktiv = einstellung.an && istGueltigerKanal(einstellung.kanal);
  const soll = aktiv
    ? sollWecker({ uhrzeiten: einstellung.uhrzeiten, heute, heuteErledigt, jetzt }).map((wecker) => ({
        ...wecker,
        kanal: einstellung.kanal,
      }))
    : [];
  const { behalten, loeschen, senden } = abgleich(einstellung.geplant, soll, jetzt);

  const [loeschErgebnisse, sendeErgebnisse] = await Promise.all([
    Promise.allSettled(loeschen.map((wecker) => loesche(wecker.kanal, wecker.kennung))),
    Promise.allSettled(
      senden.map((wecker) =>
        sende(wecker.kanal, { ...weckerNachricht(), zeitpunkt: wecker.zeitpunkt, kennung: wecker.kennung }),
      ),
    ),
  ]);

  einstellung.geplant = [
    ...behalten,
    ...loeschen.filter((_, i) => loeschErgebnisse[i].status === "rejected"),
    ...senden.filter((_, i) => sendeErgebnisse[i].status === "fulfilled"),
  ];
  const fehler = [...loeschErgebnisse, ...sendeErgebnisse].find((ergebnis) => ergebnis.status === "rejected");
  return fehler ? fehler.reason.message : null;
}
