// actors.mjs — original character art for Sparkscrapper.
// Everything here is drawn from primitives; nothing is traced or imported.
import { Pix } from '../pixlib.mjs';

const S = 32; // standard actor frame
const B = 64; // boss frame

/* ---------------- helpers ---------------- */

// A plated panel with a lit top edge and a shadowed bottom edge — the single
// shading rule that ties every machine in the game together.
function plate(p, x, y, w, h, dark, mid, light) {
  p.rect(x, y, w, h, mid);
  p.rect(x, y, w, 1, light);
  p.rect(x, y + h - 1, w, 1, dark);
  p.rect(x, y, 1, h, light);
  p.rect(x + w - 1, y, 1, h, dark);
  return p;
}

function bolts(p, xs, y, col = 'a') {
  for (const x of xs) p.px(x, y, col);
  return p;
}

/* ---------------- heroes ---------------- */

// SCRAP-14 — the starting salvager. Tracked, boxy, amber running lights.
export function heroScrap(frame) {
  const p = new Pix(S, S);
  const bob = frame === 1 ? 1 : 0;
  const y0 = 2 + bob;

  // tracks (drawn full width, not mirrored, so the tread pattern can offset)
  const ty = 24;
  p.rect(6, ty, 20, 6, 'b');
  p.rect(6, ty, 20, 1, 'c');
  p.rect(6, ty + 5, 20, 1, 'a');
  for (let x = 7; x < 25; x += 3) p.rect(x + (frame ? 1 : 0), ty + 2, 2, 2, 'a');
  p.rect(5, ty + 1, 1, 4, 'b');
  p.rect(26, ty + 1, 1, 4, 'b');

  // lower chassis
  plate(p, 8, y0 + 16, 16, 7, 'a', 'c', 'd');
  bolts(p, [10, 21], y0 + 18);
  bolts(p, [10, 21], y0 + 21);
  // amber running light strip
  p.rect(12, y0 + 19, 8, 2, 'h');
  p.rect(12, y0 + 19, 8, 1, 'j');
  p.px(13, y0 + 19, 'k'); p.px(18, y0 + 19, 'k');

  // shoulders / weapon mounts
  plate(p, 4, y0 + 12, 6, 6, 'a', 'c', 'd');
  plate(p, 22, y0 + 12, 6, 6, 'a', 'c', 'd');
  p.rect(4, y0 + 14, 2, 2, 'i');
  p.rect(26, y0 + 14, 2, 2, 'i');

  // upper chassis
  plate(p, 9, y0 + 8, 14, 9, 'a', 'c', 'e');
  p.rect(11, y0 + 10, 10, 5, 'b');
  // chest core
  p.ellipse(16, y0 + 12, 3, 3, 'h');
  p.ellipse(16, y0 + 12, 2, 2, 'j');
  p.ellipse(16, y0 + 12, 1, 1, 'l');

  // head + visor
  plate(p, 11, y0 + 1, 10, 8, 'a', 'c', 'e');
  p.rect(12, y0 + 3, 8, 3, 'K');
  p.rect(12, y0 + 3, 8, 2, 'j');
  p.rect(12, y0 + 3, 8, 1, 'l');
  p.px(13, y0 + 4, 'l');
  // antenna nub
  p.rect(15, y0 - 1, 2, 2, 'd');
  p.px(16, y0 - 2, 'k');

  p.outline('K');
  return p;
}

