// GLSL-Programme (WebGL2) für Globus, Karte, Sterne und Lebewesen.
// Der Planet wird pro Bildschirmpixel berechnet: grobe Daten aus der Simulation (Klima, Pflanzen, Gelände)
// werden weich interpoliert und mit feinem Rauschen verfeinert, dadurch bleibt das Bild bei jedem Zoom scharf.

export const FULLSCREEN_VS = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const COMMON = `
precision highp float;
precision highp sampler2D;
const float PI = 3.14159265359;
uniform sampler2D uTerrain;
uniform sampler2D uClimate;
uniform sampler2D uBio;
uniform sampler2D uLife;
uniform sampler2D uExtra;
uniform int uLayer;
uniform float uSeaLevel;
uniform float uTime;
uniform float uDetail;

// 3D-Simplex-Rauschen nach Ashima Arts und Stefan Gustavson (MIT-Lizenz)
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

const vec3 SOIL = vec3(0.525, 0.412, 0.298);
const vec3 SAND = vec3(0.827, 0.725, 0.529);
const vec3 REDROCK = vec3(0.69, 0.482, 0.333);
const vec3 ROCK = vec3(0.54, 0.533, 0.514);
const vec3 TUNDRA = vec3(0.498, 0.541, 0.408);
const vec3 TAIGA = vec3(0.16, 0.32, 0.247);
const vec3 SAVANNA = vec3(0.655, 0.659, 0.353);
const vec3 RAINFOREST = vec3(0.11, 0.353, 0.192);
const vec3 TEMPERATE = vec3(0.227, 0.447, 0.251);
const vec3 SNOW = vec3(0.933, 0.953, 0.969);
const vec3 SEA_SHALLOW = vec3(0.184, 0.553, 0.69);
const vec3 SEA_MID = vec3(0.098, 0.357, 0.549);
const vec3 SEA_DEEP = vec3(0.043, 0.145, 0.314);
const vec3 ALGAE = vec3(0.122, 0.478, 0.431);
const vec3 SEA_ICE = vec3(0.85, 0.898, 0.933);

vec3 tempRamp(float t) {
  vec3 c = vec3(0.165, 0.247, 0.62);
  c = mix(c, vec3(0.31, 0.5, 0.82), smoothstep(-40.0, -20.0, t));
  c = mix(c, vec3(0.62, 0.77, 0.92), smoothstep(-20.0, -5.0, t));
  c = mix(c, vec3(0.91, 0.93, 0.94), smoothstep(-5.0, 5.0, t));
  c = mix(c, vec3(0.945, 0.83, 0.54), smoothstep(5.0, 15.0, t));
  c = mix(c, vec3(0.92, 0.56, 0.29), smoothstep(15.0, 25.0, t));
  c = mix(c, vec3(0.79, 0.255, 0.176), smoothstep(25.0, 35.0, t));
  c = mix(c, vec3(0.49, 0.08, 0.19), smoothstep(35.0, 45.0, t));
  return c;
}

vec3 rainRamp(float r) {
  vec3 c = vec3(0.79, 0.643, 0.416);
  c = mix(c, vec3(0.85, 0.79, 0.553), smoothstep(0.0, 250.0, r));
  c = mix(c, vec3(0.624, 0.749, 0.451), smoothstep(250.0, 600.0, r));
  c = mix(c, vec3(0.306, 0.647, 0.435), smoothstep(600.0, 1200.0, r));
  c = mix(c, vec3(0.169, 0.498, 0.612), smoothstep(1200.0, 2200.0, r));
  c = mix(c, vec3(0.149, 0.278, 0.561), smoothstep(2200.0, 3500.0, r));
  return c;
}

vec3 hue2rgb(float h) {
  return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}

// Höhe in km an einer Stelle (grob interpoliert + feines Rauschen); nn = zwei Rauschwerte für Muster
float elevation(vec2 uv, vec3 sp, float detail, out vec4 nn) {
  float e = texture(uTerrain, uv).r;
  float n1 = snoise(sp * 24.0);
  float n2 = snoise(sp * 76.0);
  float n3 = detail > 0.0 ? snoise(sp * 310.0) * detail : 0.0;
  float n4 = detail > 0.5 ? snoise(sp * 1250.0) * (detail - 0.5) * 2.0 : 0.0;
  nn = vec4(n1, n2, n3, n4);
  float landish = smoothstep(-0.3, 0.12, e);
  return e + (n1 * 0.15 + n2 * 0.05 + n3 * 0.03 + n4 * 0.012) * mix(0.25, 1.0, landish);
}

// Farbe der Oberfläche; water = 1 im Meer (weich an der Küste)
vec3 surface(vec2 uv, float e, vec4 nn, out float water) {
  float fw = max(fwidth(e) * 0.7, 0.0004);
  water = smoothstep(uSeaLevel + fw, uSeaLevel - fw, e);
  float n2 = nn.y;
  // Klimadaten leicht verwirbelt nachschlagen, damit Grenzen natürlich ausfransen statt Kästchen zu zeigen
  vec2 uvc = uv + (nn.x * vec2(0.55 / 256.0, 0.55 / 128.0) + n2 * vec2(0.3 / 256.0, 0.3 / 128.0));
  vec4 cl = texture(uClimate, uvc);
  vec4 bio = texture(uBio, uvc);
  float Ta = cl.r * 110.0 - 60.0;
  float Tm = cl.g * 110.0 - 60.0;
  float rain = cl.b * cl.b * 6000.0;
  // Land: kahler Boden nach Klima, darüber Pflanzen, darüber Schnee
  float dry = smoothstep(900.0, 150.0, rain);
  float cold = smoothstep(2.0, -12.0, Ta);
  vec3 bare = mix(SOIL, SAND, dry);
  bare = mix(bare, REDROCK, dry * smoothstep(18.0, 30.0, Ta) * 0.5);
  bare = mix(bare, ROCK, cold);
  float warm = smoothstep(-4.0, 24.0, Ta);
  float wet = smoothstep(250.0, 1800.0, rain);
  vec3 vc = mix(mix(TUNDRA, TAIGA, wet), mix(SAVANNA, RAINFOREST, wet), warm);
  vc = mix(vc, TEMPERATE, max(0.0, 1.0 - abs(warm - 0.55) * 2.2) * wet * 0.5);
  float veg = bio.r * (0.8 + 0.4 * (n2 * 0.5 + 0.5));
  vec3 land = mix(bare, vc, smoothstep(0.0, 0.42, veg));
  land *= 0.93 + 0.14 * (n2 * 0.5 + 0.5) + 0.07 * nn.z + 0.06 * nn.w;
  // Strand an flachen Küsten
  float beach = smoothstep(0.045, 0.0, e - uSeaLevel) * (1.0 - cold) * (1.0 - 0.6 * smoothstep(0.5, 0.9, veg));
  land = mix(land, SAND * 1.04, beach * 0.75);
  land = mix(land, ROCK * 0.95, smoothstep(2.4, 4.2, e) * 0.75);
  float snowAmt = max(max(cl.a, bio.a), smoothstep(4.4, 5.8, e));
  land = mix(land, SNOW, smoothstep(0.3, 0.7, snowAmt + n2 * 0.15) * (1.0 - 0.35 * bio.r * step(cl.a, 0.5)));
  // Meer: Tiefe, Algen, Eis
  float d = uSeaLevel - e;
  vec3 sea = mix(SEA_SHALLOW * 1.12, SEA_SHALLOW, smoothstep(0.0, 0.06, d));
  sea = mix(sea, SEA_MID, smoothstep(0.04, 0.8, d));
  sea = mix(sea, SEA_DEEP, smoothstep(0.6, 4.6, d));
  sea = mix(sea, ALGAE, bio.g * 0.45);
  sea = mix(sea, SEA_ICE, smoothstep(0.25, 0.65, bio.b + n2 * 0.12));
  vec3 col = mix(land, sea, water);
  if (uLayer == 1) {
    col = tempRamp(Tm) * mix(1.0, 0.82, water);
  } else if (uLayer == 2) {
    col = mix(rainRamp(rain), sea * 0.4 + vec3(0.03, 0.05, 0.08), water);
  } else if (uLayer == 3) {
    vec4 lf = texture(uLife, uv);
    float l = dot(col, vec3(0.3, 0.55, 0.15)) * 0.42;
    col = mix(vec3(l * 0.9, l * 0.95, l * 1.15), lf.rgb, smoothstep(0.0, 0.55, lf.a));
  }
  return col;
}

float relief(float e, float kmPerPx) {
  vec2 g = vec2(dFdx(e), dFdy(e)) / max(kmPerPx, 0.002);
  return 1.0 + clamp((-g.x + g.y) * 0.55, -0.45, 0.35);
}
`;

