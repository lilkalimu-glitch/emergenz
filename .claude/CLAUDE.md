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
  Jagen, Teilung), `species.js` (Artbildung, Namen), `genome.js` (Merkmale), `chronicle.js`,
  `host.js` (SimHost: Daten für die Anzeige, Eingriffe und Abfragen, ohne Browser testbar).
- `www/js/worker.js`: Simulations-Prozess (Web Worker) mit Schleife, Zeitsprung, Autospeichern.
  `www/js/client.js`: Gegenstück im Hauptprozess (Befehle, neueste Daten). Nachrichten: frame, fields, terrain,
  species, chronicle, jump, reply.
- `www/js/gl/`: WebGL2-Darstellung. `glsl.js` (Globus mit Perspektive, Karte, Wolken, Bäume, Wellen; Details aus
  Rauschen), `renderer.js` (Texturen, Atlas 2048² mit 16 x 16 Tierbildern, Instanzen).
- `www/js/view/`: `camera.js` (Globus/Karte, Gesten, Flüge), `life-layer.js` (Punkte, Tierbilder, einzelne Tiere in
  der Nahansicht ab 26 Pixel je Zelle, Antippen), `fx.js` (Effekte), `fallback.js` (Canvas 2D ohne WebGL2).
- `www/js/art/creatures.js`: zeichnet Tiere aus dem Erbgut (Einzeller, Fische, Wale, Amphibien, Krabbler,
  Vierbeiner, denkende Wesen).
- `www/js/render/`: Ersatzbild für Geräte ohne WebGL2 (`texture.js` im Worker, `globe.js`, `mapview.js`), `sky.js`.
- `www/js/app.js`: Start, Schleife, Eingabe, Werkzeuge. `www/js/ui/sheets.js`: Blätter (Chronik, Arten, Ort, Klima,
  Welt), `ui/portraits.js`: Tierbilder in Listen.
- `scripts/prepare-web.mjs` kopiert Capacitor, Plugins und Schriften; `scripts/patch-android.py` passt das
  Android-Projekt an; `scripts/make-icons.py` zeichnet das Icon.

## Testen
- `node --test tests/sim.test.mjs tests/host.test.mjs` (Simulation und SimHost), `node tools/render-map.mjs 12345 500`.
- `tests/ui.mjs` läuft auf GitHub mit Playwright im Handyformat 393 x 852. Lokal geht es auch: Chromium liegt unter
  `/opt/pw-browsers`, Playwright global unter `/opt/npm-tools/node_modules` (Verknüpfung nach `node_modules/playwright`),
  dann `python3 -m http.server 8080 --directory www &` und `EMERGENZ_LOCAL=1 node tests/ui.mjs out/web`.
- Testzugang in der App: `window.__emergenz` (info, setSpeed, setView, setLayer, setTool, tapAt, step, act, query,
  zoomTo, globe, findGroup, openSheet, save).

## Design
Weltraum-Grund, der Planet ist die Bühne. Farben tragen Bedeutung: Gold für Eingriffe, Grün für Leben, Blau für
Klima, Glut für Zerstörung. Schriften: Fraunces (Titel, Jahreszahl, Artnamen kursiv wie in der Biologie),
Instrument Sans (Oberfläche). Artnamen in Texten zwischen `§...§` setzen, die Oberfläche macht sie kursiv.
