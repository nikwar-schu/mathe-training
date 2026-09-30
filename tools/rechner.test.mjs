import { test } from "node:test";
import assert from "node:assert/strict";

import { berechne, EingabeFehler } from "../js/rechner.js";
import { entschluesseln, hashErgebnis, kanonisch, pruefeEingaben, runden, verschluesseln } from "../js/pruefung.js";

const nah = (ist, soll) => assert.ok(Math.abs(ist - soll) < 1e-9, `${ist} statt ${soll}`);

test("Grundrechenarten und Punkt vor Strich", () => {
  nah(berechne("2+3*4"), 14);
  nah(berechne("32/3"), 32 / 3);
  nah(berechne("2,5 - 0,5"), 2);
});

test("Potenzen: rechtsassoziativ, Minus davor gilt für die ganze Potenz", () => {
  nah(berechne("2^3^2"), 512);
  nah(berechne("-2^2"), -4);
  nah(berechne("2^-1"), 0.5);
  nah(berechne("3²"), 9);
});

test("Funktionen, Konstanten und implizite Multiplikation", () => {
  nah(berechne("sqrt(2)"), Math.SQRT2);
  nah(berechne("2√3"), 2 * Math.sqrt(3));
  nah(berechne("ln(e^2)"), 2);
  nah(berechne("2pi"), 2 * Math.PI);
  nah(berechne("3(1+1)"), 6);
  nah(berechne("−4 · 2"), -8);
});

test("Unverständliche Eingaben werfen EingabeFehler", () => {
  for (const eingabe of ["", "2+", "(1+2", "x+1", "5 % 2", "1/0"]) {
    assert.throws(() => berechne(eingabe), EingabeFehler, eingabe);
  }
});

test("Runden und kanonische Form", () => {
  assert.equal(runden(1.005), 1.01);
  assert.equal(runden(-0.001), 0);
  assert.equal(kanonisch([3, -2], true), "-2.00|3.00");
  assert.equal(kanonisch([3, -2], false), "3.00|-2.00");
});

test("Exakte und gerundete Eingabe gelten beide als richtig", async () => {
  const salz = "abc";
  const aufgabe = { salz, ungeordnet: true, hash: await hashErgebnis(salz, kanonisch([32 / 3, -1], true)) };
  assert.equal(await pruefeEingaben(aufgabe, ["-1", "32/3"]), true);
  assert.equal(await pruefeEingaben(aufgabe, ["10,67", "-1"]), true);
  assert.equal(await pruefeEingaben(aufgabe, ["10,7", "-1"]), false);
});

test("Verschlüsselung ist umkehrbar", async () => {
  const geheim = { thema: "Kettenregel", schritte: ["$f'(x) = 2x$"] };
  assert.deepEqual(await entschluesseln(await verschluesseln(geheim)), geheim);
});