export const GLOBE_FS = `#version 300 es
${COMMON}
uniform vec2 uRes;
uniform vec2 uOrigin;
uniform float uHalf;
uniform float uAlpha;
uniform float uDist;
uniform float uTanHalf;
uniform float uTilt;
uniform float uLon;
uniform vec3 uSun;
uniform float uClouds;
uniform float uKmPerPx;
out vec4 outColor;

void main() {
  vec2 p = (gl_FragCoord.xy - uOrigin) / uHalf;
  vec3 ro = vec3(0.0, 0.0, uDist);
  vec3 rd = normalize(vec3(p * uTanHalf, -1.0));
  float b = dot(ro, rd);
  float c = dot(ro, ro) - 1.0;
  float h = b * b - c;
  vec3 atmo = vec3(0.36, 0.62, 1.0);
  if (h < 0.0) {
    float dmin = sqrt(max(0.0, dot(ro, ro) - b * b));
    vec3 cp = normalize(ro + rd * (-b));
    float glow = exp(-(dmin - 1.0) / 0.03);
    float lit = 0.2 + 0.8 * smoothstep(-0.35, 0.6, dot(cp, uSun));
    float a = clamp(glow * lit * 0.9, 0.0, 1.0);
    outColor = vec4(atmo * a, a) * uAlpha;
    return;
  }
  float t = -b - sqrt(h);
  vec3 n = normalize(ro + rd * t);
  float ct = cos(uTilt);
  float st = sin(uTilt);
  float up = n.y * ct + n.z * st;
  float fwd = n.z * ct - n.y * st;
  float lat = asin(clamp(up, -1.0, 1.0));
  float lon = atan(n.x, fwd) + uLon;
  vec2 uv = vec2(fract(lon / (2.0 * PI) + 0.5), 0.5 - lat / PI);
  vec3 sp = vec3(cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat));
  vec4 nn;
  float e = elevation(uv, sp, uDetail, nn);
  float water;
  vec3 col = surface(uv, e, nn, water);
  col *= mix(relief(e, uKmPerPx), 1.0, water);
  // Wolken (dichter, wo es viel regnet)
  if (uClouds > 0.0 && uLayer == 0) {
    vec3 q = sp * 3.0 + vec3(uTime * 0.011, uTime * 0.006, 0.0);
    float cn = snoise(q) * 0.6 + snoise(q * 2.3 + 7.1) * 0.28 + snoise(q * 6.1) * 0.12;
    float wetness = texture(uClimate, uv).b;
    float cover = 0.66 - wetness * 0.5;
    float cloud = smoothstep(cover, cover + 0.28, cn * 0.5 + 0.5) * uClouds;
    col = mix(col, vec3(0.96, 0.97, 0.99), cloud * 0.82);
    water *= 1.0 - cloud;
  }
  float diff = dot(n, uSun);
  float day = smoothstep(-0.14, 0.32, diff);
  vec3 lit = col * (0.055 + 0.945 * day * (0.5 + 0.5 * max(diff, 0.0)));
  vec3 v = -rd;
  vec3 hv = normalize(uSun + v);
  lit += vec3(pow(max(dot(n, hv), 0.0), 70.0) * 0.4 * water * day);
  // Lichter von Siedlungen auf der Nachtseite
  float lights = texture(uExtra, uv).b;
  if (lights > 0.01) {
    float speck = smoothstep(0.1, 0.9, snoise(sp * 160.0) * 0.5 + 0.5);
    lit += vec3(1.0, 0.72, 0.38) * lights * (1.0 - day) * (0.35 + 0.9 * speck);
  }
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  lit += atmo * rim * (0.12 + 0.6 * day);
  outColor = vec4(lit, 1.0) * uAlpha;
}
`;

