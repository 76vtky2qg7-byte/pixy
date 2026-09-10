#!/usr/bin/env node
// genart.mjs — regenerates every sprite in the game from source code.
// Deterministic: running it twice produces byte-identical PNGs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pix, grid, mulberry } from './pixlib.mjs';
import * as A from './art/actors.mjs';
import * as W from './art/world.mjs';
import * as I from './art/icons.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src', 'assets');
fs.mkdirSync(OUT, { recursive: true });

const manifest = {};
function write(name, pix, frameW, frameH) {
  const file = path.join(OUT, name + '.png');
  fs.writeFileSync(file, pix.toPNG());
  manifest[name] = { w: pix.w, h: pix.h, frameW, frameH, frames: (pix.w / frameW) * (pix.h / frameH) };
  return file;
}

/* ---- actors: 32x32, 8 columns ---- */
const actorFrames = [
  A.heroScrap(0), A.heroScrap(1),
  A.heroVolt(0), A.heroVolt(1),
  A.enemyCrusher(0), A.enemyCrusher(1),
  A.enemySkitter(0), A.enemySkitter(1),
  A.enemyBulwark(0), A.enemyBulwark(1),
  A.enemyLancer(0, 0), A.enemyLancer(1, 0),
  A.enemyLancer(0, 0.6), A.enemyLancer(0, 1),
  A.enemyKegger(0, 0), A.enemyKegger(1, 0),
  A.enemyKegger(0, 0.7), A.enemyKegger(0, 1),
  A.enemyMender(0), A.enemyMender(1),
];
write('actors', grid(actorFrames, 32, 32, 8), 32, 32);

/* ---- bosses: 64x64 ---- */
const bossFrames = [
  A.bossPress(0, 0), A.bossPress(1, 0), A.bossPress(0, 0.35), A.bossPress(0, 0.7), A.bossPress(0, 1),
  A.bossArc(0, 0), A.bossArc(1, 0), A.bossArc(0, 0.4), A.bossArc(1, 0.7), A.bossArc(0, 1),
];
write('bosses', grid(bossFrames, 64, 64, 5), 64, 64);

/* ---- pickups: 16x16 ---- */
function pad(src, w, h) {
  const p = new Pix(w, h);
  p.blit(src, Math.floor((w - src.w) / 2), Math.floor((h - src.h) / 2));
  return p;
}
const pickupFrames = [
  W.pickupScrap(0), W.pickupScrap(1),
  W.pickupSpark(0), W.pickupSpark(1),
  W.pickupCell(0), W.pickupCell(1),
].map((p) => pad(p, 16, 16));
write('pickups', grid(pickupFrames, 16, 16, 6), 16, 16);

/* ---- projectiles: 20x20 ---- */
const projFrames = [
  W.projRivet(),
  W.projSaw(0), W.projSaw(1), W.projSaw(2), W.projSaw(3),
  W.projArc(0), W.projArc(1),
  W.projShell(), W.projShard(),
  W.projPlasma(0), W.projPlasma(1),
].map((p) => pad(p, 20, 20));
write('proj', grid(projFrames, 20, 20, 6), 20, 20);

/* ---- effects ---- */
write('fx_hit', grid([0, 1, 2, 3].map((f) => W.fxHit(f)), 16, 16, 4), 16, 16);
write('fx_pop', grid([0, 1, 2, 3].map((f) => W.fxPop(f)), 16, 16, 4), 16, 16);
write('fx_boom', grid([0, 1, 2, 3, 4, 5].map((f) => W.fxBoom(f)), 40, 40, 6), 40, 40);
write('fx_upgrade', grid([0, 1, 2, 3, 4].map((f) => W.fxUpgrade(f)), 48, 48, 5), 48, 48);
write('fx_warn', grid([0, 1, 2, 3].map((f) => W.fxWarnRing(f)), 64, 64, 4), 64, 64);

/* ---- tiles: 32x32, 4 variants per arena ---- */
const tileFrames = [];
for (const arena of ['sorting', 'foundry', 'arc']) {
  for (let v = 0; v < 4; v++) tileFrames.push(W.floorTile(arena, v));
}
write('tiles', grid(tileFrames, 32, 32, 4), 32, 32);

