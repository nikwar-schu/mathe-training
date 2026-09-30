/**
 * Wertet mathematische Eingaben wie "32/3", "2√3", "-ln(2)" oder "e^2 - 1" sicher aus (ohne eval).
 * Wird von der App und vom Erstellungsskript gemeinsam genutzt, damit beide gleich rechnen.
 */

export class EingabeFehler extends Error {
  constructor(nachricht) {
    super(nachricht);
    this.name = "EingabeFehler";
  }
}

const FUNKTIONEN = {
  sqrt: Math.sqrt,
  wurzel: Math.sqrt,
  ln: Math.log,
  log: Math.log10,
  lg: Math.log10,
  exp: Math.exp,
  abs: Math.abs,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
};

const KONSTANTEN = {
  pi: Math.PI,
  e: Math.E,
};

// Schreibweisen vom iPad (Scribble, Sonderzeichen-Tastatur) auf die Grundform bringen.
const ERSETZUNGEN = [
  [/[−–]/g, "-"],
  [/[·×⋅]/g, "*"],
  [/÷/g, "/"],
  [/π/g, "pi"],
  [/²/g, "^2"],
  [/³/g, "^3"],
  [/,/g, "."],
];

function vorbereiten(eingabe) {
  return ERSETZUNGEN.reduce((text, [muster, ersatz]) => text.replace(muster, ersatz), eingabe)
    .trim()
    .toLowerCase();
}

function zerlegen(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const zeichen = text[i];
    if (/\s/.test(zeichen)) {
      i += 1;
    } else if (/[0-9.]/.test(zeichen)) {
      const treffer = /^[0-9]*\.?[0-9]+|^[0-9]+\.?/.exec(text.slice(i));
      const zahl = Number(treffer[0]);
      if (Number.isNaN(zahl)) {
        throw new EingabeFehler(`„${treffer[0]}“ ist keine gültige Zahl.`);
      }
      tokens.push({ art: "zahl", wert: zahl });
      i += treffer[0].length;
    } else if (/[a-zäöü]/.test(zeichen)) {
      const name = /^[a-zäöü]+/.exec(text.slice(i))[0];
      tokens.push({ art: "name", wert: name });
      i += name.length;
    } else if ("+-*/^()√".includes(zeichen)) {
      tokens.push({ art: "zeichen", wert: zeichen });
      i += 1;
    } else {
      throw new EingabeFehler(`Das Zeichen „${zeichen}“ verstehe ich nicht.`);
    }
  }
  return tokens;
}

/** Rekursiver Abstieg: Summe > Produkt > Vorzeichen > Potenz > Grundausdruck. */
class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.position = 0;
  }

  get aktuell() {
    return this.tokens[this.position];
  }

  istZeichen(wert) {
    return this.aktuell?.art === "zeichen" && this.aktuell.wert === wert;
  }

  beginntGrundausdruck() {
    const token = this.aktuell;
    if (!token) return false;
    return token.art === "zahl" || token.art === "name" || token.wert === "(" || token.wert === "√";
  }

  lesen() {
    const wert = this.summe();
    if (this.aktuell) {
      throw new EingabeFehler("Die Eingabe ist unvollständig oder hat überzählige Zeichen.");
    }
    return wert;
  }

  summe() {
    let wert = this.produkt();
    while (this.istZeichen("+") || this.istZeichen("-")) {
      const operator = this.aktuell.wert;
      this.position += 1;
      const rechts = this.produkt();
      wert = operator === "+" ? wert + rechts : wert - rechts;
    }
    return wert;
  }

  produkt() {
    let wert = this.vorzeichen();
    for (;;) {
      if (this.istZeichen("*") || this.istZeichen("/")) {
        const operator = this.aktuell.wert;
        this.position += 1;
        const rechts = this.vorzeichen();
        wert = operator === "*" ? wert * rechts : wert / rechts;
      } else if (this.beginntGrundausdruck()) {
        // Implizite Multiplikation wie in "2pi" oder "3(x+1)".
        wert *= this.potenz();
      } else {
        return wert;
      }
    }
  }

  vorzeichen() {
    if (this.istZeichen("-")) {
      this.position += 1;
      return -this.vorzeichen();
    }
    if (this.istZeichen("+")) {
      this.position += 1;
      return this.vorzeichen();
    }
    return this.potenz();
  }

  potenz() {
    const basis = this.grundausdruck();
    if (this.istZeichen("^")) {
      this.position += 1;
      return basis ** this.vorzeichen();
    }
    return basis;
  }

  grundausdruck() {
    const token = this.aktuell;
    if (!token) {
      throw new EingabeFehler("Da fehlt noch etwas am Ende.");
    }
    this.position += 1;

    if (token.art === "zahl") return token.wert;

    if (token.wert === "(") {
      const wert = this.summe();
      if (!this.istZeichen(")")) {
        throw new EingabeFehler("Eine Klammer wird nicht geschlossen.");
      }
      this.position += 1;
      return wert;
    }

    if (token.wert === "√") return Math.sqrt(this.potenz());

    if (token.art === "name") {
      if (token.wert in KONSTANTEN) return KONSTANTEN[token.wert];
      if (token.wert in FUNKTIONEN) return FUNKTIONEN[token.wert](this.potenz());
      throw new EingabeFehler(`„${token.wert}“ kenne ich nicht. Erlaubt sind z. B. sqrt, ln, e, pi.`);
    }

    throw new EingabeFehler(`An der Stelle „${token.wert}“ habe ich eine Zahl erwartet.`);
  }
}

/** Berechnet den Zahlenwert einer Eingabe; wirft EingabeFehler mit verständlicher Meldung. */
export function berechne(eingabe) {
  if (typeof eingabe !== "string" || eingabe.trim() === "") {
    throw new EingabeFehler("Bitte ein Ergebnis eintragen.");
  }
  const wert = new Parser(zerlegen(vorbereiten(eingabe))).lesen();
  if (!Number.isFinite(wert)) {
    throw new EingabeFehler("Das Ergebnis ist keine endliche Zahl (z. B. Division durch 0).");
  }
  return wert;
}