export const MAP_FS = `#version 300 es
${COMMON}
uniform vec2 uRes;
uniform vec2 uOrigin;
uniform float uAlpha;
uniform vec2 uCenter;
uniform float uZoom;
uniform vec2 uGrid;
uniform float uKmPerPx;
out vec4 outColor;

void main() {
  vec2 px = gl_FragCoord.xy - uOrigin;
  vec2 cell = uCenter + vec2(px.x, -px.y) / uZoom;
  if (cell.y < 0.0 || cell.y > uGrid.y) {
    outColor = vec4(0.0);
    return;
  }
  vec2 uv = vec2(fract(cell.x / uGrid.x), cell.y / uGrid.y);
  float lon = (uv.x - 0.5) * 2.0 * PI;
  float lat = (0.5 - uv.y) * PI;
  vec3 sp = vec3(cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat));
  vec4 nn;
  float e = elevation(uv, sp, uDetail, nn);
  float water;
  vec3 col = surface(uv, e, nn, water);
  col *= mix(relief(e, uKmPerPx), 1.0, water);
  // Nahansicht: Baumkronen mit Licht von links oben und Schatten, wo Wald wächst
  if (uDetail > 0.0 && uLayer == 0 && water < 0.5) {
    float veg = texture(uBio, uv).r;
    float wetness = texture(uClimate, uv).b;
    vec2 tp = cell * 7.0;
    vec2 ti = floor(tp);
    vec2 tf = fract(tp);
    float hs = fract(sin(dot(ti, vec2(127.1, 311.7))) * 43758.5453);
    vec2 cen = vec2(0.5) + (vec2(fract(hs * 13.1), fract(hs * 7.7)) - 0.5) * 0.42;
    float r = 0.27 + 0.15 * fract(hs * 3.3);
    float dens = smoothstep(0.3, 0.85, veg) * (0.35 + 0.65 * smoothstep(0.15, 0.6, wetness));
    float present = step(1.0 - dens * 1.25, hs) * uDetail;
    vec2 dv = tf - cen;
    float d = length(dv);
    float aa = max(fwidth(d), 0.02);
    float shadow = smoothstep(r, r - aa * 2.0, length(dv - vec2(0.08, 0.08))) * present;
    float crown = smoothstep(r, r - aa, d) * present;
    float shade = 0.5 + 0.5 * dot(dv / max(d, 0.0001), vec2(-0.7071, -0.7071)) * smoothstep(0.0, r, d);
    vec3 leaf = mix(col, vec3(0.12, 0.29, 0.14), 0.38);
    col = mix(col, col * 0.62, shadow * 0.7);
    col = mix(col, leaf * (0.66 + 0.5 * shade), crown);
  }
  // Wasser: leichte Wellen und Schaum an der Küste
  if (uDetail > 0.2 && uLayer == 0 && water > 0.5) {
    float wv = snoise(sp * 900.0 + vec3(0.0, 0.0, uTime * 0.18)) * 0.6 + snoise(sp * 2300.0 + vec3(uTime * 0.25, 0.0, 0.0)) * 0.4;
    col *= 1.0 + wv * 0.07 * uDetail;
    float depth = uSeaLevel - e;
    float foam = smoothstep(0.025, 0.0, depth) * (0.55 + 0.45 * sin(uTime * 1.6 + wv * 5.0));
    col = mix(col, vec3(0.86, 0.93, 0.96), foam * 0.45 * uDetail);
  }
  outColor = vec4(col, 1.0) * uAlpha;
}
`;

