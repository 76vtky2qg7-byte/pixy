// icons.mjs — 20x20 gear icons. Weapons use warm metal, support modules use the
// colour of the stat they touch, so the panel reads at a glance.
import { Pix } from '../pixlib.mjs';

const I = 20;

function base(tint) {
  const p = new Pix(I, I);
  p.rect(1, 1, I - 2, I - 2, 'a');
  p.rect(1, 1, I - 2, 1, tint);
  p.rect(1, I - 2, I - 2, 1, 'K');
  return p;
}

/* ---------------- weapons (6) ---------------- */

// RIVETER — rapid single-target bolts.
export function icoRiveter() {
  const p = base('c');
  p.rect(3, 8, 11, 5, 'c');
  p.rect(3, 8, 11, 1, 'e');
  p.rect(3, 12, 11, 1, 'b');
  p.rect(6, 13, 4, 4, 'b');       // grip
  p.rect(14, 9, 4, 3, 'i');       // muzzle
  p.rect(14, 9, 4, 1, 'k');
  p.rect(5, 5, 3, 3, 'b');        // hopper
  for (const x of [15, 17]) p.px(x, 4, 'k');
  p.px(18, 10, 'l');
  p.glow(18, 10, 4, 'j', 90);
  return p;
}

// BUZZSAW — orbiting blade.
export function icoBuzzsaw() {
  const p = base('e');
  p.ellipse(10, 10, 8, 8, 'c');
  p.ellipse(10, 10, 6, 6, 'e');
  p.ellipse(10, 10, 3, 3, 'b');
  p.ellipse(10, 10, 1, 1, 'f');
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    p.px(10 + Math.cos(a) * 8.6, 10 + Math.sin(a) * 8.6, 'f');
    p.px(10 + Math.cos(a + 0.35) * 8.2, 10 + Math.sin(a + 0.35) * 8.2, 'd');
  }
  p.rect(9, 3, 2, 3, 'a');
  return p;
}

// ARC EMITTER — chains between targets.
export function icoArc() {
  const p = base('n');
  p.rect(6, 13, 8, 5, 'c');        // emitter base
  p.rect(6, 13, 8, 1, 'e');
  p.rect(8, 10, 4, 3, 'b');
  p.line(10, 10, 7, 6, 'o'); p.line(7, 6, 12, 6, 'o');
  p.line(12, 6, 8, 2, 'p'); p.line(8, 2, 11, 3, 'p');
  p.px(10, 10, 'W');
  p.glow(10, 6, 7, 'o', 100);
  return p;
}

// SHRAPNEL MORTAR — lobbed area burst.
export function icoMortar() {
  const p = base('i');
  p.rect(4, 12, 12, 5, 'b');       // baseplate
  p.rect(4, 12, 12, 1, 'd');
  p.line(6, 15, 10, 5, 'c'); p.line(7, 15, 11, 5, 'c');
  p.line(8, 15, 12, 5, 'd');       // tube
  p.rect(9, 3, 4, 3, 'a');
  p.ellipse(13, 4, 3, 3, 'j', 200); // burst
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    p.px(13 + Math.cos(a) * 4.5, 4 + Math.sin(a) * 4.5, 'k');
  }
  p.px(13, 4, 'l');
  return p;
}

// CUTTER BEAM — sustained sweeping beam.
export function icoBeam() {
  const p = base('t');
  p.rect(2, 7, 6, 6, 'c');         // housing
  p.rect(2, 7, 6, 1, 'e');
  p.rect(2, 12, 6, 1, 'b');
  p.ellipse(8, 10, 2, 3, 'b');     // lens
  p.ellipse(8, 10, 1, 2, 's');
  for (let x = 9; x < 19; x++) {   // beam widening out
    const h = 1 + Math.floor((x - 9) / 4);
    p.rect(x, 10 - h, 1, h * 2 + 1, 's', 230 - (x - 9) * 8);
    p.px(x, 10, 't');
  }
  p.glow(15, 10, 6, 's', 70);
  return p;
}

// MAG HAMMER — melee shockwave around the robot.
export function icoHammer() {
  const p = base('z');
  // Two shock arcs centred on the head, drawn first and kept faint.
  for (let i = 0; i < 2; i++) p.ring(10, 8, 6 + i * 2.5, 6 + i * 2.5, 'z', 110 - i * 45);
  // haft, 2px thick, running to the lower-left corner
  for (const o of [0, 1]) p.line(4 + o, 17, 9 + o, 11, 'h');
  p.line(5, 16, 9, 12, 'i');
  p.rect(3, 15, 3, 3, 'g');
  // head — fits inside the frame with a pixel to spare
  p.rect(5, 4, 11, 7, 'c');
  p.rect(5, 4, 11, 1, 'e');
  p.rect(5, 10, 11, 1, 'a');
  p.rect(5, 4, 1, 7, 'e');
  p.rect(15, 4, 1, 7, 'a');
  p.rect(8, 6, 5, 3, 'y');        // magnet face
  p.rect(8, 6, 5, 1, 'z');
  p.px(9, 7, 'f');
  return p;
}

