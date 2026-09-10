// world.mjs — arena tiles, props, pickups, projectiles and effects.
import { Pix, mulberry } from '../pixlib.mjs';

const T = 32; // tile size

/* ---------------- floor tiles ---------------- */
// Three arenas share one construction so they feel like one factory, and differ
// by accent colour and surface detail. Backgrounds stay lower-contrast than
// anything the player has to react to.
const ARENAS = {
  sorting: { base: '#2b2f36', mid: '#3a3f48', hi: '#4a505b', accent: 'c', spark: 'd' },
  foundry: { base: '#33251c', mid: '#443226', hi: '#553f31', accent: 'h', spark: 'i' },
  arc:     { base: '#12202c', mid: '#1a2c3b', hi: '#253d50', accent: 'm', spark: 'n' },
};

export function floorTile(arena, variant) {
  const c = ARENAS[arena];
  const p = new Pix(T, T);
  const rnd = mulberry(variant * 7919 + arena.length * 131);
  p.rect(0, 0, T, T, c.mid);

  // concrete speckle — subtle, never enough to read as an entity
  for (let i = 0; i < 46; i++) {
    const x = Math.floor(rnd() * T), y = Math.floor(rnd() * T);
    p.px(x, y, rnd() > 0.55 ? c.hi : c.base);
  }
  // panel seams
  p.rect(0, 0, T, 1, c.base);
  p.rect(0, 0, 1, T, c.base);
  p.rect(0, 1, T, 1, c.hi, 90);
  p.rect(1, 0, 1, T, c.hi, 90);

  if (variant === 1) {
    // grating strip
    for (let x = 6; x < 26; x += 4) p.rect(x, 8, 2, 16, c.base);
    p.rect(5, 7, 22, 1, c.hi);
    p.rect(5, 24, 22, 1, c.base);
  } else if (variant === 2) {
    // bolted plate
    p.frame(6, 6, 20, 20, c.base);
    for (const [x, y] of [[8, 8], [23, 8], [8, 23], [23, 23]]) p.px(x, y, c.hi);
  } else if (variant === 3) {
    // accent conduit running through the tile
    p.rect(0, 14, T, 4, c.base);
    p.rect(0, 15, T, 2, c.accent);
    p.rect(0, 15, T, 1, c.spark, 120);
    for (let x = 3; x < T; x += 9) p.rect(x, 13, 2, 6, c.hi);
  }
  return p;
}

/* ---------------- props ---------------- */
export function propCrate() {
  const p = new Pix(24, 22);
  p.rect(2, 4, 20, 16, 'b');
  p.rect(2, 4, 20, 1, 'd');
  p.rect(2, 19, 20, 1, 'a');
  p.rect(2, 4, 1, 16, 'd');
  p.rect(21, 4, 1, 16, 'a');
  p.line(3, 5, 20, 18, 'c'); p.line(20, 5, 3, 18, 'c');
  p.rect(2, 11, 20, 2, 'g');
  p.rect(2, 11, 20, 1, 'h');
  p.outline('K');
  return p;
}

export function propPipe() {
  const p = new Pix(40, 16);
  p.rect(0, 4, 40, 8, 'b');
  p.rect(0, 4, 40, 2, 'c');
  p.rect(0, 10, 40, 2, 'a');
  for (const x of [6, 20, 33]) { p.rect(x, 2, 4, 12, 'c'); p.rect(x, 2, 4, 1, 'd'); }
  p.outline('K');
  return p;
}

export function propVent() {
  const p = new Pix(28, 20);
  p.rect(1, 2, 26, 16, 'a');
  p.frame(1, 2, 26, 16, 'c');
  for (let y = 5; y < 17; y += 3) p.rect(3, y, 22, 2, 'b');
  for (let y = 5; y < 17; y += 3) p.rect(3, y, 22, 1, 'c');
  p.outline('K');
  return p;
}

export function propBarrelStack() {
  const p = new Pix(26, 28);
  for (const [x, y] of [[0, 11], [13, 11], [6, 0]]) {
    p.ellipse(x + 6, y + 9, 6, 8, 'b');
    p.ellipse(x + 6, y + 8, 5, 7, 'c');
    p.rect(x + 1, y + 5, 11, 1, 'a');
    p.rect(x + 1, y + 12, 11, 1, 'a');
    p.rect(x + 3, y + 7, 6, 4, 'g');
    p.rect(x + 3, y + 7, 6, 1, 'h');
  }
  p.outline('K');
  return p;
}

