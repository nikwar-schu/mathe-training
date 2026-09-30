# Mathe-Training

Web-App für die tägliche Abi-Vorbereitung: zwei Aufgaben pro Tag, ein kariertes Rechenblatt für den
Apple Pencil und eine Prüfung der Endergebnisse direkt im Browser. Wenn alle Aufgaben erledigt oder
begründet übersprungen sind, geht eine Push-Nachricht über [ntfy](https://ntfy.sh) raus.

App: https://nikwar-schu.github.io/mathe-training/

## Aufbau

| Pfad | Zweck |
|---|---|
| `index.html`, `css/`, `js/main.js` | Oberfläche |
| `js/ablauf.js` | Regeln: Versuche, Abschluss, Serie, Nachrichtentext |
| `js/rechner.js` | Sicherer Auswerter für Eingaben wie `32/3`, `2√3`, `ln(2)` |
| `js/pruefung.js` | Ergebnis-Hashes und Verschlüsselung der Musterlösungen |
| `js/zeichenblatt.js` | Rechenblatt (Stift zeichnet, Finger scrollt) |
| `data/heute.json` | Aufgaben des Tages, wird jeden Morgen von einer Claude-Routine erzeugt |
| `tools/aufgaben-erstellen.mjs` | Macht aus einem Entwurf mit Klartext-Lösungen die `heute.json` |

## Aufgaben erzeugen

```bash
node tools/aufgaben-erstellen.mjs entwurf.json
```

Entwurfsformat:

```json
{
  "datum": "2026-10-01",
  "thema": "Kettenregel",
  "aufgaben": [
    {
      "stufe": "Einstieg",
      "text": "Aufgabentext mit $\\LaTeX$",
      "felder": ["x_1", "x_2"],
      "ungeordnet": true,
      "ergebnis": ["-2", "32/3"],
      "loesung": ["Schritt 1", "Schritt 2"]
    }
  ]
}
```

Ergebnisse werden auf zwei Nachkommastellen gerundet verglichen. Das Skript lehnt Werte ab, die
genau auf einer Rundungsgrenze liegen.

## Hinweis zur Sicherheit

Die Verschlüsselung verhindert nur versehentliches Spicken. Der Schlüssel steckt im Code, weil die App
ohne Server auskommt. Der ntfy-Kanalname steht nicht im Repo, sondern nur auf den Geräten.

## Tests

```bash
npm test
```
