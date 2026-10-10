// Erbgut einer Gruppe von Lebewesen: neun Zahlen zwischen 0 und 1.
// Daraus folgen Größe, Ernährung, Lebensraum, Temperatur, Tempo, Sinne, Fortpflanzung und Farbe.
//
// Echte Gesetze dahinter (gestaucht, damit Evolution in Minuten sichtbar wird):
//  - Kleiber: Stoffwechsel ~ Masse^0,75, also pro kg ~ Masse^-0,25 (kleine Tiere leben schneller)
//  - Lindeman: nur ein Teil der Energie kommt in der nächsten Stufe der Nahrungskette an
//  - Holling Typ II: Fressrate sättigt sich, große Tiere brauchen dichtere Nahrung

export const SIZE = 0;
export const DIET = 1;
export const LAND = 2;
export const TOPT = 3;
export const TTOL = 4;
export const SPEED = 5;
export const SENSE = 6;
export const REPRO = 7;
export const HUE = 8;
export const NG = 9;

export const GENE_NAMES = ['Größe', 'Fleisch', 'Land', 'Wärme', 'Toleranz', 'Tempo', 'Sinne', 'Nachwuchs', 'Farbe'];

// Gewichte für den Abstand zwischen zwei Erbgut-Sätzen (Artgrenzen)
export const GENE_WEIGHTS = [1.6, 1.6, 1.6, 1.0, 0.6, 0.8, 0.8, 0.5, 0.35];

export function geneDistance(a, ao, b, bo) {
  let s = 0;
  for (let g = 0; g < NG; g++) {
    let d = a[ao + g] - b[bo + g];
    if (g === HUE) {
      d = Math.abs(d);
      if (d > 0.5) d = 1 - d;
    }
    s += GENE_WEIGHTS[g] * d * d;
  }
  return Math.sqrt(s);
}

// Körpermasse in kg (nur zur Anzeige): von 1 µg (großer Einzeller) bis 1 t
export function bodyMassKg(size) {
  return Math.pow(10, -9 + 12 * size);
}

export function topt(g) {
  return -15 + 55 * g;
}

export function toptGene(celsius) {
  return Math.min(1, Math.max(0, (celsius + 15) / 55));
}

export function sigma(g) {
  return 3 + 14 * g;
}

export function formatMass(kg) {
  if (kg < 1e-6) return `${(kg * 1e9).toFixed(kg < 1e-8 ? 1 : 0)} µg`;
  if (kg < 1e-3) return `${(kg * 1e6).toFixed(kg < 1e-5 ? 1 : 0)} mg`;
  if (kg < 1) return `${(kg * 1e3).toFixed(kg < 1e-2 ? 1 : 0)} g`;
  if (kg < 1000) return `${kg.toFixed(kg < 10 ? 1 : 0)} kg`;
  return `${(kg / 1000).toFixed(1)} t`;
}

export function sizeWord(s) {
  if (s < 0.14) return 'Einzeller';
  if (s < 0.3) return 'Winzling';
  if (s < 0.47) return 'Kleintier';
  if (s < 0.64) return 'mittelgroß';
  if (s < 0.8) return 'Großtier';
  return 'Riese';
}

export function dietWord(d) {
  if (d < 0.34) return 'Pflanzenfresser';
  if (d < 0.62) return 'Allesfresser';
  return 'Räuber';
}

export function habitatWord(h) {
  if (h < 0.35) return 'im Meer';
  if (h < 0.65) return 'amphibisch';
  return 'an Land';
}

export function describe(genes, o = 0) {
  const s = genes[o + SIZE];
  const d = genes[o + DIET];
  const h = genes[o + LAND];
  let food = dietWord(d);
  if (d < 0.34 && h < 0.35) food = 'Algenfresser';
  return `${sizeWord(s)}, ${food}, ${habitatWord(h)}`;
}
