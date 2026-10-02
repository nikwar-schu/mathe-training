/**
 * Regeln des Tagesablaufs, unabhängig von der Oberfläche: Versuche, Abschluss, Serie und
 * der Text der Nachricht an den Vater.
 */

export const MAX_VERSUCHE = 2;
export const MIN_GRUND_LAENGE = 10;
export const ZEITZONE = "Europe/Berlin";

export const STATUS = Object.freeze({
  offen: "offen",
  richtig: "richtig",
  falsch: "falsch",
  uebersprungen: "uebersprungen",
});

/** Heutiges Datum in deutscher Zeit als JJJJ-MM-TT. */
export function heutigesDatum(jetzt = new Date()) {
  return jetzt.toLocaleDateString("sv-SE", { timeZone: ZEITZONE });
}

/** Abstand der deutschen Ortszeit zu UTC in Millisekunden (1 h im Winter, 2 h im Sommer). */
function versatzZuUtc(zeitpunkt) {
  const teile = new Intl.DateTimeFormat("en-US", {
    timeZone: ZEITZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(zeitpunkt));
  const wert = (typ) => Number(teile.find((teil) => teil.type === typ).value);
  const ortszeitAlsUtc = Date.UTC(wert("year"), wert("month") - 1, wert("day"), wert("hour"), wert("minute"), wert("second"));
  return ortszeitAlsUtc - zeitpunkt;
}

/**
 * Unix-Zeit (Sekunden) der Mitternacht deutscher Zeit, mit der `datum` endet.
 * Die Zeitumstellung liegt immer um 1 Uhr UTC, also nach dieser Mitternacht; deshalb stimmt der
 * Versatz, der zur selben Mitternacht in UTC gilt.
 */
export function mitternachtNach(datum) {
  const [jahr, monat, tag] = datum.split("-").map(Number);
  const mitternachtUtc = Date.UTC(jahr, monat - 1, tag + 1);
  return (mitternachtUtc - versatzZuUtc(mitternachtUtc)) / 1000;
}

/**
 * Unix-Zeit (Sekunden) von `uhrzeit` (HH:MM) deutscher Zeit am Tag `datum`.
 * Der Versatz wird zweimal bestimmt, weil eine Uhrzeit kurz nach der Zeitumstellung sonst den
 * Versatz des Vortags bekäme.
 */
export function zeitpunktAm(datum, uhrzeit) {
  const [jahr, monat, tag] = datum.split("-").map(Number);
  const [stunde, minute] = uhrzeit.split(":").map(Number);
  const ortszeitAlsUtc = Date.UTC(jahr, monat - 1, tag, stunde, minute);
  const geschaetzt = ortszeitAlsUtc - versatzZuUtc(ortszeitAlsUtc);
  return (ortszeitAlsUtc - versatzZuUtc(geschaetzt)) / 1000;
}

/** Kalenderdatum `tage` Tage nach `datum` (negativ: davor), beides als JJJJ-MM-TT. */
export function tagNach(datum, tage) {
  const d = new Date(`${datum}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

export function kurzesDatum(datum) {
  const [, monat, tag] = datum.split("-");
  return `${tag}.${monat}.`;
}

export function istErledigt(aufgabe) {
  return aufgabe.status !== STATUS.offen;
}

export function istTagAbgeschlossen(tag) {
  return tag.aufgaben.every(istErledigt);
}

function sicherstellenOffen(aufgabe) {
  if (istErledigt(aufgabe)) {
    throw new Error("Diese Aufgabe ist schon erledigt.");
  }
}

/** Wertet einen Prüfversuch aus und aktualisiert die Aufgabe. */
export function versuchVerbuchen(aufgabe, richtig) {
  sicherstellenOffen(aufgabe);
  aufgabe.versuche += 1;
  if (richtig) {
    aufgabe.status = STATUS.richtig;
  } else if (aufgabe.versuche >= MAX_VERSUCHE) {
    aufgabe.status = STATUS.falsch;
  }
  return aufgabe.status;
}

export function ueberspringen(aufgabe, grund) {
  sicherstellenOffen(aufgabe);
  const bereinigt = grund.trim();
  if (bereinigt.length < MIN_GRUND_LAENGE) {
    throw new Error(`Bitte schreib einen richtigen Grund (mindestens ${MIN_GRUND_LAENGE} Zeichen).`);
  }
  aufgabe.status = STATUS.uebersprungen;
  aufgabe.grund = bereinigt;
}

/** Tage in Folge mit abgeschlossenem Training; ein komplett übersprungener Tag unterbricht die Serie. */
export function serie(tage, heute) {
  const zaehlt = (datum) => {
    const tag = tage[datum];
    return Boolean(tag) && istTagAbgeschlossen(tag) && tag.aufgaben.some((a) => a.status !== STATUS.uebersprungen);
  };
  const tagDavor = (datum) => tagNach(datum, -1);

  let datum = zaehlt(heute) ? heute : tagDavor(heute);
  let anzahl = 0;
  while (zaehlt(datum)) {
    anzahl += 1;
    datum = tagDavor(datum);
  }
  return anzahl;
}

function zeileFuer(aufgabe, nummer, stufe) {
  const kopf = `Aufgabe ${nummer} (${stufe})`;
  switch (aufgabe.status) {
    case STATUS.richtig:
      return `${kopf}: richtig im ${aufgabe.versuche}. Versuch`;
    case STATUS.falsch:
      return `${kopf}: falsch nach ${aufgabe.versuche} Versuchen`;
    case STATUS.uebersprungen:
      return `${kopf}: übersprungen. Grund: „${aufgabe.grund}“`;
    default:
      return `${kopf}: noch offen`;
  }
}

/** Nachricht für Mitternacht, falls die Aufgaben von `datum` bis dahin nicht erledigt sind. */
export function erinnerungNachricht(datum) {
  return {
    titel: `Niklas, Mathe ${kurzesDatum(datum)}: nicht erledigt`,
    text: "Niklas hat gestern die Aufgaben nicht erledigt.",
  };
}

/** Baut die Nachricht an den Vater, sobald alle Aufgaben des Tages erledigt sind. */
export function abschlussNachricht({ datum, aufgaben, tag, thema, serieTage }) {
  const richtig = tag.aufgaben.filter((a) => a.status === STATUS.richtig).length;
  const zeilen = tag.aufgaben.map((a, i) => zeileFuer(a, i + 1, aufgaben[i].stufe));
  zeilen.push(`Thema: ${thema}`);
  if (serieTage > 1) zeilen.push(`${serieTage} Tage in Folge geübt`);
  return {
    titel: `Niklas, Mathe ${kurzesDatum(datum)}: ${richtig} von ${tag.aufgaben.length} richtig`,
    text: zeilen.join("\n"),
  };
}