export const SKY_FS = `#version 300 es
precision highp float;
uniform sampler2D uSky;
uniform vec2 uRes;
out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  outColor = texture(uSky, vec2(uv.x, 1.0 - uv.y));
}
`;

// Lebewesen: ein Quadrat je Exemplar, Bild aus dem Atlas oder weicher Punkt
export const SPRITE_VS = `#version 300 es
in vec2 aCorner;
in vec4 aInst;
in vec4 aColor;
in float aFlip;
uniform vec2 uRes;
uniform float uAtlasN;
out vec2 vUv;
out vec4 vColor;
out vec2 vCorner;
out float vDot;
void main() {
  vec2 pos = aInst.xy + aCorner * aInst.z * 0.5;
  gl_Position = vec4(pos.x / uRes.x * 2.0 - 1.0, 1.0 - pos.y / uRes.y * 2.0, 0.0, 1.0);
  float slot = aInst.w;
  vDot = slot < 0.0 ? 1.0 : 0.0;
  vec2 cu = vec2(aCorner.x * aFlip, aCorner.y) * 0.5 + 0.5;
  float s = max(slot, 0.0);
  vec2 cellUv = vec2(mod(s, uAtlasN), floor(s / uAtlasN));
  vUv = (cellUv + cu) / uAtlasN;
  vColor = aColor;
  vCorner = aCorner;
}
`;

export const SPRITE_FS = `#version 300 es
precision highp float;
uniform sampler2D uAtlas;
in vec2 vUv;
in vec4 vColor;
in vec2 vCorner;
in float vDot;
out vec4 outColor;
void main() {
  if (vDot > 0.5) {
    float d = length(vCorner);
    float core = smoothstep(1.0, 0.45, d);
    float ring = smoothstep(1.0, 0.8, d) - smoothstep(0.75, 0.55, d);
    vec3 c = mix(vColor.rgb, vec3(0.02, 0.03, 0.07), ring * 0.6);
    outColor = vec4(c * core, core) * vColor.a;
    return;
  }
  vec4 t = texture(uAtlas, vUv);
  outColor = vec4(t.rgb * vColor.rgb, t.a) * vColor.a;
}
`;
