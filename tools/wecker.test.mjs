import { test } from "node:test";
import assert from "node:assert/strict";

import { tagNach, zeitpunktAm } from "../js/ablauf.js";
import { istGueltigerKanal, zufallsKanal } from "../js/benachrichtigung.js";
import { WECKER_KANAL_PRAEFIX, abgleich, bereinigeUhrzeiten, pruefeWeckerKanal, sollWecker } from "../js/wecker.js";

const sekunden = (iso) => Date.parse(iso) / 1000;
const utc = (zeitpunkt) => new Date(zeitpunkt * 1000).toISOString();

test("Uhrzeit deutscher Zeit wird im Sommer und Winter richtig umgerechnet", () => {
  assert.equal(utc(zeitpunktAm("2026-10-02", "07:00")), "2026-10-02T05:00:00.000Z");
  assert.equal(utc(zeitpunktAm("2026-12-01", "16:00")), "2026-12-01T15:00:00.000Z");
  // Tage der Zeitumstellung: früh noch alte, später schon neue Zeit
  assert.equal(utc(zeitpunktAm("2026-10-25", "01:00")), "2026-10-24T23:00:00.000Z");
  assert.equal(utc(zeitpunktAm("2026-10-25", "07:00")), "2026-10-25T06:00:00.000Z");
  assert.equal(utc(zeitpunktAm("2026-03-29", "07:00")), "2026-03-29T05:00:00.000Z");
});

test("Tage zählen über Monats- und Jahresgrenzen", () => {
  assert.equal(tagNach("2026-12-31", 1), "2027-01-01");
  assert.equal(tagNach("2026-03-01", -1), "2026-02-28");
});

test("Uhrzeiten werden sortiert, Doppelte entfernt und Fehler verständlich gemeldet", () => {
  assert.deepEqual(bereinigeUhrzeiten(["16:00", "07:00", "16:00", " "]), ["07:00", "16:00"]);
  assert.throws(() => bereinigeUhrzeiten([""]), /mindestens eine/);
  assert.throws(() => bereinigeUhrzeiten(["25:00"]), /keine gültige Uhrzeit/);
  assert.throws(() => bereinigeUhrzeiten(["06:00", "07:00", "08:00", "09:00", "10:00"]), /Höchstens/);
});

test("Eigener Kanal muss gültig sein und darf nicht Papas Kanal sein", () => {
  const kanal = zufallsKanal(WECKER_KANAL_PRAEFIX);
  assert.ok(kanal.startsWith(WECKER_KANAL_PRAEFIX) && istGueltigerKanal(kanal));
  assert.notEqual(kanal, zufallsKanal(WECKER_KANAL_PRAEFIX));
  assert.doesNotThrow(() => pruefeWeckerKanal(kanal, "papas-kanal-1234567890"));
  assert.throws(() => pruefeWeckerKanal(kanal, kanal), /Papas Kanal/);
  assert.throws(() => pruefeWeckerKanal("kurz", ""), /16 bis 64/);
});

test("Geplant werden die restlichen Uhrzeiten von heute und die der nächsten drei Tage", () => {
  const soll = sollWecker({
    uhrzeiten: ["07:00", "16:00"],
    heute: "2026-10-02",
    heuteErledigt: false,
    jetzt: sekunden("2026-10-02T08:00:00Z"), // 10 Uhr deutscher Zeit
  });
  assert.deepEqual(
    soll.map((wecker) => wecker.kennung),
    [
      "wecker-2026-10-02-1600",
      "wecker-2026-10-03-0700",
      "wecker-2026-10-03-1600",
      "wecker-2026-10-04-0700",
      "wecker-2026-10-04-1600",
      "wecker-2026-10-05-0700",
    ],
  );
});

test("Ist heute erledigt, entfallen die Mitteilungen von heute", () => {
  const soll = sollWecker({
    uhrzeiten: ["16:00"],
    heute: "2026-10-02",
    heuteErledigt: true,
    jetzt: sekunden("2026-10-02T08:00:00Z"),
  });
  assert.equal(soll[0].kennung, "wecker-2026-10-03-1600");
});

test("Abgleich plant nur Neues, löscht Überflüssiges und vergisst Zugestelltes", () => {
  const jetzt = 1000;
  const geplant = [
    { kanal: "k", kennung: "alt-zugestellt", zeitpunkt: 900 },
    { kanal: "k", kennung: "bleibt", zeitpunkt: 2000 },
    { kanal: "k", kennung: "weg", zeitpunkt: 3000 },
    { kanal: "alter-kanal", kennung: "neu", zeitpunkt: 4000 },
  ];
  const soll = [
    { kanal: "k", kennung: "bleibt", zeitpunkt: 2000 },
    { kanal: "k", kennung: "neu", zeitpunkt: 4000 },
  ];
  const { behalten, loeschen, senden } = abgleich(geplant, soll, jetzt);
  assert.deepEqual(behalten.map((w) => w.kennung), ["bleibt"]);
  assert.deepEqual(loeschen.map((w) => `${w.kanal}/${w.kennung}`), ["k/weg", "alter-kanal/neu"]);
  assert.deepEqual(senden.map((w) => `${w.kanal}/${w.kennung}`), ["k/neu"]);
});
