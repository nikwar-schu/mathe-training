import { test } from "node:test";
import assert from "node:assert/strict";

import { STATUS, abschlussNachricht, heutigesDatum, serie, ueberspringen, versuchVerbuchen } from "../js/ablauf.js";

const offen = () => ({ status: STATUS.offen, versuche: 0, grund: "" });
const tagMit = (...status) => ({ aufgaben: status.map((s) => ({ status: s, versuche: 1, grund: "" })), gemeldet: true });

test("Nach zwei Fehlversuchen ist die Aufgabe falsch, danach ist sie gesperrt", () => {
  const aufgabe = offen();
  assert.equal(versuchVerbuchen(aufgabe, false), STATUS.offen);
  assert.equal(versuchVerbuchen(aufgabe, false), STATUS.falsch);
  assert.throws(() => versuchVerbuchen(aufgabe, true));
});

test("Überspringen braucht einen Grund und geht nur einmal", () => {
  const aufgabe = offen();
  assert.throws(() => ueberspringen(aufgabe, "  nö  "));
  ueberspringen(aufgabe, "Morgen Klausur in Deutsch");
  assert.equal(aufgabe.status, STATUS.uebersprungen);
  assert.throws(() => ueberspringen(aufgabe, "noch ein anderer Grund"));
});

test("Serie zählt zusammenhängende Tage, komplett übersprungene Tage unterbrechen", () => {
  const tage = {
    "2026-10-01": tagMit(STATUS.uebersprungen, STATUS.uebersprungen),
    "2026-10-02": tagMit(STATUS.richtig, STATUS.falsch),
    "2026-10-03": tagMit(STATUS.richtig, STATUS.uebersprungen),
    "2026-10-04": tagMit(STATUS.richtig, STATUS.offen),
  };
  assert.equal(serie(tage, "2026-10-04"), 2);
  assert.equal(serie(tage, "2026-10-03"), 2);
  assert.equal(serie(tage, "2026-10-06"), 0);
});

test("Nachricht an den Vater enthält Ergebnis, Grund und Thema", () => {
  const tag = tagMit(STATUS.richtig, STATUS.uebersprungen);
  tag.aufgaben[1].grund = "Morgen Klausur";
  const { titel, text } = abschlussNachricht({
    datum: "2026-10-01",
    aufgaben: [{ stufe: "Einstieg" }, { stufe: "Mittel" }],
    tag,
    thema: "Kettenregel",
    serieTage: 3,
  });
  assert.equal(titel, "Niklas, Mathe 01.10.: 1 von 2 richtig");
  assert.match(text, /übersprungen\. Grund: „Morgen Klausur“/);
  assert.match(text, /Thema: Kettenregel/);
  assert.match(text, /3 Tage in Folge/);
});

test("Datum wird in deutscher Zeit bestimmt", () => {
  assert.equal(heutigesDatum(new Date("2026-10-01T22:30:00Z")), "2026-10-02");
});