/* ---------------- support modules (8) ---------------- */

// BATTERY — fire rate.
export function icoBattery() {
  const p = base('k');
  p.rect(6, 3, 8, 15, 'b');
  p.rect(6, 3, 8, 1, 'd');
  p.rect(6, 17, 8, 1, 'K');
  p.rect(8, 1, 4, 2, 'd');
  p.rect(7, 5, 6, 11, 'g');
  for (let i = 0; i < 3; i++) p.rect(7, 6 + i * 4, 6, 2, 'j');
  p.line(11, 6, 8, 11, 'l'); p.line(8, 11, 12, 10, 'l'); p.line(12, 10, 9, 15, 'l');
  p.glow(10, 10, 7, 'k', 60);
  return p;
}

// HEATSINK — removes heat.
export function icoHeatsink() {
  const p = base('p');
  p.rect(3, 6, 14, 9, 'c');
  p.rect(3, 6, 14, 1, 'e');
  for (let x = 4; x < 17; x += 3) { p.rect(x, 4, 2, 12, 'd'); p.rect(x, 4, 2, 1, 'f'); }
  p.rect(3, 14, 14, 1, 'a');
  for (const [x, y] of [[6, 2], [10, 1], [14, 2]]) { // rising heat wisps
    p.px(x, y, 'o'); p.px(x + 1, y + 1, 'p');
  }
  p.glow(10, 12, 7, 'o', 50);
  return p;
}

// COIL — adds a chain arc to hits.
export function icoCoil() {
  const p = base('o');
  p.rect(8, 4, 4, 12, 'b');
  for (let y = 4; y < 16; y += 2) { p.rect(6, y, 8, 1, 'i'); p.px(6, y, 'k'); }
  p.rect(7, 2, 6, 2, 'c');
  p.rect(7, 16, 6, 2, 'c');
  p.px(10, 1, 'p');
  p.line(10, 1, 15, 5, 'o'); p.line(10, 1, 5, 5, 'o');
  p.glow(10, 2, 6, 'o', 90);
  return p;
}

// TARGETER — damage and range.
export function icoTargeter() {
  const p = base('s');
  p.ring(10, 10, 8, 8, 'e', 230);
  p.ring(10, 10, 4, 4, 'd', 200);
  p.line(10, 1, 10, 6, 'f'); p.line(10, 14, 10, 19, 'f');
  p.line(1, 10, 6, 10, 'f'); p.line(14, 10, 19, 10, 'f');
  p.ellipse(10, 10, 1, 1, 's');
  p.glow(10, 10, 5, 's', 80);
  return p;
}

// FEEDER — extra projectiles.
export function icoFeeder() {
  const p = base('j');
  p.rect(3, 5, 14, 10, 'b');
  p.rect(3, 5, 14, 1, 'd');
  p.rect(3, 14, 14, 1, 'a');
  for (let i = 0; i < 3; i++) {   // stacked rounds
    const y = 6 + i * 3;
    p.rect(5, y, 10, 2, 'h');
    p.rect(5, y, 10, 1, 'j');
    p.px(14, y, 'k');
  }
  p.rect(16, 8, 3, 4, 'c');
  p.px(18, 10, 'l');
  return p;
}

// IMPACT PISTON — knockback and armour break.
export function icoPiston() {
  const p = base('z');
  // motion streaks trailing the stroke
  for (let i = 0; i < 3; i++) p.rect(1, 8 + i * 2, 3 - i, 1, 'z', 170 - i * 40);
  p.rect(2, 6, 5, 9, 'c');        // cylinder
  p.rect(2, 6, 5, 1, 'e');
  p.rect(2, 14, 5, 1, 'a');
  p.rect(7, 9, 6, 3, 'e');        // rod
  p.rect(7, 9, 6, 1, 'f');
  p.rect(13, 4, 5, 13, 'y');      // impact head
  p.rect(13, 4, 5, 1, 'z');
  p.rect(13, 16, 5, 1, 'x');
  p.rect(14, 8, 3, 5, 'z');
  // impact sparks off the head
  for (const [x, y] of [[18, 3], [19, 6], [18, 14], [19, 11]]) p.px(x, y, 'l');
  return p;
}

// REPAIR LOOP — regeneration.
export function icoRepair() {
  const p = base('w');
  // Broken ring reads as a loop with flow, and leaves the cross legible.
  for (let i = 0; i < 24; i++) {
    if (i % 8 === 7) continue; // gap
    const a = (i / 24) * Math.PI * 2;
    p.px(10 + Math.cos(a) * 8, 10 + Math.sin(a) * 8, 'v');
    p.px(10 + Math.cos(a) * 7, 10 + Math.sin(a) * 7, 'u');
  }
  p.rect(8, 5, 4, 10, 'u');
  p.rect(5, 8, 10, 4, 'u');
  p.rect(9, 6, 2, 8, 'w');
  p.rect(6, 9, 8, 2, 'w');
  p.px(9, 6, 'f'); p.px(6, 9, 'f');
  // flow arrow on the loop
  p.px(17, 8, 'w'); p.px(16, 7, 'w'); p.px(16, 9, 'w');
  return p;
}

