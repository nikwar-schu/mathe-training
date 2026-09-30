/**
 * Kariertes Rechenblatt für Apple Pencil, Maus und (optional) Finger.
 *
 * Striche werden als Punktlisten gespeichert und bei jeder Größenänderung neu gezeichnet. Der Stift
 * zeichnet, der Finger scrollt die Seite; so kann man mit aufgelegter Hand schreiben. Ein kurzer
 * Tipp mit zwei Fingern wechselt zwischen Stift und Radierer.
 */

import { ZweiFingerTipp } from "./zweifingertipp.js";

const STARTHOEHE = 1100;
const VERLAENGERUNG = 700;
const STIFTBREITE = 2.2;
const RADIERERBREITE = 22;
const DRUCK_STANDARD = 0.5;

function farbeAusToken(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#1a1a1a";
}

export class Zeichenblatt {
  /**
   * @param {HTMLElement} behaelter  Element, in das Leinwand und Werkzeugleiste eingefügt werden
   * @param {{striche: Array, hoehe: number} | null} gespeichert  vorheriger Stand
   * @param {(stand: {striche: Array, hoehe: number}) => void} beiAenderung
   */
  constructor(behaelter, gespeichert, beiAenderung) {
    this.striche = gespeichert?.striche ?? [];
    this.hoehe = gespeichert?.hoehe ?? STARTHOEHE;
    this.beiAenderung = beiAenderung;
    this.werkzeug = "stift";
    this.fingerZeichnet = false;
    this.aktiverStrich = null;
    this.fingerAufBlatt = new Set();

    this.baueOberflaeche(behaelter);
    this.verbindeEreignisse();
    new ResizeObserver(() => this.passeGroesseAn()).observe(this.flaeche);
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => this.zeichneAlles());
  }

  baueOberflaeche(behaelter) {
    const leiste = document.createElement("div");
    leiste.className = "werkzeuge";
    leiste.innerHTML = `
      <button type="button" data-werkzeug="stift" aria-pressed="true">Stift</button>
      <button type="button" data-werkzeug="radierer" aria-pressed="false">Radierer</button>
      <button type="button" data-aktion="rueckgaengig">Rückgängig</button>
      <button type="button" data-aktion="leeren">Leeren</button>
      <label class="finger"><input type="checkbox" data-aktion="finger"> mit Finger zeichnen</label>`;

    this.flaeche = document.createElement("div");
    this.flaeche.className = "karopapier";
    this.leinwand = document.createElement("canvas");
    this.flaeche.append(this.leinwand);
    this.kontext = this.leinwand.getContext("2d");

    const verlaengern = document.createElement("button");
    verlaengern.type = "button";
    verlaengern.className = "verlaengern";
    verlaengern.textContent = "Blatt verlängern";
    verlaengern.addEventListener("click", () => {
      this.hoehe += VERLAENGERUNG;
      this.passeGroesseAn();
      this.melden();
    });

    this.hinweis = document.createElement("div");
    this.hinweis.className = "werkzeug-hinweis";
    this.hinweis.setAttribute("role", "status");
    this.flaeche.append(this.hinweis);

    this.leiste = leiste;
    leiste.addEventListener("click", (ereignis) => this.werkzeugKlick(ereignis));
    behaelter.append(leiste, this.flaeche, verlaengern);
  }

  setzeWerkzeug(werkzeug) {
    this.werkzeug = werkzeug;
    this.leiste.querySelectorAll("[data-werkzeug]").forEach((knopf) => {
      knopf.setAttribute("aria-pressed", String(knopf.dataset.werkzeug === werkzeug));
    });
  }

  /** Zwei-Finger-Tipp: Stift und Radierer tauschen, mit kurzer Einblendung zur Bestätigung. */
  wechsleWerkzeug() {
    this.setzeWerkzeug(this.werkzeug === "stift" ? "radierer" : "stift");
    this.hinweis.textContent = this.werkzeug === "stift" ? "Stift" : "Radierer";
    this.hinweis.classList.remove("sichtbar");
    // Reflow erzwingen, damit die Einblendung auch bei schnellem Doppelwechsel neu startet.
    void this.hinweis.offsetWidth;
    this.hinweis.classList.add("sichtbar");
  }

  werkzeugKlick(ereignis) {
    const ziel = ereignis.target;
    if (ziel.dataset.werkzeug) {
      this.setzeWerkzeug(ziel.dataset.werkzeug);
    } else if (ziel.dataset.aktion === "rueckgaengig") {
      this.striche.pop();
      this.zeichneAlles();
      this.melden();
    } else if (ziel.dataset.aktion === "leeren" && this.striche.length > 0) {
      if (window.confirm("Das ganze Rechenblatt löschen?")) {
        this.striche = [];
        this.zeichneAlles();
        this.melden();
      }
    } else if (ziel.dataset.aktion === "finger") {
      this.fingerZeichnet = ziel.checked;
      this.flaeche.classList.toggle("finger-aktiv", this.fingerZeichnet);
    }
  }

  darfZeichnen(zeigerTyp) {
    return zeigerTyp !== "touch" || this.fingerZeichnet;
  }

  verbindeEreignisse() {
    // Safari scrollt sonst auch beim Schreiben mit dem Stift; Finger sollen weiter scrollen dürfen.
    const scrollenVerhindern = (ereignis) => {
      const stift = [...ereignis.touches].some((beruehrung) => beruehrung.touchType === "stylus");
      if (stift || this.fingerZeichnet) ereignis.preventDefault();
    };
    this.leinwand.addEventListener("touchstart", scrollenVerhindern, { passive: false });
    this.leinwand.addEventListener("touchmove", scrollenVerhindern, { passive: false });

    this.leinwand.addEventListener("pointerdown", (ereignis) => this.beginneStrich(ereignis));
    this.leinwand.addEventListener("pointermove", (ereignis) => this.setzeStrichFort(ereignis));
    this.leinwand.addEventListener("pointerup", (ereignis) => this.beendeStrich(ereignis));
    this.leinwand.addEventListener("pointercancel", (ereignis) => this.beendeStrich(ereignis));

    new ZweiFingerTipp(this.leinwand, () => this.wechsleWerkzeug());
  }

  /** Beim Zeichnen mit dem Finger: Kommt ein zweiter Finger dazu, war der erste kein Strich. */
  verwerfeFingerStrich() {
    if (this.aktiverStrich?.zeiger !== "touch") return;
    this.striche.pop();
    this.aktiverStrich = null;
    this.zeichneAlles();
  }

  punktAus(ereignis) {
    const rahmen = this.leinwand.getBoundingClientRect();
    const druck = ereignis.pointerType === "pen" && ereignis.pressure > 0 ? ereignis.pressure : DRUCK_STANDARD;
    return [
      Math.round((ereignis.clientX - rahmen.left) * 10) / 10,
      Math.round((ereignis.clientY - rahmen.top) * 10) / 10,
      Math.round(druck * 100) / 100,
    ];
  }

  beginneStrich(ereignis) {
    if (ereignis.pointerType === "touch") this.fingerAufBlatt.add(ereignis.pointerId);
    if (this.fingerAufBlatt.size > 1) {
      this.verwerfeFingerStrich();
      return;
    }
    if (!this.darfZeichnen(ereignis.pointerType) || ereignis.button > 0) return;
    this.leinwand.setPointerCapture(ereignis.pointerId);
    this.aktiverStrich = { werkzeug: this.werkzeug, punkte: [this.punktAus(ereignis)] };
    // Nicht aufzählbar, damit der Zeigertyp nicht mit ins gespeicherte JSON wandert.
    Object.defineProperty(this.aktiverStrich, "zeiger", { value: ereignis.pointerType, enumerable: false });
    this.striche.push(this.aktiverStrich);
    this.zeichneStrich(this.aktiverStrich, 0);
  }

  setzeStrichFort(ereignis) {
    if (!this.aktiverStrich) return;
    const ereignisse = ereignis.getCoalescedEvents?.() ?? [ereignis];
    const start = this.aktiverStrich.punkte.length - 1;
    ereignisse.forEach((einzeln) => this.aktiverStrich.punkte.push(this.punktAus(einzeln)));
    this.zeichneStrich(this.aktiverStrich, start);
  }

  beendeStrich(ereignis) {
    this.fingerAufBlatt.delete(ereignis.pointerId);
    if (!this.aktiverStrich) return;
    this.aktiverStrich = null;
    this.melden();
  }

  /** Zeichnet einen Strich ab Punkt `ab`; Radierer löschen über destination-out. */
  zeichneStrich(strich, ab) {
    const k = this.kontext;
    const radiert = strich.werkzeug === "radierer";
    k.globalCompositeOperation = radiert ? "destination-out" : "source-over";
    k.strokeStyle = farbeAusToken("--tinte");
    k.fillStyle = k.strokeStyle;
    k.lineCap = "round";
    k.lineJoin = "round";

    const punkte = strich.punkte;
    if (punkte.length === 1) {
      const [x, y, druck] = punkte[0];
      const radius = radiert ? RADIERERBREITE / 2 : STIFTBREITE * (0.5 + druck) / 2;
      k.beginPath();
      k.arc(x, y, radius, 0, Math.PI * 2);
      k.fill();
      return;
    }
    for (let i = Math.max(ab, 0) + 1; i < punkte.length; i += 1) {
      const [x0, y0] = punkte[i - 1];
      const [x1, y1, druck] = punkte[i];
      k.lineWidth = radiert ? RADIERERBREITE : STIFTBREITE * (0.5 + druck);
      k.beginPath();
      k.moveTo(x0, y0);
      k.lineTo(x1, y1);
      k.stroke();
    }
  }

  zeichneAlles() {
    const pixel = window.devicePixelRatio || 1;
    this.kontext.setTransform(pixel, 0, 0, pixel, 0, 0);
    this.kontext.clearRect(0, 0, this.leinwand.width, this.leinwand.height);
    this.striche.forEach((strich) => this.zeichneStrich(strich, 0));
  }

  passeGroesseAn() {
    const pixel = window.devicePixelRatio || 1;
    const breite = this.flaeche.clientWidth;
    this.flaeche.style.height = `${this.hoehe}px`;
    this.leinwand.width = Math.round(breite * pixel);
    this.leinwand.height = Math.round(this.hoehe * pixel);
    this.leinwand.style.width = `${breite}px`;
    this.leinwand.style.height = `${this.hoehe}px`;
    this.zeichneAlles();
  }

  melden() {
    this.beiAenderung({ striche: this.striche, hoehe: this.hoehe });
  }
}
