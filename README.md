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
| `js/zeichenblatt.js` | Rechenblatt (Stift zeichnet, Finger scrollt, Werkzeugleiste bleibt oben stehen) |
| `js/zweifingertipp.js` | Zwei-Finger-Tipp wechselt Stift und Radierer (Pencil-Gesten erreichen Webseiten nicht) |
| `js/wecker.js`, `js/wecker-dialog.js` | Mitteilungen an Niklas zu wählbaren Uhrzeiten (Glocke oben rechts) |
| `js/hilfe.js` | Bereinigt den Aufschrieb für den Hilfe-Dialog |
| `data/heute.json` | Aufgaben des Tages, wird jeden Morgen von einer Claude-Routine erzeugt |
| `tools/aufgaben-erstellen.mjs` | Macht aus einem Entwurf mit Klartext-Lösungen die `heute.json` |
| `tools/abschnitt.mjs` | Schneidet den Abschnitt zum Thema aus der Zusammenfassung (Hilfe) |
| `tools/erinnerung-planen.mjs`, `.github/workflows/erinnerung.yml` | Plant die Mitternachts-Nachricht „nicht erledigt“ |

## Aufgaben erzeugen

```bash
node tools/aufgaben-erstellen.mjs entwurf.json --zusammenfassung pfad/zu/zusammenfassung.html
```

Entwurfsformat:

```json
{
  "datum": "2026-10-01",
  "thema": "Kettenregel",
  "anker": "kettenregel",
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

Mit `--zusammenfassung` wird der Abschnitt `anker` (eine `h3`-ID) wörtlich und verschlüsselt als
Hilfe mitgeliefert. Der ?-Knopf in der App zeigt ihn an; ob er benutzt wurde, wird nicht gemeldet.

## Mitternachts-Erinnerung

Nach jedem Push von `data/heute.json` plant eine GitHub Action bei ntfy die Nachricht „Niklas hat
gestern die Aufgaben nicht erledigt.“ für 0 Uhr deutscher Zeit nach dem Aufgabentag (Sommer- und
Winterzeit berücksichtigt). Die Nachricht trägt die Kennung `fehlt-JJJJ-MM-TT`; ein zweiter Aufgabensatz
am selben Tag ersetzt sie. Sobald alle Aufgaben erledigt sind, löscht die App sie vor dem Versand der
Abschlussnachricht.

Die Action braucht das Repository-Secret `NTFY_KANAL`. Von Hand neu planen:
`gh workflow run erinnerung.yml` (Achtung: plant sie auch dann, wenn der Tag schon erledigt ist).

## Mitteilungen an Niklas (Glocke)

Über die Glocke stellt Niklas ein, ob und zu welchen Uhrzeiten (höchstens vier pro Tag) er an offene
Aufgaben erinnert wird. Die Mitteilungen gehen an einen **eigenen** ntfy-Kanal, den er in der
ntfy-App auf dem iPad abonniert; Papas Kanal wird abgelehnt.

Ohne Server plant die App sie bei ntfy im Voraus, so weit ntfy es zulässt (drei Tage). Bei jedem
Öffnen und beim Abschluss des Tages gleicht sie ab: fehlende planen, überflüssige löschen, die von
heute löschen, sobald alles erledigt ist. Kennung: `wecker-JJJJ-MM-TT-HHMM`. Wird die App drei Tage
lang nicht geöffnet, kommen danach keine Mitteilungen mehr.

## Hinweis zur Sicherheit

Die Verschlüsselung verhindert nur versehentliches Spicken. Der Schlüssel steckt im Code, weil die App
ohne Server auskommt. Der ntfy-Kanalname steht nicht im Repo, sondern nur auf den Geräten und als Repository-Secret.

## Tests

```bash
npm test
```
