/**
 * Glocke in der Kopfzeile und Dialog „Mitteilungen“: an/aus, Uhrzeiten und Niklas' eigener
 * ntfy-Kanal. Die Regeln stehen in wecker.js, das Planen übernimmt der übergebene Rückruf.
 */

import { sende, zufallsKanal } from "./benachrichtigung.js";
import { MAX_UHRZEITEN, WECKER_KANAL_PRAEFIX, bereinigeUhrzeiten, pruefeWeckerKanal } from "./wecker.js";

const NEUE_UHRZEIT = "18:00";
const ZUSTAND = Object.freeze({ an: "an", aus: "aus", fehler: "fehler" });

const $ = (auswahl, wurzel = document) => wurzel.querySelector(auswahl);

let letzterFehler = null;

/** Zeigt an der Glocke, ob Mitteilungen an sind und ob das letzte Planen geklappt hat. */
export function zeigeWeckerZustand(einstellung, fehler) {
  letzterFehler = einstellung.an ? fehler : null;
  const glocke = $("#wecker-oeffnen");
  if (letzterFehler) {
    glocke.dataset.zustand = ZUSTAND.fehler;
    glocke.title = `Mitteilungen: ${letzterFehler}`;
  } else if (einstellung.an) {
    glocke.dataset.zustand = ZUSTAND.an;
    glocke.title = `Mitteilungen um ${einstellung.uhrzeiten.join(", ")} Uhr`;
  } else {
    glocke.dataset.zustand = ZUSTAND.aus;
    glocke.title = "Mitteilungen aus";
  }
}

function zeigeMeldung(text, art = "") {
  const meldung = $("#wecker-meldung");
  meldung.textContent = text;
  meldung.dataset.art = art;
}

function aktualisiereBedienung() {
  const an = $("#wecker-an").checked;
  const eintraege = $("#wecker-uhrzeiten").children;
  $("#wecker-details").disabled = !an;
  $("#wecker-hinzufuegen").disabled = eintraege.length >= MAX_UHRZEITEN;
  for (const eintrag of eintraege) {
    $("button", eintrag).disabled = eintraege.length === 1;
  }
}

function fuegeUhrzeitHinzu(wert) {
  const eintrag = document.createElement("li");
  const eingabe = Object.assign(document.createElement("input"), { type: "time", value: wert, required: true });
  eingabe.setAttribute("aria-label", "Uhrzeit");
  const entfernen = Object.assign(document.createElement("button"), {
    type: "button",
    className: "leise",
    textContent: "Entfernen",
  });
  entfernen.addEventListener("click", () => {
    eintrag.remove();
    aktualisiereBedienung();
  });
  eintrag.append(eingabe, entfernen);
  $("#wecker-uhrzeiten").append(eintrag);
  aktualisiereBedienung();
}

function uhrzeitenAusFormular() {
  return [...document.querySelectorAll("#wecker-uhrzeiten input")].map((eingabe) => eingabe.value);
}

/**
 * Verbindet Glocke und Dialog. `planen` gleicht die Mitteilungen mit der gespeicherten Einstellung
 * ab und liefert eine Fehlermeldung oder null.
 */
export function verbindeWeckerDialog({ einstellung, papaKanal, speichern, planen }) {
  const dialog = $("#wecker");
  const kanalFeld = $("#wecker-kanal");
  const speichernKnopf = $("#wecker-speichern");

  $("#wecker-oeffnen").addEventListener("click", () => {
    $("#wecker-an").checked = einstellung.an;
    kanalFeld.value = einstellung.kanal;
    $("#wecker-uhrzeiten").replaceChildren();
    einstellung.uhrzeiten.forEach(fuegeUhrzeitHinzu);
    zeigeMeldung(letzterFehler ? `Beim letzten Planen ging etwas schief: ${letzterFehler}` : "", letzterFehler ? "fehler" : "");
    aktualisiereBedienung();
    dialog.showModal();
  });

  $("#wecker-an").addEventListener("change", aktualisiereBedienung);
  $("#wecker-hinzufuegen").addEventListener("click", () => fuegeUhrzeitHinzu(NEUE_UHRZEIT));
  $("#wecker-schliessen").addEventListener("click", () => dialog.close());

  $("#wecker-kanal-neu").addEventListener("click", () => {
    const ersetzen = !kanalFeld.value.trim() || window.confirm("Neuen Kanal erzeugen? Den musst du dann in ntfy neu abonnieren.");
    if (ersetzen) kanalFeld.value = zufallsKanal(WECKER_KANAL_PRAEFIX);
  });

  $("#wecker-kanal-kopieren").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(kanalFeld.value.trim());
      zeigeMeldung("Kanal kopiert. In ntfy auf „+“ tippen und einfügen.");
    } catch {
      zeigeMeldung("Kopieren ging nicht. Bitte den Kanal von Hand übertragen.", "fehler");
    }
  });

  $("#wecker-test").addEventListener("click", async () => {
    const kanal = kanalFeld.value.trim();
    try {
      pruefeWeckerKanal(kanal, papaKanal());
      zeigeMeldung("Sende Testmitteilung …");
      await sende(kanal, { titel: "Mathe-Training: Test", text: "So sehen deine Mitteilungen aus." });
      zeigeMeldung("Testmitteilung gesendet. Ist sie auf dem iPad angekommen?");
    } catch (fehler) {
      zeigeMeldung(fehler.message, "fehler");
    }
  });

  $("#wecker-formular").addEventListener("submit", async (ereignis) => {
    // Der Dialog bleibt offen, bis das Planen durch ist, damit ein Fehler sichtbar bleibt.
    ereignis.preventDefault();
    const an = $("#wecker-an").checked;
    const kanal = kanalFeld.value.trim();
    let uhrzeiten;
    try {
      uhrzeiten = bereinigeUhrzeiten(uhrzeitenAusFormular());
      if (an) pruefeWeckerKanal(kanal, papaKanal());
    } catch (fehler) {
      zeigeMeldung(fehler.message, "fehler");
      return;
    }

    Object.assign(einstellung, { an, kanal, uhrzeiten });
    speichern();
    zeigeMeldung(an ? "Mitteilungen werden geplant …" : "Geplante Mitteilungen werden gelöscht …");
    speichernKnopf.disabled = true;
    const fehler = await planen();
    speichernKnopf.disabled = false;
    if (fehler) {
      zeigeMeldung(`Gespeichert, aber bei ntfy hat etwas nicht geklappt: ${fehler}`, "fehler");
      return;
    }
    dialog.close();
  });

  zeigeWeckerZustand(einstellung, null);
}