// MAGNET — pickup radius and scrap yield.
export function icoMagnet() {
  const p = base('f');
  // horseshoe
  for (let i = 0; i < 2; i++) {
    p.ring(10, 11 + i, 7 - i, 7 - i, i ? 'r' : 's', 240);
  }
  p.rect(2, 12, 16, 6, null);
  p.rect(1, 12, 18, 7, '#00000000', 0);
  // clear the bottom of the ring to make a horseshoe, then cap the poles
  for (let y = 12; y < 20; y++) for (let x = 0; x < I; x++) {
    const i4 = (y * I + x) * 4;
    if (x > 4 && x < 16) { p.data[i4 + 3] = 0; }
  }
  p.rect(2, 11, 4, 6, 'e');
  p.rect(14, 11, 4, 6, 'e');
  p.rect(2, 11, 4, 1, 'f');
  p.rect(14, 11, 4, 1, 'f');
  p.rect(2, 16, 4, 1, 'c');
  p.rect(14, 16, 4, 1, 'c');
  p.rect(1, 1, I - 2, 1, 'f');
  p.rect(1, I - 2, I - 2, 1, 'K');
  return p;
}

/* ---------------- ui glyphs ---------------- */
// Small currency marks reused by the HUD, shop and results screen.
export function glyphScrap() {
  const p = new Pix(14, 14);
  p.art(2, 3, [
    ' hhh  ',
    'hiiih ',
    'hijjih',
    'hiijih',
    ' hiih ',
    '  hh  ',
  ]);
  p.outline('K');
  return p;
}

export function glyphCredit() {
  const p = new Pix(14, 14);
  p.ring(7, 7, 5, 5, 'n', 255);
  p.ellipse(7, 7, 3, 3, 'm');
  p.rect(6, 4, 2, 6, 'p');
  p.rect(4, 6, 6, 2, 'p');
  p.px(7, 7, 'W');
  p.outline('K');
  return p;
}

export function glyphHeart() {
  const p = new Pix(14, 14);
  p.art(2, 3, [
    ' vv vv',
    'vwwvww',
    'vwwwww',
    ' vwwww',
    '  vww ',
    '   v  ',
  ]);
  p.outline('K');
  return p;
}

/* ---------------- in-world number font ---------------- */
// A 7x9 digit set for damage numbers and pickup counters. Rendering these as
// sprites keeps them pixel-crisp at any zoom, unlike scaled webfont text.
const DIGIT_ART = {
  '0': [' www ', 'w   w', 'w   w', 'w   w', 'w   w', 'w   w', ' www '],
  '1': ['  w  ', ' ww  ', '  w  ', '  w  ', '  w  ', '  w  ', ' www '],
  '2': [' www ', 'w   w', '    w', '   w ', '  w  ', ' w   ', 'wwwww'],
  '3': ['wwww ', '    w', '    w', ' www ', '    w', '    w', 'wwww '],
  '4': ['   w ', '  ww ', ' w w ', 'w  w ', 'wwwww', '   w ', '   w '],
  '5': ['wwwww', 'w    ', 'wwww ', '    w', '    w', 'w   w', ' www '],
  '6': ['  ww ', ' w   ', 'w    ', 'wwww ', 'w   w', 'w   w', ' www '],
  '7': ['wwwww', '    w', '   w ', '  w  ', ' w   ', ' w   ', ' w   '],
  '8': [' www ', 'w   w', 'w   w', ' www ', 'w   w', 'w   w', ' www '],
  '9': [' www ', 'w   w', 'w   w', ' wwww', '    w', '   w ', ' ww  '],
  '+': ['     ', '  w  ', '  w  ', 'wwwww', '  w  ', '  w  ', '     '],
  '-': ['     ', '     ', '     ', 'wwwww', '     ', '     ', '     '],
  '!': ['  w  ', '  w  ', '  w  ', '  w  ', '  w  ', '     ', '  w  '],
  'x': ['     ', '     ', 'w   w', ' w w ', '  w  ', ' w w ', 'w   w'],
};

export const DIGIT_CHARS = Object.keys(DIGIT_ART);

export function digitGlyph(ch) {
  const p = new Pix(7, 9);
  const rows = DIGIT_ART[ch];
  rows.forEach((row, j) => {
    for (let k = 0; k < row.length; k++) {
      if (row[k] === 'w') p.px(k + 1, j + 1, 'f');
    }
  });
  p.outline('K');
  return p;
}
