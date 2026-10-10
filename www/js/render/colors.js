// Farben für Karte und Globus. Gemischt wird im linearen Bereich der Zahlen, nicht nach Gefühl:
// jede Farbe steht für einen Zustand (kahl, bewachsen, Schnee, Tiefe, Algen).

export function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function hex(h) {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export const C = {
  rock: hex('#8a8883'),
  soil: hex('#86694c'),
  sand: hex('#d3b987'),
  redrock: hex('#b07b55'),
  tundra: hex('#7f8a68'),
  taiga: hex('#29523f'),
  savanna: hex('#a7a85a'),
  rainforest: hex('#1c5a31'),
  temperate: hex('#3a7240'),
  snow: hex('#eef3f7'),
  glacier: hex('#dfeaf2'),
  seaShallow: hex('#2f8db0'),
  seaMid: hex('#195b8c'),
  seaDeep: hex('#0b2550'),
  algae: hex('#1f7a6e'),
  seaIce: hex('#d9e5ee'),
};

// Temperatur: kalt blau, mild hell, heiß rot
const TEMP_STOPS = [
  [-40, hex('#2a3f9e')],
  [-20, hex('#4f7fd1')],
  [-5, hex('#9fc4ea')],
  [5, hex('#e8eef0')],
  [15, hex('#f1d38a')],
  [25, hex('#ea8f4a')],
  [35, hex('#c9412d')],
  [45, hex('#7d1530')],
];

export function tempColor(t) {
  if (t <= TEMP_STOPS[0][0]) return TEMP_STOPS[0][1];
  for (let k = 1; k < TEMP_STOPS.length; k++) {
    if (t <= TEMP_STOPS[k][0]) {
      const [t0, c0] = TEMP_STOPS[k - 1];
      const [t1, c1] = TEMP_STOPS[k];
      return mix(c0, c1, (t - t0) / (t1 - t0));
    }
  }
  return TEMP_STOPS[TEMP_STOPS.length - 1][1];
}

const RAIN_STOPS = [
  [0, hex('#c9a46a')],
  [250, hex('#d9c98d')],
  [600, hex('#9fbf73')],
  [1200, hex('#4ea56f')],
  [2200, hex('#2b7f9c')],
  [3500, hex('#26478f')],
];

export function rainColor(r) {
  if (r <= 0) return RAIN_STOPS[0][1];
  for (let k = 1; k < RAIN_STOPS.length; k++) {
    if (r <= RAIN_STOPS[k][0]) {
      const [r0, c0] = RAIN_STOPS[k - 1];
      const [r1, c1] = RAIN_STOPS[k];
      return mix(c0, c1, (r - r0) / (r1 - r0));
    }
  }
  return RAIN_STOPS[RAIN_STOPS.length - 1][1];
}

// Farbe einer Art aus ihrem Farb-Gen (Farbton), hell genug für dunklen Grund
export function hslToRgb(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

export function speciesRgb(hue) {
  return hslToRgb(((hue % 1) + 1) % 1, 0.78, 0.62);
}

export function speciesCss(hue) {
  const [r, g, b] = speciesRgb(hue);
  return `rgb(${r},${g},${b})`;
}
