/**
 * Oberfläche der Trainings-App: lädt die Aufgaben des Tages, baut die Karten auf und verbindet
 * Eingaben mit Prüfung, Ablaufregeln und Benachrichtigung.
 */

import {
  MAX_VERSUCHE,
  STATUS,
  abschlussNachricht,
  heutigesDatum,
  istErledigt,
  istTagAbgeschlossen,
  serie,
  ueberspringen,
  versuchVerbuchen,
} from "./ablauf.js";
import { MARKIERUNG_ABGESCHLOSSEN, istGueltigerKanal, sende } from "./benachrichtigung.js";
import { hilfeInhalt } from "./hilfe.js";
import { EingabeFehler } from "./rechner.js";
import { entschluesseln, pruefeEingaben } from "./pruefung.js";
import { ladeBlatt, ladeZustand, raeumeBlaetterAuf, speichereBlatt, speichereZustand, tagesstand } from "./speicher.js";
import { Zeichenblatt } from "./zeichenblatt.js";

const DATEN_URL = "data/heute.json";
const KANAL_HASH_PRAEFIX = "#kanal=";
const STATUS_TEXTE = {
  [STATUS.offen]: "",
  [STATUS.richtig]: "richtig",
  [STATUS.falsch]: "falsch",
  [STATUS.uebersprungen]: "übersprungen",
};

const zustand = ladeZustand();
const heute = heutigesDatum();
let daten = null;
let tag = null;
let geheimCache = null;
let laufenderAbschluss = null;

const $ = (auswahl, wurzel = document) => wurzel.querySelector(auswahl);

function formeln(element) {
  if (typeof window.renderMathInElement !== "function") return;
  window.renderMathInElement(element, {
    // $…$ kommt aus den Aufgaben, \(…\) und \[…\] aus der Zusammenfassung (Hilfe).
    delimiters: [
      { left: "$$", right: "$$", display: true },
      { left: "\\[", right: "\\]", display: true },
      { left: "$", right: "$", display: false },
      { left: "\\(", right: "\\)", display: false },
    ],
    throwOnError: false,
  });
}

/** Setzt Text sicher (ohne HTML) und wandelt Zeilenumbrüche in Absätze um. */
function setzeText(element, text) {
  element.replaceChildren(
    ...text.split(/\n{2,}/).map((absatz) => {
      const p = document.createElement("p");
      absatz.split("\n").forEach((zeile, i) => {
        if (i > 0) p.append(document.createElement("br"));
        p.append(zeile);
      });
      return p;
    }),
  );
  formeln(element);
}

function speichern() {
  if (!speichereZustand(zustand)) {
    zeigeHinweis("Der Fortschritt konnte auf diesem Gerät nicht gespeichert werden (privater Modus?).");
  }
}

function zeigeHinweis(text) {
  const hinweis = $("#hinweis");
  hinweis.textContent = text;
  hinweis.hidden = false;
}

async function geheimnis() {
  geheimCache ??= await entschluesseln(daten.geheim);
  return geheimCache;
}

/* ---------- Hilfe ---------- */

async function oeffneHilfe() {
  const dialog = $("#hilfe");
  const inhalt = $("#hilfe-inhalt");
  if (!inhalt.hasChildNodes()) {
    try {
      const { titel, html } = await entschluesseln(daten.hilfe);
      $("#hilfe-titel").textContent = titel;
      inhalt.replaceChildren(hilfeInhalt(html));
      formeln(inhalt);
    } catch {
      inhalt.textContent = "Der Aufschrieb konnte nicht geladen werden.";
    }
  }
  dialog.showModal();
  inhalt.scrollTop = 0;
}

/* ---------- Kopfzeile ---------- */

function aktualisiereKopf() {
  const [jahr, monat, tagZahl] = daten.datum.split("-");
  $("#datum").textContent = `${tagZahl}.${monat}.${jahr}`;
  const tage = serie(zustand.tage, heute);
  $("#serie").textContent = tage > 0 ? `${tage} ${tage === 1 ? "Tag" : "Tage"} in Folge` : "";
}

/* ---------- Aufgabenkarten ---------- */

async function zeigeLoesung(karte, nummer) {
  const bereich = $(".loesung", karte);
  try {
    const { aufgaben } = await geheimnis();
    const loesung = aufgaben[nummer];
    const liste = document.createElement("ol");
    loesung.loesung.forEach((schritt) => {
      const punkt = document.createElement("li");
      setzeText(punkt, schritt);
      liste.append(punkt);
    });
    const ergebnis = document.createElement("p");
    ergebnis.className = "ergebnis";
    setzeText(ergebnis, `Ergebnis: ${loesung.ergebnis.map((e) => `$${e}$`).join(", ")}`);
    bereich.replaceChildren(Object.assign(document.createElement("h3"), { textContent: "Musterlösung" }), liste, ergebnis);
  } catch {
    bereich.textContent = "Die Musterlösung konnte nicht entschlüsselt werden.";
  }
  bereich.hidden = false;
}

