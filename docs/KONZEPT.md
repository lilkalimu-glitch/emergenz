# Das Emergenz-Universum

Dieses Dokument hält die Idee fest: oben das ursprüngliche Konzept, darunter Ergänzungen und der Stand der Umsetzung.
Was unter "Vorschläge" steht, ist noch nicht beschlossen.

## Ursprüngliches Konzept (God & Reality Simulation Engine)

### 1. Kernphilosophie und Grundprinzip
- **Null feste Skripts (Pure Emergence):** Keine vorgegebenen Storylines, Quests oder voreingestellten Ereignisse. Welt, Evolution und Zivilisationen entstehen nur aus mathematischen, physikalischen und biologischen Naturgesetzen.
- **Wissenschaftliche Akkuratheit:** Alle Simulationen (von subatomaren Prozessen bis zur Astrophysik und Soziologie) orientieren sich an realen wissenschaftlichen Modellen.

### 2. Simulationsschichten und Physik (Makro bis Mikro)
- **Astrophysik:** N-Körper-Problem und Gravitation, echte Umlaufbahnen. Eingriffe: Sonne verändern, verstrahlen, Supernovae auslösen, Himmelskörper zerstören, mit Folgen für Gravitation, Gezeiten und Klima.
- **Thermodynamik und Atmosphäre:** Wetterkreisläufe, Luftdruck, Coriolis-Kraft, Temperaturgefälle, Meeresströmungen (thermohaline Zirkulation).
- **Flüssigkeiten:** Ozeane, Flüsse, Überschwemmungen, Erosion.
- **Geologie:** Plattentektonik, Vulkanismus, Erdbeben über Jahrmillionen.

### 3. Biologische Evolution und Ökosysteme
- **Abiogenese und Evolution:** von chemischen Bausteinen über Einzeller und Meeresökosysteme bis zu Landlebewesen.
- **Natürliche Auslese:** Mutationen, Klima, Futterknappheit, Raubfeinde. Keine künstlichen Buffs oder Nerfs.
- **Verhalten:** Jagd, Revier, Paarung, Winterschlaf, Rudel.

### 4. Agenten-basierte Zivilisation und soziale KI
- **Kognitive Agenten:** Gedächtnis, Gefühle, Ziele, Angst, Glaube.
- **Sprache und Kultur:** Sprachen, Rituale, Werkzeuge und Technik entstehen aus der Umgebung (Metallurgie nur bei Erzvorkommen).
- **Gerüchte und Wissen:** Zeugen erzählen weiter, Geschichten werden übertrieben, Mythen, Religionen und Verschwörungen entstehen.

### 5. Göttliche Präsenz, Avatar und Ebenen
- **Stufenloses Zoomen** vom Orbit bis in die Augen eines Wesens.
- **Avatar:** als Fremder auf der Welt wandeln, der Ruf baut sich durch Taten, Wunder oder Tatenlosigkeit auf.

### 6. Design und Technik
- **Stil:** modularer, stilisierter Realismus mit physikbasiertem Licht.
- **Technik:** Entity Component System, räumliche Aufteilung (Octree/Grid), Detailstufen für Physik und KI.

## Ergänzungen aus dem Feedback

1. **Zeit-System:** Jede Ebene braucht ihr eigenes Tempo (Kontinente: Zentimeter pro Jahr, Evolution: Generationen, Gespräche: Sekunden), dazu Pause, Zeitraffer und Zeitsprünge.
2. **Zwei Detailstufen:** Aus der Ferne nur Zahlen, beim Reinzoomen Einzelwesen, die beim nächsten Besuch dieselben sind.
3. **Startpunkte:** wählbare Anfänge, damit man nicht Milliarden Jahre warten muss.
4. **"Akkurat" ehrlich aufteilen:** echte Formeln, wo es sie gibt (Schwerkraft, Klima), vereinfachte Modelle, wo die Wissenschaft selbst keine Antwort hat (Entstehung des Lebens, Sprache).
5. **Chronik:** Die Welt schreibt ihr eigenes Geschichtsbuch.
6. **Gerüchte als feste Regel:** Ereignis, Zeugen, Wahrheitsgrad; jedes Weitererzählen verzerrt.

## Version 0.1: Planet und Leben (umgesetzt)

- Planet aus einer Welt-Nummer (Seed): Kontinente, Gebirge, Schelfmeere, etwa 68 % Ozean
- Klima: Einstrahlung nach Breitengrad, Jahreszeit und Achsneigung; Energiebilanzmodell (Budyko/Sellers/North) mit Wärmetransport, Ozean-Wärmespeicher, Eis-Albedo-Rückkopplung, CO2-Antrieb, Höhenkälte; Regen mit Windgürteln, Verdunstung nach Clausius-Clapeyron, Steigungsregen und Regenschatten
- Pflanzen an Land nach dem Miami-Modell, Algen im Meer nach Licht, Wärme und Nährstoffen
- Leben: Gruppen mit Erbgut aus neun Zahlen, Stoffwechsel nach Kleiber, Mutation bei jeder Teilung, natürliche Auslese, Räuber und Beute, Gang an Land, Artbildung durch Aufspaltung
- Zeit-System: Monatsschritte für Leben und Pflanzen, Jahresschritte fürs Klima; Pause, drei Tempostufen, Zeitsprünge über 100 und 1.000 Jahre
- Zwei Startpunkte: Ursuppe oder leerer Planet (Leben kann von selbst entstehen)
- Eingriffe: Sonne, CO2, Meteore in drei Größen (Krater, Einschlagswinter), Regen und Dürre, Zellen aussetzen, Pflanzen säen
- Ansichten: drehbarer Globus mit Licht und Atmosphäre, zoombare Karte, Ebenen Natur, Temperatur, Regen und Leben
- Chronik, Artenliste mit Stammbaum der Vorfahren, Verlauf von Temperatur, Eis und Artenzahl
- Speichern auf dem Handy

## Vorschläge für spätere Versionen (noch nicht beschlossen)

- Plattentektonik und Erosion: Kontinente wandern, Gebirge entstehen und verwittern, Flüsse
- Meeresströmungen und Wind als echtes Strömungsfeld
- Sonnensystem: Planeten und Monde mit echter Schwerkraft, Gezeiten, Bahnänderungen mit Folgen fürs Klima
- Zoom in eine Region mit Einzeltieren (zweite Detailstufe), Verhalten wie Rudel, Revier, Winterschlaf
- Stämme mit Gedächtnis, Sprache und Werkzeugen; Gerüchte und Mythen über den Gott
- Avatar als Fremder unter den Wesen