// VOLT-9 — the unlockable frame. Legged, slimmer, arc-blue accents.
export function heroVolt(frame) {
  const p = new Pix(S, S);
  const bob = frame === 1 ? 1 : 0;
  const y0 = 2 + bob;

  // Legs stride out from under the hips so the walk cycle is visible.
  const l = frame ? 0 : 2, r = frame ? 2 : 0;
  const legTop = 20;
  p.rect(10, legTop, 4, 6 - l, 'b'); p.rect(10, legTop, 1, 6 - l, 'c');
  p.rect(18, legTop, 4, 6 - r, 'b'); p.rect(18, legTop, 1, 6 - r, 'c');
  // knee joints
  p.px(11, legTop + 3, 'd'); p.px(19, legTop + 3, 'd');
  // feet
  p.rect(8, legTop + 6 - l, 7, 3, 'a'); p.rect(17, legTop + 6 - r, 7, 3, 'a');
  p.rect(8, legTop + 6 - l, 7, 1, 'c'); p.rect(17, legTop + 6 - r, 7, 1, 'c');

  // hips
  plate(p, 11, y0 + 14, 10, 5, 'a', 'b', 'd');

  // torso — tapered
  plate(p, 10, y0 + 6, 12, 9, 'a', 'c', 'e');
  p.rect(12, y0 + 8, 8, 5, 'b');
  // arc core
  p.ellipse(16, y0 + 10, 3, 3, 'm');
  p.ellipse(16, y0 + 10, 2, 2, 'n');
  p.ellipse(16, y0 + 9, 1, 1, 'p');
  p.glow(16, y0 + 10, 5, 'o', 60);

  // shoulder pods
  plate(p, 5, y0 + 7, 5, 5, 'a', 'c', 'd');
  plate(p, 22, y0 + 7, 5, 5, 'a', 'c', 'd');
  p.rect(6, y0 + 9, 2, 1, 'o');
  p.rect(24, y0 + 9, 2, 1, 'o');

  // head — narrow visor
  plate(p, 12, y0 - 1, 8, 7, 'a', 'c', 'e');
  p.rect(13, y0 + 1, 6, 2, 'K');
  p.rect(13, y0 + 1, 6, 1, 'o');
  p.px(14, y0 + 1, 'p');
  // antenna
  p.rect(16, y0 - 5, 1, 4, 'd');
  p.px(16, y0 - 6, 'p');
  p.glow(16, y0 - 6, 3, 'o', 70);

  p.outline('K');
  return p;
}

/* ---------------- enemies ---------------- */

// CRUSHER — the baseline chaser. Heavy shoulders, two red eyes, plodding.
export function enemyCrusher(frame) {
  const p = new Pix(S, S);
  const bob = frame === 1 ? 1 : 0;
  const y = 3 + bob;

  // stubby legs
  const l = frame ? 1 : 0;
  p.rect(10, 25 - l, 4, 4, 'a'); p.rect(18, 25 - (1 - l), 4, 4, 'a');
  p.rect(10, 25 - l, 4, 1, 'b'); p.rect(18, 25 - (1 - l), 4, 1, 'b');

  // hunched body — wider at the top
  plate(p, 7, y + 10, 18, 11, 'a', 'b', 'c');
  p.rect(9, y + 13, 14, 5, 'a');
  // copper belly vents
  for (let i = 0; i < 3; i++) p.rect(11 + i * 4, y + 14, 3, 3, 'g');
  for (let i = 0; i < 3; i++) p.rect(11 + i * 4, y + 14, 3, 1, 'h');

  // shoulders
  plate(p, 4, y + 8, 7, 8, 'a', 'c', 'd');
  plate(p, 21, y + 8, 7, 8, 'a', 'c', 'd');
  // fists
  p.rect(3, y + 16, 6, 5, 'b'); p.rect(23, y + 16, 6, 5, 'b');
  p.rect(3, y + 16, 6, 1, 'c'); p.rect(23, y + 16, 6, 1, 'c');
  p.rect(4, y + 18, 4, 1, 'h'); p.rect(24, y + 18, 4, 1, 'h');

  // low sunken head
  plate(p, 11, y + 4, 10, 7, 'a', 'b', 'c');
  p.rect(12, y + 6, 3, 3, 'K'); p.rect(17, y + 6, 3, 3, 'K');
  p.rect(12, y + 6, 3, 2, 'r'); p.rect(17, y + 6, 3, 2, 'r');
  p.px(13, y + 6, 's'); p.px(18, y + 6, 's');
  p.glow(13, y + 7, 3, 's', 55); p.glow(18, y + 7, 3, 's', 55);

  p.outline('K');
  return p;
}