function aktualisiereKarte(karte, nummer) {
  const aufgabe = tag.aufgaben[nummer];
  const erledigt = istErledigt(aufgabe);
  karte.dataset.status = aufgabe.status;
  $(".status", karte).textContent = STATUS_TEXTE[aufgabe.status];
  $(".antwort", karte).querySelectorAll("input, button").forEach((feld) => {
    feld.disabled = erledigt;
  });
  $(".ueberspringen", karte).hidden = erledigt;

  const rest = MAX_VERSUCHE - aufgabe.versuche;
  $(".versuche", karte).textContent = erledigt ? "" : `${rest} ${rest === 1 ? "Versuch" : "Versuche"} übrig`;

  if (aufgabe.status === STATUS.uebersprungen) {
    $(".meldung", karte).textContent = `Übersprungen: „${aufgabe.grund}“`;
  }
  if (erledigt && $(".loesung", karte).hidden) zeigeLoesung(karte, nummer);
}

async function pruefen(karte, nummer, ereignis) {
  ereignis.preventDefault();
  const meldung = $(".meldung", karte);
  const eingaben = [...karte.querySelectorAll(".antwort input")].map((feld) => feld.value);
  let richtig;
  try {
    richtig = await pruefeEingaben(daten.aufgaben[nummer], eingaben);
  } catch (fehler) {
    meldung.textContent = fehler instanceof EingabeFehler ? fehler.message : "Die Prüfung ist fehlgeschlagen.";
    meldung.dataset.art = "fehler";
    return;
  }

  let status;
  try {
    status = versuchVerbuchen(tag.aufgaben[nummer], richtig);
  } catch {
    // Doppeltipp auf „Prüfen“: die Aufgabe wurde schon vom ersten Tipp abgeschlossen.
    return;
  }
  speichern();
  meldung.dataset.art = richtig ? "richtig" : "fehler";
  if (richtig) {
    meldung.textContent = "Richtig!";
  } else if (status === STATUS.falsch) {
    meldung.textContent = "Leider wieder falsch. Schau dir die Musterlösung an.";
  } else {
    meldung.textContent = "Noch nicht richtig. Prüf deinen Rechenweg und versuch es nochmal.";
  }
  aktualisiereKarte(karte, nummer);
  await pruefeAbschluss();
}

function verbindeUeberspringen(karte, nummer) {
  const bereich = $(".ueberspringen", karte);
  const formular = $("form", bereich);
  $(".ueberspringen-start", bereich).addEventListener("click", () => {
    formular.hidden = false;
    $("textarea", formular).focus();
  });
  $(".abbrechen", formular).addEventListener("click", () => {
    formular.hidden = true;
  });
  formular.addEventListener("submit", async (ereignis) => {
    ereignis.preventDefault();
    try {
      ueberspringen(tag.aufgaben[nummer], $("textarea", formular).value);
    } catch (fehler) {
      $(".grund-meldung", formular).textContent = fehler.message;
      return;
    }
    speichern();
    aktualisiereKarte(karte, nummer);
    await pruefeAbschluss();
  });
}

function baueKarte(aufgabe, nummer) {
  const karte = $("#vorlage-aufgabe").content.firstElementChild.cloneNode(true);
  $(".nummer", karte).textContent = `Aufgabe ${nummer + 1}`;
  $(".stufe", karte).textContent = aufgabe.stufe;
  setzeText($(".aufgabentext", karte), aufgabe.text);
  const hilfeKnopf = $(".hilfe-knopf", karte);
  hilfeKnopf.hidden = !daten.hilfe;
  hilfeKnopf.addEventListener("click", oeffneHilfe);

  const felder = $(".felder", karte);
  aufgabe.felder.forEach((bezeichnung, i) => {
    const label = document.createElement("label");
    const name = document.createElement("span");
    name.className = "feldname";
    name.textContent = `$${bezeichnung} =$`;
    const eingabe = Object.assign(document.createElement("input"), {
      type: "text",
      name: `feld-${i}`,
      autocomplete: "off",
      spellcheck: false,
    });
    eingabe.setAttribute("autocapitalize", "off");
    eingabe.setAttribute("autocorrect", "off");
    label.append(name, eingabe);
    felder.append(label);
    formeln(name);
  });

  new Zeichenblatt($(".blatt", karte), ladeBlatt(daten.datum, nummer), (stand) => {
    speichereBlatt(daten.datum, nummer, stand);
  });

  $(".antwort", karte).addEventListener("submit", (ereignis) => pruefen(karte, nummer, ereignis));
  verbindeUeberspringen(karte, nummer);
  aktualisiereKarte(karte, nummer);
  return karte;
}

/* ---------- Abschluss und Nachricht ---------- */

