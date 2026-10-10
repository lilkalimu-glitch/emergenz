# Emergenz: Hinweise für Claude

Öffentliches Repository einer Android-App: Gott-Simulation, in der Klima, Pflanzen und Leben aus Regeln entstehen.
Projektsprache ist Deutsch: Texte in der App, Code-Kommentare, Commit-Nachrichten und Doku.
Der Nutzer möchte einfache Sprache ohne viel Fachjargon. Vorschläge erst nach seiner Bestätigung als Plan behandeln.

## Regeln
- Den Signaturschlüssel nie unverschlüsselt committen. Im Repository liegt nur `signing/emergenz.jks.enc`
  (AES-256, Passwort im GitHub-Secret `KEYSTORE_PASSWORD`).
- `appId` (`com.lilkalimu.emergenz` in `capacitor.config.json`) und den Schlüssel nie ändern, sonst lassen sich
  neue Versionen nicht über die alte installieren.
- Im Workflow `persist-credentials: false` beim Checkout und `npm install --ignore-scripts` beibehalten.
- Die Simulation (`www/js/sim/`) darf nichts aus dem Browser benutzen, damit sie in Node testbar bleibt.
  Zufall nur über `world.rng`, damit gleicher Seed und gleiche Eingriffe denselben Verlauf ergeben.
- Speicherformat (`World.serialize`/`restore`) nur abwärtskompatibel ändern, sonst gehen gespeicherte Welten verloren.

## Bauen und ausliefern
- Jeder Push auf `main` startet `.github/workflows/build-apk.yml`: Simulationstests, Oberflächentest mit Playwright
  (Bildschirmfotos), APK-Bau, Test im Android-Emulator, Release `v0.<lauf>` mit `Emergenz-0.<lauf>.apk`.
- Reine Doku-Änderungen (`*.md`, `docs/`, `.claude/`) lösen keinen Build aus.
- Build-Logs lassen sich aus Claude-Sitzungen nicht direkt laden. Ergebnisse (Logs, Bildschirmfotos, Karten) landen
  im Zweig `ci-ergebnis`: `git fetch origin ci-ergebnis && git show origin/ci-ergebnis:ZUSAMMENFASSUNG.md`.
- Läufe beobachten: `gh api repos/lilkalimu-glitch/emergenz/actions/runs?per_page=3`.

## Aufbau
- `www/js/sim/`: Simulation. `world.js` (Zeit, Eingriffe, Chronik-Ereignisse, Speichern), `planet.js` (Gelände),
  `climate.js` (Energiebilanz, Eis, Regen), `plants.js` (Miami-Modell, Algen), `life.js` (Gruppen, Erbgut, Fressen,
  Jagen, Teilung), `species.js` (Artbildung, Namen), `genome.js` (Merkmale), `chronicle.js`.
- `www/js/render/`: `texture.js` (Kartenbild 1024 x 512 aus Gelände, Klima, Leben), `globe.js` (Kugel pixelweise),
  `mapview.js` (Karte), `sky.js` (Sterne), `colors.js`.
- `www/js/app.js`: Start, Schleife, Eingabe, Werkzeuge. `www/js/ui/sheets.js`: Blätter (Chronik, Arten, Ort, Klima, Welt).
- `scripts/prepare-web.mjs` kopiert Capacitor, Plugins und Schriften; `scripts/patch-android.py` passt das
  Android-Projekt an; `scripts/make-icons.py` zeichnet das Icon.

## Testen
- `node --test tests/sim.test.mjs` (Simulation), `node tools/render-map.mjs 12345 500` (Karten als PPM).
- `tests/ui.mjs` läuft auf GitHub mit Playwright im Handyformat 393 x 852.
- Testzugang in der App: `window.__emergenz` (setSpeed, setView, setLayer, setTool, tapAt, step, openSheet, save).

## Design
Weltraum-Grund, der Planet ist die Bühne. Farben tragen Bedeutung: Gold für Eingriffe, Grün für Leben, Blau für
Klima, Glut für Zerstörung. Schriften: Fraunces (Titel, Jahreszahl, Artnamen kursiv wie in der Biologie),
Instrument Sans (Oberfläche). Artnamen in Texten zwischen `§...§` setzen, die Oberfläche macht sie kursiv.