// SKITTER — fast and fragile. Small silhouette, spider legs, one hot eye.
export function enemySkitter(frame) {
  const p = new Pix(S, S);
  const y = 10 + (frame ? 1 : 0);

  // Four angular legs per side, drawn 2px thick so they survive at game scale.
  const step = frame ? 1 : -1;
  for (const dir of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const hipX = 16 + dir * 4;
      const kneeX = 16 + dir * (9 + i * 2);
      const kneeY = y + 1 + i * 2;
      const footX = 16 + dir * (12 + i * 2);
      const footY = y + 9 + i + (i === 0 ? step : -step);
      for (const o of [0, 1]) {
        p.line(hipX, y + 5 + o, kneeX, kneeY + o, 'c');
        p.line(kneeX, kneeY + o, footX, footY + o, 'b');
      }
      p.rect(footX - (dir > 0 ? 0 : 1), footY + 1, 2, 2, 'a');
      p.px(kneeX, kneeY, 'd');
    }
  }

  // Low, wide shell.
  p.ellipse(16, y + 5, 7, 4, 'b');
  p.ellipse(16, y + 4, 6, 3, 'c');
  p.rect(10, y + 5, 13, 1, 'a');
  p.rect(11, y + 2, 11, 1, 'd');
  // Single hot eye.
  p.ellipse(16, y + 4, 3, 2, 'q');
  p.ellipse(16, y + 4, 2, 1, 's');
  p.px(16, y + 3, 't');
  p.glow(16, y + 4, 6, 's', 80);
  // Danger flecks on the carapace.
  p.px(12, y + 3, 'r'); p.px(20, y + 3, 'r');

  p.outline('K');
  return p;
}

// BULWARK — armoured. Very wide front plate, small head, purple armour.
export function enemyBulwark(frame) {
  const p = new Pix(S, S);
  const y = 4 + (frame ? 1 : 0);

  // treads
  p.rect(4, 25, 24, 4, 'a');
  p.rect(4, 25, 24, 1, 'b');
  for (let x = 5; x < 27; x += 4) p.rect(x + (frame ? 2 : 0), 26, 2, 2, 'K');

  // body behind the plate
  plate(p, 8, y + 10, 16, 11, 'a', 'b', 'c');

  // the big front plate — the read at a glance
  plate(p, 3, y + 12, 26, 9, 'x', 'y', 'z');
  p.rect(5, y + 14, 22, 1, 'x');
  p.rect(5, y + 18, 22, 1, 'x');
  for (let x = 6; x < 27; x += 5) { p.px(x, y + 13, 'z'); p.px(x, y + 19, 'x'); }
  // rivet row
  for (let x = 5; x < 28; x += 4) p.px(x, y + 16, 'z');

  // shoulder guards
  plate(p, 2, y + 7, 7, 7, 'x', 'y', 'z');
  plate(p, 23, y + 7, 7, 7, 'x', 'y', 'z');

  // small head peeking over the plate
  plate(p, 12, y + 4, 8, 7, 'a', 'b', 'c');
  p.rect(13, y + 6, 6, 2, 'K');
  p.rect(13, y + 6, 6, 1, 'z');
  p.px(14, y + 6, 'f');

  p.outline('K');
  return p;
}

// LANCER — telegraphed shooter. Tall tripod, long barrel, glowing muzzle.
// `charge` 0..1 lights the barrel so the wind-up is readable from the sprite.
export function enemyLancer(frame, charge = 0) {
  const p = new Pix(S, S);
  const y = 1 + (frame ? 1 : 0);

  // tripod legs
  p.line(16, 22, 8, 30, 'b'); p.line(16, 22, 24, 30, 'b');
  p.line(16, 22, 16, 29, 'b');
  p.px(8, 30, 'a'); p.px(24, 30, 'a'); p.px(16, 29, 'a');
  p.line(15, 22, 8, 29, 'c'); p.line(17, 22, 24, 29, 'c');

  // slim column
  plate(p, 13, y + 11, 6, 11, 'a', 'c', 'd');
  p.rect(14, y + 13, 4, 2, 'b');
  p.rect(14, y + 17, 4, 2, 'b');

  // turret head
  plate(p, 10, y + 4, 12, 8, 'a', 'c', 'e');
  p.rect(12, y + 6, 8, 4, 'b');
  // sensor
  p.rect(12, y + 6, 8, 2, 'q');
  p.rect(12, y + 6, 8, 1, 's');

  // long barrel, drawn forward (down-screen)
  p.rect(14, y + 11, 4, 8, 'b');
  p.rect(14, y + 11, 1, 8, 'c');
  p.rect(13, y + 17, 6, 3, 'a');
  p.rect(13, y + 17, 6, 1, 'c');

  if (charge > 0) {
    const a = Math.round(90 + 140 * charge);
    p.rect(14, y + 18, 4, 2, charge > 0.6 ? 't' : 's');
    p.glow(16, y + 19, 2 + 4 * charge, 's', a);
    p.px(16, y + 19, 'l');
  }

  p.outline('K');
  return p;
}

