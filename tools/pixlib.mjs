// pixlib.mjs — dependency-free PNG encoder + pixel-art drawing primitives.
// Used by tools/genart.mjs to author every sprite in the game as original art.
import zlib from 'node:zlib';

/* ---------- PNG encoding ---------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** Encode RGBA bytes as an 8-bit truecolour-alpha PNG. */
export function encodePNG(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none — keeps flat pixel art tiny after deflate
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- palette ---------- */
// One shared, deliberately limited palette. Every sprite in the game draws from
// it, which is what makes the art read as a single set.
export const PAL = {
  _: null,                 // transparent
  K: '#080b14',            // outline / deepest shadow
  a: '#141c2e',            // hull shadow
  b: '#22304a',            // hull dark
  c: '#33486a',            // hull mid
  d: '#4d6a95',            // hull light
  e: '#7893bd',            // hull highlight
  f: '#bed2ee',            // near-white cold
  W: '#ffffff',            // pure white spark core
  g: '#5a3316',            // copper shadow
  h: '#8f5220',            // copper dark
  i: '#c47a2c',            // copper
  j: '#eda43f',            // amber
  k: '#ffd06a',            // bright amber
  l: '#fff0b8',            // amber glow
  m: '#0e5c73',            // arc shadow
  n: '#18a5c9',            // arc mid
  o: '#3fdcff',            // arc bright
  p: '#a9f2ff',            // arc glow
  q: '#5c1622',            // danger shadow
  r: '#a32b30',            // danger dark
  s: '#e04a3c',            // danger
  t: '#ff8a63',            // danger light
  u: '#1d5c3d',            // support shadow
  v: '#2f9e63',            // support
  w: '#59d98d',            // support light
  x: '#3b2358',            // armour shadow
  y: '#6b45a6',            // armour
  z: '#a077d6',            // armour light
  '1': '#2a2f3d',          // floor dark
  '2': '#363d4f',          // floor mid
  '3': '#434c61',          // floor light
  '4': '#525d76',          // floor accent
};

function hexToRGB(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/* ---------- pixel canvas ---------- */
export class Pix {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4); // all zero = transparent
  }

  clone() {
    const p = new Pix(this.w, this.h);
    p.data.set(this.data);
    return p;
  }

  /** Set a pixel. `col` is a PAL key, a #rrggbb string, or null (skip). */
  px(x, y, col, alpha = 255) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
    const hex = col && col.length === 1 ? PAL[col] : col;
    if (!hex) return this;
    const [r, g, b] = hexToRGB(hex);
    const i = (y * this.w + x) * 4;
    if (alpha >= 255) {
      this.data[i] = r; this.data[i + 1] = g; this.data[i + 2] = b; this.data[i + 3] = 255;
    } else {
      // source-over blend, so glows can be layered
      const sa = alpha / 255, da = this.data[i + 3] / 255;
      const oa = sa + da * (1 - sa);
      if (oa <= 0) return this;
      for (let k = 0; k < 3; k++) {
        const sc = [r, g, b][k];
        this.data[i + k] = (sc * sa + this.data[i + k] * da * (1 - sa)) / oa;
      }
      this.data[i + 3] = oa * 255;
    }
    return this;
  }

  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[(y * this.w + x) * 4 + 3];
  }

  /** Filled rectangle. */
  rect(x, y, w, h, col, alpha = 255) {
    for (let j = 0; j < h; j++) for (let k = 0; k < w; k++) this.px(x + k, y + j, col, alpha);
    return this;
  }

  /** 1px rectangle border. */
  frame(x, y, w, h, col) {
    for (let k = 0; k < w; k++) { this.px(x + k, y, col); this.px(x + k, y + h - 1, col); }
    for (let j = 0; j < h; j++) { this.px(x, y + j, col); this.px(x + w - 1, y + j, col); }
    return this;
  }

  /** Filled ellipse inscribed in the given box. */
  ellipse(cx, cy, rx, ry, col, alpha = 255) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / (rx || 1), dy = (y - cy) / (ry || 1);
        if (dx * dx + dy * dy <= 1.0) this.px(x, y, col, alpha);
      }
    }
    return this;
  }

  ring(cx, cy, rx, ry, col, alpha = 255) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / (rx || 1), dy = (y - cy) / (ry || 1);
        const d = dx * dx + dy * dy;
        if (d <= 1.0 && d >= 0.44) this.px(x, y, col, alpha);
      }
    }
    return this;
  }

  line(x0, y0, x1, y1, col, alpha = 255) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.px(x0, y0, col, alpha);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return this;
  }

  /** Mirror the left half onto the right half (exclusive of an odd centre column). */
  mirrorX() {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w / 2; x++) {
        const src = (y * this.w + x) * 4;
        const dst = (y * this.w + (this.w - 1 - x)) * 4;
        for (let k = 0; k < 4; k++) this.data[dst + k] = this.data[src + k];
      }
    }
    return this;
  }

  /** Add a 1px outline of `col` around every opaque cluster. */
  outline(col = 'K') {
    const add = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y) > 0) continue;
        if (this.get(x - 1, y) > 128 || this.get(x + 1, y) > 128 ||
            this.get(x, y - 1) > 128 || this.get(x, y + 1) > 128) add.push([x, y]);
      }
    }
    for (const [x, y] of add) this.px(x, y, col);
    return this;
  }

  /** Soft radial glow, used sparingly for sparks and cores. */
  glow(cx, cy, r, col, peak = 150) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d > r) continue;
        this.px(x, y, col, Math.round(peak * (1 - d / r) ** 2));
      }
    }
    return this;
  }

  /** Paint from an ASCII map; each char is a PAL key, space/'.' is skipped. */
  art(x, y, rows) {
    rows.forEach((row, j) => {
      for (let k = 0; k < row.length; k++) {
        const ch = row[k];
        if (ch === ' ' || ch === '.') continue;
        this.px(x + k, y + j, ch);
      }
    });
    return this;
  }

  /** Blit another Pix, honouring alpha. */
  blit(src, dx, dy) {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const i = (y * src.w + x) * 4;
        const a = src.data[i + 3];
        if (!a) continue;
        const hex = '#' + [src.data[i], src.data[i + 1], src.data[i + 2]]
          .map((v) => v.toString(16).padStart(2, '0')).join('');
        this.px(dx + x, dy + y, hex, a);
      }
    }
    return this;
  }

  /** Recolour: map PAL key -> PAL key, applied by exact RGB match. */
  swap(map) {
    const pairs = Object.entries(map).map(([from, to]) => [
      hexToRGB(from.length === 1 ? PAL[from] : from),
      hexToRGB(to.length === 1 ? PAL[to] : to),
    ]);
    for (let i = 0; i < this.data.length; i += 4) {
      if (!this.data[i + 3]) continue;
      for (const [f, t] of pairs) {
        if (this.data[i] === f[0] && this.data[i + 1] === f[1] && this.data[i + 2] === f[2]) {
          this.data[i] = t[0]; this.data[i + 1] = t[1]; this.data[i + 2] = t[2];
          break;
        }
      }
    }
    return this;
  }

  toPNG() {
    return encodePNG(this.w, this.h, Buffer.from(this.data.buffer, this.data.byteOffset, this.data.length));
  }
}

/** Lay frames out into a horizontal strip (a Phaser spritesheet). */
export function sheet(frames, fw, fh) {
  const out = new Pix(fw * frames.length, fh);
  frames.forEach((f, i) => out.blit(f, i * fw, 0));
  return out;
}

/** Lay frames out into a grid of `cols` columns. */
export function grid(frames, fw, fh, cols) {
  const rows = Math.ceil(frames.length / cols);
  const out = new Pix(fw * cols, fh * rows);
  frames.forEach((f, i) => out.blit(f, (i % cols) * fw, Math.floor(i / cols) * fh));
  return out;
}

/** Deterministic PRNG so regenerating art produces byte-identical files. */
export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
