// Zufallszahlen mit Startwert (sfc32). Gleicher Seed ergibt immer dieselbe Welt.

export function hashString(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export class RNG {
  constructor(seed = 1) {
    this.setSeed(seed);
  }

  setSeed(seed) {
    let s = (seed >>> 0) || 1;
    // splitmix32, um aus einer Zahl vier gut gemischte Zustandswerte zu machen
    const mix = () => {
      s = (s + 0x9e3779b9) >>> 0;
      let z = s;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
      return (z ^ (z >>> 16)) >>> 0;
    };
    this.a = mix();
    this.b = mix();
    this.c = mix();
    this.d = mix();
    this.spare = null;
    for (let i = 0; i < 12; i++) this.u32();
  }

  u32() {
    let { a, b, c, d } = this;
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) >>> 0;
    this.a = a >>> 0;
    this.b = b >>> 0;
    this.c = c >>> 0;
    this.d = d;
    return t;
  }

  // Gleichverteilt in [0, 1)
  next() {
    return this.u32() / 4294967296;
  }

  range(lo, hi) {
    return lo + (hi - lo) * this.next();
  }

  int(n) {
    return Math.floor(this.next() * n);
  }

  chance(p) {
    return this.next() < p;
  }

  // Normalverteilt (Box-Muller), Mittelwert 0, Standardabweichung 1
  normal() {
    if (this.spare !== null) {
      const v = this.spare;
      this.spare = null;
      return v;
    }
    let u = 0;
    let v = 0;
    while (u <= 1e-12) u = this.next();
    v = this.next();
    const r = Math.sqrt(-2 * Math.log(u));
    this.spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  }

  pick(list) {
    return list[this.int(list.length)];
  }

  getState() {
    return [this.a, this.b, this.c, this.d];
  }

  setState(state) {
    [this.a, this.b, this.c, this.d] = state.map((v) => v >>> 0);
    this.spare = null;
  }
}