/* ---------------- pickups ---------------- */
// Each pickup has its own shape as well as its own colour, so colour-blind
// players still tell scrap from sparks from repair cells.

// SCRAP — irregular copper chunk (currency inside a contract).
export function pickupScrap(frame) {
  const p = new Pix(12, 12);
  const b = frame ? 1 : 0;
  p.art(1, 2 + b, [
    ' hhh  ',
    'hiiih ',
    'hijjih',
    'hiijih',
    ' hiih ',
    '  hh  ',
  ]);
  p.px(3, 4 + b, 'k');
  p.glow(6, 6 + b, 5, 'j', 45);
  p.outline('K');
  return p;
}

// SPARK — sharp amber diamond (experience toward the next module offer).
export function pickupSpark(frame) {
  const p = new Pix(10, 10);
  const b = frame ? 1 : 0;
  p.line(5, 0 + b, 8, 5 + b, 'j'); p.line(8, 5 + b, 5, 9 + b, 'j');
  p.line(5, 9 + b, 2, 5 + b, 'j'); p.line(2, 5 + b, 5, 0 + b, 'j');
  p.ellipse(5, 5 + b, 2, 3, 'k');
  p.px(5, 4 + b, 'l'); p.px(4, 5 + b, 'l');
  p.glow(5, 5 + b, 5, 'k', 60);
  p.outline('K');
  return p;
}

// REPAIR CELL — green cross (health).
export function pickupCell(frame) {
  const p = new Pix(12, 12);
  const b = frame ? 1 : 0;
  p.rect(2, 3 + b, 8, 6, 'u');
  p.rect(2, 3 + b, 8, 1, 'v');
  p.rect(4, 4 + b, 4, 1, 'w');
  p.rect(5, 2 + b, 2, 8, 'w');
  p.rect(2, 5 + b, 8, 2, 'w');
  p.glow(6, 6 + b, 6, 'w', 55);
  p.outline('K');
  return p;
}

/* ---------------- projectiles ---------------- */
export function projRivet() {
  const p = new Pix(8, 8);
  p.rect(2, 1, 4, 6, 'i');
  p.rect(2, 1, 4, 2, 'k');
  p.rect(3, 0, 2, 1, 'l');
  p.rect(2, 6, 4, 1, 'h');
  p.glow(4, 3, 4, 'j', 70);
  p.outline('K');
  return p;
}

export function projSaw(frame) {
  const p = new Pix(20, 20);
  const rot = (frame / 4) * (Math.PI / 4);
  p.ellipse(10, 10, 8, 8, 'c');
  p.ellipse(10, 10, 6, 6, 'd');
  p.ellipse(10, 10, 3, 3, 'b');
  p.ellipse(10, 10, 1, 1, 'e');
  for (let i = 0; i < 8; i++) {
    const a = rot + (i / 8) * Math.PI * 2;
    const tx = 10 + Math.cos(a) * 9, ty = 10 + Math.sin(a) * 9;
    p.px(tx, ty, 'f');
    p.px(tx + Math.cos(a + 0.4), ty + Math.sin(a + 0.4), 'e');
  }
  p.outline('K');
  return p;
}

export function projArc(frame) {
  const p = new Pix(12, 12);
  const j = frame ? 1 : -1;
  p.line(6, 0, 4 + j, 5, 'o');
  p.line(4 + j, 5, 8 - j, 6, 'o');
  p.line(8 - j, 6, 5, 11, 'o');
  p.ellipse(6, 6, 2, 2, 'p');
  p.px(6, 6, 'W');
  p.glow(6, 6, 6, 'o', 90);
  return p;
}

export function projShell() {
  const p = new Pix(12, 12);
  p.ellipse(6, 6, 3, 4, 'c');
  p.ellipse(6, 5, 2, 3, 'e');
  p.rect(5, 1, 2, 3, 'j');       // amber nose keeps it visible in flight
  p.px(6, 1, 'l');
  p.rect(4, 9, 4, 2, 'i');       // burn trail
  p.rect(5, 10, 2, 1, 'k');
  p.glow(6, 10, 4, 'j', 80);
  p.outline('K');
  return p;
}

