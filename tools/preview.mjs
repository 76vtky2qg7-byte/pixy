// preview.mjs — upscales generated sprites into a labelled contact sheet so the
// art can be eyeballed during development.
import fs from 'node:fs';
import { Pix, PAL } from './pixlib.mjs';
import * as A from './art/actors.mjs';

function upscale(src, n) {
  const out = new Pix(src.w * n, src.h * n);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const i = (y * src.w + x) * 4;
    if (!src.data[i + 3]) continue;
    const hex = '#' + [src.data[i], src.data[i+1], src.data[i+2]].map(v=>v.toString(16).padStart(2,'0')).join('');
    out.rect(x * n, y * n, n, n, hex, src.data[i + 3]);
  }
  return out;
}

const items = [
  ['scrap0', A.heroScrap(0)], ['scrap1', A.heroScrap(1)],
  ['volt0', A.heroVolt(0)], ['volt1', A.heroVolt(1)],
  ['crusher', A.enemyCrusher(0)], ['skitter', A.enemySkitter(0)],
  ['bulwark', A.enemyBulwark(0)], ['lancer0', A.enemyLancer(0, 0)],
  ['lancer1', A.enemyLancer(0, 1)], ['kegger0', A.enemyKegger(0, 0)],
  ['kegger1', A.enemyKegger(0, 1)], ['mender', A.enemyMender(0)],
];
const Z = 5, CELL = 32 * Z + 8, COLS = 6;
const rows = Math.ceil(items.length / COLS);
const sheetImg = new Pix(CELL * COLS, CELL * rows);
sheetImg.rect(0, 0, sheetImg.w, sheetImg.h, '#12182a');
items.forEach(([, p], i) => {
  sheetImg.blit(upscale(p, Z), (i % COLS) * CELL + 4, Math.floor(i / COLS) * CELL + 4);
});
fs.writeFileSync(process.argv[2] || '/tmp/preview.png', sheetImg.toPNG());

// bosses on their own sheet
const bosses = [A.bossPress(0, 0), A.bossPress(0, 1), A.bossArc(0, 0), A.bossArc(0, 1)];
const BC = 64 * 4 + 8;
const bs = new Pix(BC * 4, BC);
bs.rect(0, 0, bs.w, bs.h, '#12182a');
bosses.forEach((p, i) => bs.blit(upscale(p, 4), i * BC + 4, 4));
fs.writeFileSync(process.argv[3] || '/tmp/preview-boss.png', bs.toPNG());
console.log('ok');