// KEGGER — delayed exploder. Round barrel, hazard stripes, pulsing core.
// `arm` 0..1 drives the pre-detonation flash.
export function enemyKegger(frame, arm = 0) {
  const p = new Pix(S, S);
  const y = 4 + (frame ? 1 : 0);

  // little legs
  const l = frame ? 1 : 0;
  p.rect(11, 26 - l, 3, 3, 'a'); p.rect(18, 26 - (1 - l), 3, 3, 'a');

  // barrel body
  p.ellipse(16, y + 12, 9, 10, 'b');
  p.ellipse(16, y + 11, 8, 9, 'c');
  // barrel hoops
  p.rect(8, y + 6, 17, 1, 'a');
  p.rect(8, y + 17, 17, 1, 'a');
  // hazard stripes — the "this one detonates" signal
  for (let i = -8; i < 10; i += 4) {
    for (let k = 0; k < 2; k++) p.line(16 + i + k, y + 7, 16 + i + k - 4, y + 16, 'j');
  }

  // core window
  p.ellipse(16, y + 11, 4, 4, 'K');
  p.ellipse(16, y + 11, 3, 3, arm > 0.5 ? 't' : 'r');
  p.ellipse(16, y + 11, 2, 2, arm > 0.5 ? 'l' : 's');
  if (arm > 0) p.glow(16, y + 11, 6 + 5 * arm, 's', Math.round(60 + 150 * arm));

  // lid
  p.ellipse(16, y + 2, 7, 3, 'c');
  p.ellipse(16, y + 1, 6, 2, 'd');

  p.outline('K');
  return p;
}

// MENDER — support drone. Hovers, no legs, green repair ring.
export function enemyMender(frame) {
  const p = new Pix(S, S);
  const y = 9 + (frame ? 1 : 0);

  // repair ring (the tell that it is buffing something)
  p.ring(16, y + 6, 11, 6, 'u', 150);
  p.ring(16, y + 6, 10, 5, 'v', 110);

  // hull
  p.ellipse(16, y + 5, 7, 5, 'b');
  p.ellipse(16, y + 4, 6, 4, 'c');
  p.rect(10, y + 5, 13, 1, 'a');
  // emitter
  p.ellipse(16, y + 4, 3, 3, 'u');
  p.ellipse(16, y + 4, 2, 2, 'v');
  p.px(16, y + 3, 'w');
  p.glow(16, y + 4, 6, 'w', 80);
  // side fins
  p.rect(6, y + 3, 4, 3, 'c'); p.rect(22, y + 3, 4, 3, 'c');
  p.rect(6, y + 3, 4, 1, 'd'); p.rect(22, y + 3, 4, 1, 'd');
  // thruster glow underneath
  p.glow(16, y + 10, 4, 'w', 50);

  p.outline('K');
  return p;
}

/* ---------------- bosses ---------------- */