export function projShard() {
  const p = new Pix(8, 8);
  p.line(1, 1, 6, 6, 'f');
  p.line(1, 2, 5, 6, 'e');
  p.line(2, 1, 6, 5, 'e');
  p.px(1, 1, 'W');
  p.glow(3, 3, 4, 'f', 70);
  p.outline('K');
  return p;
}

// Enemy plasma — red, distinct round shape so hostile shots never read as loot.
export function projPlasma(frame) {
  const p = new Pix(10, 10);
  const r = frame ? 3 : 3.4;
  p.ellipse(5, 5, r, r, 'q');
  p.ellipse(5, 5, r - 1, r - 1, 's');
  p.ellipse(5, 5, 1, 1, 't');
  p.px(4, 4, 'l');
  p.glow(5, 5, 6, 's', 90);
  p.outline('K');
  return p;
}

/* ---------------- effects ---------------- */
export function fxHit(frame) {
  const p = new Pix(16, 16);
  const r = 2 + frame * 2.2;
  const cols = ['l', 'k', 'j', 'h'];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + frame * 0.25;
    p.line(8 + Math.cos(a) * (r - 2), 8 + Math.sin(a) * (r - 2),
           8 + Math.cos(a) * r, 8 + Math.sin(a) * r, cols[frame] || 'h');
  }
  if (frame < 2) p.ellipse(8, 8, 2 - frame, 2 - frame, 'W');
  return p;
}

export function fxBoom(frame) {
  const p = new Pix(40, 40);
  const t = frame / 5;
  const r = 4 + t * 16;
  const rnd = mulberry(1337 + frame);
  const fade = 1 - t; // everything thins out together rather than going dark
  // hot body first, so the ring sits on top of it
  p.ellipse(20, 20, r * 0.82, r * 0.82,
    ['l', 'k', 'j', 's', 's', 'r'][frame], Math.round(215 * fade));
  p.ellipse(20, 20, r * 0.45, r * 0.45,
    ['W', 'l', 'k', 'k', 'j', 'j'][frame], Math.round(235 * fade));
  // shockwave ring
  p.ring(20, 20, r, r, frame < 3 ? 't' : 'k', Math.round(210 * fade));
  // debris
  for (let i = 0; i < 12; i++) {
    const a = rnd() * Math.PI * 2, d = r * (0.85 + rnd() * 0.55);
    p.px(20 + Math.cos(a) * d, 20 + Math.sin(a) * d, frame < 3 ? 'l' : 'k', Math.round(255 * fade));
  }
  p.glow(20, 20, r + 5, 'j', Math.round(100 * fade));
  return p;
}

export function fxPop(frame) {
  const p = new Pix(16, 16);
  const r = 2 + frame * 3;
  p.ring(8, 8, r, r, 'k', 190 - frame * 55);
  p.ring(8, 8, r - 1, r - 1, 'l', 140 - frame * 45);
  return p;
}

export function fxUpgrade(frame) {
  const p = new Pix(48, 48);
  const t = frame / 4;
  p.ring(24, 24, 6 + t * 17, 4 + t * 12, 'o', 210 - frame * 40);
  p.ring(24, 24, 5 + t * 17, 3 + t * 12, 'p', 150 - frame * 30);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + t * 1.2;
    const d = 8 + t * 16;
    p.px(24 + Math.cos(a) * d, 24 + Math.sin(a) * d * 0.7, 'f');
  }
  return p;
}

// Ground telegraph ring — drawn under an incoming attack so danger is readable
// even when particles are on top.
export function fxWarnRing(frame) {
  const p = new Pix(64, 64);
  const t = frame / 3;
  p.ring(32, 32, 28, 28, 's', 90 + t * 140);
  p.ring(32, 32, 27, 27, 't', 60 + t * 110);
  p.ellipse(32, 32, 26, 26, 's', 10 + t * 16);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    p.line(32 + Math.cos(a) * 22, 32 + Math.sin(a) * 22,
           32 + Math.cos(a) * 26, 32 + Math.sin(a) * 26, 't', 120 + t * 100);
  }
  return p;
}
