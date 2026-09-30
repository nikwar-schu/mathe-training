/**
 * Ergebnisprüfung und Verschlüsselung der Musterlösungen.
 *
 * Die Endergebnisse liegen nur als gesalzener SHA-256-Hash in heute.json, die Musterlösungen
 * AES-verschlüsselt. Das schützt vor versehentlichem Spicken, nicht vor gezieltem Auslesen:
 * Der Schlüssel muss im Browser verfügbar sein, damit die App ohne Server auskommt.
 */

import { berechne } from "./rechner.js";

const SCHLUESSEL_TEXT = "mathe-training/musterloesungen/v1";
const NACHKOMMASTELLEN = 2;
const IV_LAENGE = 12;
const SALZ_LAENGE = 16;

const kodierer = new TextEncoder();
const dekodierer = new TextDecoder();

function zuHex(puffer) {
  return [...new Uint8Array(puffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function zuBase64(puffer) {
  return btoa(String.fromCharCode(...new Uint8Array(puffer)));
}

function ausBase64(text) {
  return Uint8Array.from(atob(text), (zeichen) => zeichen.charCodeAt(0));
}

async function schluessel() {
  const rohdaten = await crypto.subtle.digest("SHA-256", kodierer.encode(SCHLUESSEL_TEXT));
  return crypto.subtle.importKey("raw", rohdaten, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** Rundet auf zwei Nachkommastellen; toFixed(6) fängt Gleitkommafehler wie 1.005 * 100 ab. */
export function runden(wert) {
  const faktor = 10 ** NACHKOMMASTELLEN;
  const gerundet = Math.round(Number((wert * faktor).toFixed(6))) / faktor;
  return Object.is(gerundet, -0) ? 0 : gerundet;
}

/** Liegt ein Wert so nah an einer Rundungsgrenze, dass richtiges Runden zufällig danebengehen kann? */
export function liegtAufRundungsgrenze(wert) {
  const rest = Math.abs(wert * 10 ** NACHKOMMASTELLEN) % 1;
  return Math.abs(rest - 0.5) < 0.05;
}

/** Einheitliche Textform einer Ergebnisliste; bei ungeordneten Ergebnissen sortiert. */
export function kanonisch(werte, ungeordnet) {
  const gerundet = werte.map(runden);
  if (ungeordnet) gerundet.sort((a, b) => a - b);
  return gerundet.map((wert) => wert.toFixed(NACHKOMMASTELLEN)).join("|");
}

export async function hashErgebnis(salz, kanonischerText) {
  const daten = kodierer.encode(`${salz}|${kanonischerText}`);
  return zuHex(await crypto.subtle.digest("SHA-256", daten));
}

export function neuesSalz() {
  return zuHex(crypto.getRandomValues(new Uint8Array(SALZ_LAENGE)));
}

/** Prüft die Eingaben einer Aufgabe; wirft EingabeFehler bei nicht lesbaren Eingaben. */
export async function pruefeEingaben(aufgabe, eingaben) {
  const werte = eingaben.map(berechne);
  const text = kanonisch(werte, aufgabe.ungeordnet);
  return (await hashErgebnis(aufgabe.salz, text)) === aufgabe.hash;
}

export async function verschluesseln(objekt) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LAENGE));
  const daten = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await schluessel(),
    kodierer.encode(JSON.stringify(objekt)),
  );
  return { iv: zuBase64(iv), daten: zuBase64(daten) };
}

export async function entschluesseln({ iv, daten }) {
  const klartext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ausBase64(iv) },
    await schluessel(),
    ausBase64(daten),
  );
  return JSON.parse(dekodierer.decode(klartext));
}