async function meldeAbschluss() {
  const bereich = $("#abschluss");
  const status = $("#abschluss-status");
  const knopf = $("#erneut-senden");
  knopf.hidden = true;
  status.textContent = "Nachricht an Papa wird gesendet …";
  try {
    const { thema } = await geheimnis();
    $("#thema").textContent = `Heute war dran: ${thema}`;
    const nachricht = abschlussNachricht({
      datum: daten.datum,
      aufgaben: daten.aufgaben,
      tag,
      thema,
      serieTage: serie(zustand.tage, heute),
    });
    await sende(zustand.kanal, { ...nachricht, markierungen: [MARKIERUNG_ABGESCHLOSSEN] });
    tag.gemeldet = true;
    speichern();
    status.textContent = "Fertig für heute. Papa hat eine Nachricht bekommen.";
  } catch (fehler) {
    status.textContent = `Die Nachricht ist nicht rausgegangen: ${fehler.message}`;
    knopf.hidden = false;
  }
  bereich.hidden = false;
}

/** Nur ein Abschluss gleichzeitig, damit ein Doppeltipp keine zweite Nachricht auslöst. */
function pruefeAbschluss() {
  laufenderAbschluss ??= abschliessen().finally(() => {
    laufenderAbschluss = null;
  });
  return laufenderAbschluss;
}

async function abschliessen() {
  aktualisiereKopf();
  if (!istTagAbgeschlossen(tag)) return;
  if (tag.gemeldet) {
    const { thema } = await geheimnis();
    $("#thema").textContent = `Heute war dran: ${thema}`;
    $("#abschluss-status").textContent = "Fertig für heute. Papa hat eine Nachricht bekommen.";
    $("#abschluss").hidden = false;
    return;
  }
  await meldeAbschluss();
}

/* ---------- Einstellungen ---------- */

function oeffneEinstellungen() {
  const dialog = $("#einstellungen");
  $("#kanal").value = zustand.kanal;
  $("#einstellungen-meldung").textContent = "";
  dialog.showModal();
}

function verbindeEinstellungen() {
  const dialog = $("#einstellungen");
  const meldung = $("#einstellungen-meldung");
  const kanalAusFeld = () => $("#kanal").value.trim();

  $("#einstellungen-oeffnen").addEventListener("click", oeffneEinstellungen);
  $("#einstellungen-schliessen").addEventListener("click", () => dialog.close());

  $("#test-senden").addEventListener("click", async () => {
    meldung.textContent = "Sende Testnachricht …";
    try {
      await sende(kanalAusFeld(), {
        titel: "Mathe-Training: Test",
        text: "Wenn du das liest, kommen die Nachrichten von Niklas' Mathe-App bei dir an.",
      });
      meldung.textContent = "Testnachricht gesendet. Ist sie auf dem Handy angekommen?";
    } catch (fehler) {
      meldung.textContent = fehler.message;
    }
  });

  $("#einstellungen-formular").addEventListener("submit", (ereignis) => {
    const kanal = kanalAusFeld();
    if (!istGueltigerKanal(kanal)) {
      ereignis.preventDefault();
      meldung.textContent = "Der Kanalname muss 16 bis 64 Zeichen lang sein (Buchstaben, Ziffern, - und _).";
      return;
    }
    zustand.kanal = kanal;
    speichern();
  });

  $("#erneut-senden").addEventListener("click", pruefeAbschluss);
  $("#hilfe-schliessen").addEventListener("click", () => $("#hilfe").close());
}

/** Übernimmt einen Kanal aus einem Einrichtungslink (…/#kanal=…) und entfernt ihn aus der Adresse. */
function kanalAusLink() {
  if (!location.hash.startsWith(KANAL_HASH_PRAEFIX)) return;
  const kanal = decodeURIComponent(location.hash.slice(KANAL_HASH_PRAEFIX.length));
  if (istGueltigerKanal(kanal)) {
    zustand.kanal = kanal;
    speichern();
  }
  history.replaceState(null, "", location.pathname);
}

/* ---------- Start ---------- */

async function ladeDaten() {
  const antwort = await fetch(`${DATEN_URL}?t=${Date.now()}`, { cache: "no-store" });
  if (!antwort.ok) throw new Error(`Status ${antwort.status}`);
  return antwort.json();
}

async function start() {
  verbindeEinstellungen();
  kanalAusLink();

  try {
    daten = await ladeDaten();
  } catch {
    zeigeHinweis("Die Aufgaben konnten nicht geladen werden. Bist du online? Lade die Seite später neu.");
    return;
  }

  if (daten.datum !== heute) {
    zeigeHinweis("Die neuen Aufgaben kommen jeden Morgen gegen 6:30 Uhr. Bis dahin siehst du die letzten.");
  }

  raeumeBlaetterAuf(heute);
  tag = tagesstand(zustand, daten.datum, daten.aufgaben.length);
  speichern();

  $("#aufgaben").replaceChildren(...daten.aufgaben.map(baueKarte));
  aktualisiereKopf();
  if (!zustand.kanal) oeffneEinstellungen();
  await pruefeAbschluss();
}

start();