// PRESS MOTHER — phase 1 boss. An industrial stamping press given legs.
// `slam` 0..1 drops the hammer block so the wind-up and the strike read.
export function bossPress(frame, slam = 0) {
  const p = new Pix(B, B);
  const y = 2;
  const drop = Math.round(slam * 10);

  // base treads
  p.rect(6, 52, 52, 8, 'a');
  p.rect(6, 52, 52, 1, 'b');
  for (let x = 8; x < 56; x += 6) p.rect(x + (frame ? 3 : 0), 54, 3, 4, 'K');

  // frame pillars
  plate(p, 8, y + 12, 8, 40, 'a', 'b', 'c');
  plate(p, 48, y + 12, 8, 40, 'a', 'b', 'c');
  for (let j = y + 16; j < 50; j += 6) { p.rect(9, j, 6, 1, 'a'); p.rect(49, j, 6, 1, 'a'); }

  // crossbeam
  plate(p, 6, y + 6, 52, 8, 'a', 'c', 'e');
  p.rect(10, y + 8, 44, 3, 'b');
  for (let x = 12; x < 54; x += 6) p.px(x, y + 9, 'i');

  // hammer block on rails
  plate(p, 18, y + 16 + drop, 28, 14, 'g', 'h', 'i');
  p.rect(21, y + 19 + drop, 22, 3, 'g');
  p.rect(21, y + 25 + drop, 22, 2, 'g');
  for (let x = 22; x < 44; x += 5) p.px(x, y + 20 + drop, 'k');
  // hammer teeth
  for (let x = 19; x < 46; x += 4) p.rect(x, y + 30 + drop, 3, 2, 'h');

  // piston rods
  p.rect(24, y + 14, 3, 2 + drop, 'e');
  p.rect(38, y + 14, 3, 2 + drop, 'e');

  // eye array on the crossbeam
  for (let i = 0; i < 5; i++) {
    const ex = 18 + i * 7;
    p.rect(ex, y + 2, 4, 3, 'K');
    p.rect(ex, y + 2, 4, 2, slam > 0.4 ? 't' : 'r');
    p.px(ex + 1, y + 2, 's');
  }
  if (slam > 0.4) p.glow(32, y + 3, 18, 's', 40);

  // anvil floor plate
  plate(p, 14, 46, 36, 6, 'a', 'b', 'c');
  p.rect(17, 48, 30, 2, 'g');

  p.outline('K');
  return p;
}

// ARC SOVEREIGN — phase 2 boss. Tesla tower, floating coil rings, arc core.
// `charge` 0..1 spins the rings up before a discharge.
export function bossArc(frame, charge = 0) {
  const p = new Pix(B, B);

  // hovering base — no legs, it floats
  p.ellipse(32, 54, 18, 6, 'a');
  p.ellipse(32, 52, 16, 5, 'b');
  p.ellipse(32, 51, 13, 4, 'c');
  p.glow(32, 58, 12, 'o', Math.round(40 + 50 * charge));

  // spine
  plate(p, 27, 18, 10, 32, 'a', 'b', 'c');
  for (let j = 22; j < 48; j += 5) p.rect(28, j, 8, 1, 'a');

  // three coil rings, each rotating with the frame
  const phase = frame ? 1 : 0;
  const rings = [
    [32, 42, 20, 6],
    [32, 32, 16, 5],
    [32, 24, 12, 4],
  ];
  rings.forEach(([cx, cy, rx, ry], i) => {
    const lit = charge > i / 3;
    p.ring(cx, cy + (i % 2 === phase ? 0 : 1), rx, ry, lit ? 'n' : 'b', 220);
    p.ring(cx, cy + (i % 2 === phase ? 0 : 1), rx - 1, ry - 1, lit ? 'o' : 'c', 160);
    if (lit) p.glow(cx, cy, rx, 'o', 45);
  });

  // arc core
  p.ellipse(32, 32, 6, 6, 'm');
  p.ellipse(32, 32, 4, 4, 'n');
  p.ellipse(32, 32, 2, 2, 'p');
  p.px(32, 31, 'W');
  p.glow(32, 32, 12 + 8 * charge, 'o', Math.round(70 + 90 * charge));

  // crown emitters
  plate(p, 24, 10, 16, 8, 'a', 'c', 'e');
  for (let i = 0; i < 3; i++) {
    const ex = 26 + i * 6;
    p.rect(ex, 6, 3, 5, 'c');
    p.rect(ex, 5, 3, 1, charge > 0.5 ? 'p' : 'n');
    if (charge > 0.5) p.glow(ex + 1, 5, 4, 'o', 90);
  }
  // eye slit
  p.rect(26, 13, 12, 3, 'K');
  p.rect(26, 13, 12, 2, charge > 0.6 ? 'p' : 'o');

  // arc filaments between rings when charging
  if (charge > 0.35) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + (frame ? 0.6 : 0);
      p.line(32 + Math.cos(a) * 8, 32 + Math.sin(a) * 6,
             32 + Math.cos(a) * 17, 32 + Math.sin(a) * 11, 'p', 190);
    }
  }

  p.outline('K');
  return p;
}