/* ---- props: 40x28 ---- */
const propFrames = [W.propCrate(), W.propPipe(), W.propVent(), W.propBarrelStack()]
  .map((p) => pad(p, 40, 28));
write('props', grid(propFrames, 40, 28, 4), 40, 28);

/* ---- gear icons: 20x20 ---- */
const iconFrames = [
  I.icoRiveter(), I.icoBuzzsaw(), I.icoArc(), I.icoMortar(), I.icoBeam(), I.icoHammer(),
  I.icoBattery(), I.icoHeatsink(), I.icoCoil(), I.icoTargeter(),
  I.icoFeeder(), I.icoPiston(), I.icoRepair(), I.icoMagnet(),
];
write('icons', grid(iconFrames, 20, 20, 7), 20, 20);

/* ---- currency glyphs: 14x14 ---- */
write('glyphs', grid([I.glyphScrap(), I.glyphCredit(), I.glyphHeart()], 14, 14, 3), 14, 14);

/* ---- number font: 7x9 ---- */
write('digits', grid(I.DIGIT_CHARS.map((c) => I.digitGlyph(c)), 7, 9, I.DIGIT_CHARS.length), 7, 9);
fs.writeFileSync(path.join(OUT, 'digits.chars.json'), JSON.stringify(I.DIGIT_CHARS));

/* ---- cover floor: a single repeatable 4x4 patch of the sorting-floor tiles.
       CSS cannot crop one frame out of a spritesheet and repeat it, so the
       store art needs a purpose-built seamless tile. ---- */
const coverFloor = new Pix(128, 128);
{
  const rnd = mulberry(20260910);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const r = rnd();
      const v = r < 0.72 ? 0 : r < 0.86 ? 1 : r < 0.94 ? 2 : 3;
      coverFloor.blit(W.floorTile('sorting', v), x * 32, y * 32);
    }
  }
}
write('cover_floor', coverFloor, 128, 128);

/* ---- store icon: composed scene, upscaled to 512 ---- */
function upscale(src, n) {
  const out = new Pix(src.w * n, src.h * n);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const i = (y * src.w + x) * 4;
    if (!src.data[i + 3]) continue;
    const hex = '#' + [src.data[i], src.data[i + 1], src.data[i + 2]]
      .map((v) => v.toString(16).padStart(2, '0')).join('');
    out.rect(x * n, y * n, n, n, hex, src.data[i + 3]);
  }
  return out;
}

const scene = new Pix(64, 64);
for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
  scene.blit(W.floorTile('sorting', (tx + ty * 2) % 4), tx * 32, ty * 32);
}
scene.rect(0, 0, 64, 64, '#0d1626', 90);          // vignette wash
scene.glow(32, 34, 26, '#c47a2c', 70);
scene.blit(W.fxWarnRing(1), 0, 6);
scene.blit(A.enemyCrusher(0), 34, 8);
scene.blit(A.enemySkitter(0), 0, 14);
scene.blit(A.heroScrap(0), 16, 26);
scene.blit(W.fxHit(1), 40, 26);
scene.blit(W.pickupScrap(0), 6, 46);
scene.blit(W.pickupSpark(0), 50, 44);
scene.frame(0, 0, 64, 64, '#0a0f1c');
write('store_icon', upscale(scene, 8), 512, 512);

/* ---- favicon: the hero robot on a dark plate, at 64px ---- */
const fav = new Pix(32, 32);
fav.rect(0, 0, 32, 32, '#12182a');
fav.frame(0, 0, 32, 32, '#0a0f1c');
fav.glow(16, 18, 13, '#c47a2c', 90);
fav.blit(A.heroScrap(0), 0, 1);
const favFile = path.join(ROOT, 'public', 'favicon.png');
fs.mkdirSync(path.dirname(favFile), { recursive: true });
fs.writeFileSync(favFile, upscale(fav, 2).toPNG());

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
const total = Object.keys(manifest).reduce((n, k) => n + fs.statSync(path.join(OUT, k + '.png')).size, 0);
console.log(`generated ${Object.keys(manifest).length} sheets, ${(total / 1024).toFixed(1)} KB total`);
for (const [k, v] of Object.entries(manifest)) console.log(`  ${k.padEnd(12)} ${v.w}x${v.h} (${v.frames} frames of ${v.frameW}x${v.frameH})`);
