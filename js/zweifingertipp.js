/**
 * Erkennt einen kurzen Tipp mit zwei Fingern. Ersatz für die Pencil-Gesten (Drücken, Doppeltippen),
 * die Safari nicht an Webseiten weitergibt. Stift-Berührungen zählen nicht mit, damit man beim
 * Schreiben mit aufgelegter Hand nichts auslöst.
 */

const MAX_DAUER_MS = 350;
const MAX_BEWEGUNG_PX = 12;
const ANZAHL_FINGER = 2;

function finger(beruehrungen) {
  return [...beruehrungen].filter((beruehrung) => beruehrung.touchType !== "stylus");
}

export class ZweiFingerTipp {
  /**
   * @param {HTMLElement} element  Fläche, auf der getippt wird
   * @param {() => void} beiTipp  wird nach einem erkannten Tipp aufgerufen
   */
  constructor(element, beiTipp) {
    this.beiTipp = beiTipp;
    this.kandidat = null;
    const optionen = { passive: true };
    element.addEventListener("touchstart", (e) => this.start(e), optionen);
    element.addEventListener("touchmove", (e) => this.bewegung(e), optionen);
    element.addEventListener("touchend", (e) => this.ende(e), optionen);
    element.addEventListener("touchcancel", () => {
      this.kandidat = null;
    }, optionen);
  }

  start(ereignis) {
    const aufgelegt = finger(ereignis.touches);
    if (aufgelegt.length === ANZAHL_FINGER && !this.kandidat) {
      this.kandidat = {
        beginn: performance.now(),
        startpunkte: new Map(aufgelegt.map((b) => [b.identifier, [b.clientX, b.clientY]])),
      };
    } else if (aufgelegt.length > ANZAHL_FINGER) {
      this.kandidat = null;
    }
  }

  bewegung(ereignis) {
    if (!this.kandidat) return;
    const verrutscht = finger(ereignis.changedTouches).some((b) => {
      const start = this.kandidat.startpunkte.get(b.identifier);
      return start && Math.hypot(b.clientX - start[0], b.clientY - start[1]) > MAX_BEWEGUNG_PX;
    });
    if (verrutscht) this.kandidat = null;
  }

  ende(ereignis) {
    if (!this.kandidat || finger(ereignis.touches).length > 0) return;
    const kurz = performance.now() - this.kandidat.beginn <= MAX_DAUER_MS;
    this.kandidat = null;
    if (kurz) this.beiTipp();
  }
}
