// WebGL2-Darstellung: Sternenhimmel, Globus oder Karte, darüber die Lebewesen als Bilder oder Punkte.

import { FULLSCREEN_VS, GLOBE_FS, MAP_FS, SKY_FS, SPRITE_VS, SPRITE_FS } from './glsl.js';

export const ATLAS_N = 16; // 16 x 16 Bilder
export const ATLAS_CELL = 128;
export const INST_FLOATS = 9; // x, y, Größe, Bildnummer, r, g, b, a, Spiegelung

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(`Shader: ${log}`);
  }
  return s;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`Programm: ${gl.getProgramInfoLog(p)}`);
  const uni = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    uni[info.name] = gl.getUniformLocation(p, info.name);
  }
  return { p, uni };
}

export class Renderer {
  static create(canvas) {
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: true, powerPreference: 'high-performance' });
    if (!gl) return null;
    try {
      return new Renderer(canvas, gl);
    } catch (e) {
      console.error('EMERGENZ_FEHLER WebGL', e.message);
      return null;
    }
  }

  constructor(canvas, gl) {
    this.canvas = canvas;
    this.gl = gl;
    this.width = 1;
    this.height = 1;
    this.globe = program(gl, FULLSCREEN_VS, GLOBE_FS);
    this.map = program(gl, FULLSCREEN_VS, MAP_FS);
    this.sky = program(gl, FULLSCREEN_VS, SKY_FS);
    this.sprite = program(gl, SPRITE_VS, SPRITE_FS);
    // Ein Dreieck, das den ganzen Bildschirm bedeckt
    this.triVao = gl.createVertexArray();
    gl.bindVertexArray(this.triVao);
    const tri = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, tri);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    // Texturen
    this.tex = {
      terrain: this.makeTex(gl.R16F, 2, 1, gl.RED, gl.FLOAT, new Float32Array(2).fill(-1)),
      climate: this.makeTex(gl.RGBA8, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([140, 140, 120, 0])),
      bio: this.makeTex(gl.RGBA8, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)),
      life: this.makeTex(gl.RGBA8, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)),
      extra: this.makeTex(gl.RGBA8, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)),
      sky: this.makeTex(gl.RGBA8, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([5, 9, 19, 255])),
    };
    this.sizes = {};
    // Atlas für Bilder der Arten
    this.atlas = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    const side = ATLAS_N * ATLAS_CELL;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, side, side, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.atlasDirty = false;
    // Instanzen der Lebewesen
    this.spriteVao = gl.createVertexArray();
    gl.bindVertexArray(this.spriteVao);
    const corner = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, corner);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const locCorner = gl.getAttribLocation(this.sprite.p, 'aCorner');
    gl.enableVertexAttribArray(locCorner);
    gl.vertexAttribPointer(locCorner, 2, gl.FLOAT, false, 0, 0);
    this.instBuf = gl.createBuffer();
    this.instCap = 0;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    const stride = INST_FLOATS * 4;
    const locInst = gl.getAttribLocation(this.sprite.p, 'aInst');
    const locColor = gl.getAttribLocation(this.sprite.p, 'aColor');
    const locFlip = gl.getAttribLocation(this.sprite.p, 'aFlip');
    gl.enableVertexAttribArray(locInst);
    gl.vertexAttribPointer(locInst, 4, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(locInst, 1);
    gl.enableVertexAttribArray(locColor);
    gl.vertexAttribPointer(locColor, 4, gl.FLOAT, false, stride, 16);
    gl.vertexAttribDivisor(locColor, 1);
    gl.enableVertexAttribArray(locFlip);
    gl.vertexAttribPointer(locFlip, 1, gl.FLOAT, false, stride, 32);
    gl.vertexAttribDivisor(locFlip, 1);
    gl.bindVertexArray(null);
    this.lost = false;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
  }

  makeTex(internal, w, h, format, type, data) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  upload(name, internal, w, h, format, type, data) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex[name]);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const key = `${w}x${h}`;
    if (this.sizes[name] !== key) {
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
      this.sizes[name] = key;
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, format, type, data);
    }
  }

  setTerrain(elev, w, h) {
    const gl = this.gl;
    this.upload('terrain', gl.R16F, w, h, gl.RED, gl.FLOAT, elev);
  }

  setFields(f) {
    const gl = this.gl;
    this.upload('climate', gl.RGBA8, f.width, f.height, gl.RGBA, gl.UNSIGNED_BYTE, f.climate);
    this.upload('bio', gl.RGBA8, f.width, f.height, gl.RGBA, gl.UNSIGNED_BYTE, f.bio);
    if (f.life) this.upload('life', gl.RGBA8, f.width, f.height, gl.RGBA, gl.UNSIGNED_BYTE, f.life);
    if (f.extra) this.upload('extra', gl.RGBA8, f.width, f.height, gl.RGBA, gl.UNSIGNED_BYTE, f.extra);
  }

  setSky(canvas) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex.sky);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  }

  // Bild einer Art in den Atlas legen
  setSprite(slot, canvas) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    const x = (slot % ATLAS_N) * ATLAS_CELL;
    const y = Math.floor(slot / ATLAS_N) * ATLAS_CELL;
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    this.atlasDirty = true;
  }

  resize(cssW, cssH, dpr) {
    const w = Math.max(1, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.width = w;
    this.height = h;
    this.dpr = dpr;
  }

  bindPlanetTextures(prog) {
    const gl = this.gl;
    const names = [
      ['uTerrain', 'terrain'],
      ['uClimate', 'climate'],
      ['uBio', 'bio'],
      ['uLife', 'life'],
      ['uExtra', 'extra'],
    ];
    names.forEach(([u, t], i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, this.tex[t]);
      gl.uniform1i(prog.uni[u], i);
    });
  }

  begin() {
    const gl = this.gl;
    gl.viewport(0, 0, this.width, this.height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    // Sterne
    gl.useProgram(this.sky.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex.sky);
    gl.uniform1i(this.sky.uni.uSky, 0);
    gl.uniform2f(this.sky.uni.uRes, this.width, this.height);
    gl.bindVertexArray(this.triVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  common(prog, o) {
    const gl = this.gl;
    gl.uniform2f(prog.uni.uRes, this.width, this.height);
    gl.uniform1i(prog.uni.uLayer, o.layer);
    gl.uniform1f(prog.uni.uSeaLevel, o.seaLevel || 0);
    gl.uniform1f(prog.uni.uTime, o.time);
    gl.uniform1f(prog.uni.uDetail, o.detail || 0);
    gl.uniform1f(prog.uni.uAlpha, o.alpha === undefined ? 1 : o.alpha);
  }

  // Globus: cam = { dist, tanHalf, tilt, lon, ox, oy, half } (Mitte und Maßstab in Gerätepixeln, y nach oben)
  drawGlobe(cam, o) {
    const gl = this.gl;
    const P = this.globe;
    gl.useProgram(P.p);
    this.bindPlanetTextures(P);
    this.common(P, o);
    gl.uniform2f(P.uni.uOrigin, cam.ox, cam.oy);
    gl.uniform1f(P.uni.uHalf, cam.half);
    gl.uniform1f(P.uni.uDist, cam.dist);
    gl.uniform1f(P.uni.uTanHalf, cam.tanHalf);
    gl.uniform1f(P.uni.uTilt, cam.tilt);
    gl.uniform1f(P.uni.uLon, cam.lon);
    gl.uniform3f(P.uni.uSun, o.sun[0], o.sun[1], o.sun[2]);
    gl.uniform1f(P.uni.uClouds, o.clouds);
    gl.uniform1f(P.uni.uKmPerPx, o.kmPerPx);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.triVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // Karte: cam = { x, y, zoom (Gerätepixel je Zelle), ox, oy (Bildpunkt der Mitte, y nach oben) }
  drawMap(cam, o) {
    const gl = this.gl;
    const P = this.map;
    gl.useProgram(P.p);
    this.bindPlanetTextures(P);
    this.common(P, o);
    gl.uniform2f(P.uni.uOrigin, cam.ox, cam.oy);
    gl.uniform2f(P.uni.uCenter, cam.x, cam.y);
    gl.uniform1f(P.uni.uZoom, cam.zoom);
    gl.uniform2f(P.uni.uGrid, o.gridW, o.gridH);
    gl.uniform1f(P.uni.uKmPerPx, o.kmPerPx);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.triVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // Instanzen in Gerätepixeln
  drawSprites(inst, count) {
    if (!count) return;
    const gl = this.gl;
    if (this.atlasDirty) {
      gl.bindTexture(gl.TEXTURE_2D, this.atlas);
      gl.generateMipmap(gl.TEXTURE_2D);
      this.atlasDirty = false;
    }
    gl.useProgram(this.sprite.p);
    gl.uniform2f(this.sprite.uni.uRes, this.width, this.height);
    gl.uniform1f(this.sprite.uni.uAtlasN, ATLAS_N);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    gl.uniform1i(this.sprite.uni.uAtlas, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    const bytes = count * INST_FLOATS * 4;
    if (bytes > this.instCap) {
      this.instCap = Math.max(bytes, this.instCap * 2, 4096);
      gl.bufferData(gl.ARRAY_BUFFER, this.instCap, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, inst, 0, count * INST_FLOATS);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.spriteVao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    gl.bindVertexArray(null);
  }
}
