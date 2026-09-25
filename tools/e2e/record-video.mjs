/**
 * Record a real gameplay video of the production build.
 *
 *   npm run build && npx vite preview --port 4173 --strictPort &
 *   node tools/e2e/record-video.mjs
 *
 * Every frame is the actual game running in Chromium. Input goes through the
 * real touch path — synthesised pointer events driving the on-screen stick —
 * so the stick is visible and the movement is genuine, not a camera fly-through.
 *
 * The run is STAGED, the way any trailer is: it starts at a dense mid-contract
 * wave, the shop is seeded so the Battery is on offer, and waves are ended on
 * cue instead of played to their full length. Nothing about the mechanics is
 * faked — the adjacency link, the stat change and the faster firing afterwards
 * are the game doing its normal job.
 *
 * Follows store/VIDEO_SCRIPT.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'store', 'video');
const BASE = process.env.E2E_BASE || 'http://127.0.0.1:4173';
const CHROME = process.env.E2E_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const RAW = '/tmp/video-raw';

fs.rmSync(RAW, { recursive: true, force: true });
fs.mkdirSync(RAW, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

/**
 * Which layouts to record, and in which language.
 *
 * Portrait is the primary one the game is built for; the landscape pair is
 * what a store card asks for. The language comes from the SDK, the same way
 * the game gets it on the platform.
 */
const LAYOUTS = [
  { name: 'portrait-390x844-ru', lang: 'ru', viewport: { width: 390, height: 844 }, touch: true, stick: { x: 95, y: 640 } },
  { name: 'portrait-390x844-en', lang: 'en', viewport: { width: 390, height: 844 }, touch: true, stick: { x: 95, y: 640 } },
  { name: 'landscape-1366x768-ru', lang: 'ru', viewport: { width: 1366, height: 768 }, touch: false, stick: { x: 250, y: 560 } },
  { name: 'landscape-1366x768-en', lang: 'en', viewport: { width: 1366, height: 768 }, touch: false, stick: { x: 250, y: 560 } },
];

/** Captions the script clicks, per language. */
const CAPTION = {
  ru: { play: 'Играть', contract: 'Литейный аврал', accept: 'Принять контракт',
        startWave: 'Начать волну', buy: /^Купить$/ },
  en: { play: 'Play', contract: 'Foundry Rush', accept: 'Accept contract',
        startWave: 'Start wave', buy: /^Buy$/ },
};

/**
 * Page-side autopilot.
 *
 * Picks a direction the way a competent player would — keep away from bodies,
 * step out of telegraphed rings, drift toward loot — then expresses it as a
 * thumb position and dispatches a real pointermove. The game sees ordinary
 * touch input and draws its stick, so the recording shows how it is actually
 * played.
 */
const autopilot = (ox, oy) => `
window.__auto = (() => {
  const surface = document.getElementById('game-surface');
  const origin = { x: ${ox}, y: ${oy} };
  let cur = { x: origin.x, y: origin.y };
  let down = false;
  let raf = 0;

  const ev = (type, x, y) => surface.dispatchEvent(new PointerEvent(type, {
    pointerId: 11, pointerType: 'touch', isPrimary: true,
    clientX: x, clientY: y, bubbles: true, cancelable: true,
  }));

  function desired() {
    const w = window.__app && window.__app.world;
    if (!w) return { x: 0, y: 0 };
    let ax = 0, ay = 0;
    for (const e of w.enemies.items) {
      if (!e.active) continue;
      const dx = w.px - e.x, dy = w.py - e.y;
      const d = Math.hypot(dx, dy);
      const danger = e.boss ? 230 : 140;
      if (d < danger && d > 0.1) {
        const push = (1 - d / danger) * (e.boss ? 3 : 1.5);
        ax += (dx / d) * push; ay += (dy / d) * push;
      }
    }
    for (const h of w.hazards.items) {
      if (!h.active || h.fired) continue;
      const dx = w.px - h.x, dy = w.py - h.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < h.radius + 46) { const p = (1 - d / (h.radius + 46)) * 6; ax += (dx/d)*p; ay += (dy/d)*p; }
    }
    let bx = 0, by = 0, best = 1e9;
    for (const p of w.pickups.items) {
      if (!p.active) continue;
      const d = Math.hypot(p.x - w.px, p.y - w.py);
      if (d < best) { best = d; bx = p.x - w.px; by = p.y - w.py; }
    }
    if (best < 1e9) { const d = Math.hypot(bx, by) || 1; ax += (bx/d) * 1.1; ay += (by/d) * 1.1; }
    const inset = 220;
    if (w.px < inset) ax += 2.5;
    if (w.px > 1800 - inset) ax -= 2.5;
    if (w.py < inset) ay += 2.5;
    if (w.py > 1800 - inset) ay -= 2.5;
    const m = Math.hypot(ax, ay);
    return m > 0.01 ? { x: ax/m, y: ay/m } : { x: 0, y: 0 };
  }

  function tick() {
    const d = desired();
    // Target thumb offset, then ease toward it so the stick never snaps.
    const R = 46;
    const tx = origin.x + d.x * R, ty = origin.y + d.y * R;
    cur.x += (tx - cur.x) * 0.22;
    cur.y += (ty - cur.y) * 0.22;
    ev('pointermove', cur.x, cur.y);
    raf = requestAnimationFrame(tick);
  }

  return {
    start() {
      if (down) return;
      down = true;
      cur = { x: origin.x, y: origin.y };
      ev('pointerdown', origin.x, origin.y);
      raf = requestAnimationFrame(tick);
    },
    stop() {
      if (!down) return;
      down = false;
      cancelAnimationFrame(raf);
      ev('pointerup', cur.x, cur.y);
    },
  };
})();
`;

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--mute-audio'] });

for (const layout of LAYOUTS) {
  const ctx = await browser.newContext({
    viewport: layout.viewport,
    deviceScaleFactor: layout.touch ? 2 : 1,
    hasTouch: layout.touch,
    isMobile: layout.touch,
    locale: layout.lang === 'en' ? 'en-US' : 'ru-RU',
    recordVideo: { dir: RAW, size: layout.viewport },
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const tap = async (label, ms = 240) => {
    await page.locator('#ui-root button', { hasText: label }).first().click({ timeout: 10000 });
    await page.waitForTimeout(ms);
  };
  const wait = (ms) => page.waitForTimeout(ms);

  const T = CAPTION[layout.lang];
  // The context locale is set above, and with no SDK the platform follows
  // it, so the interface is already in the right language before the first
  // frame is recorded.
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForSelector('#ui-root .screen', { timeout: 20000 });

  // A player who has been here before: tutorial done, contract 2 open.
  await page.evaluate(() => {
    window.__app.save.update((d) => {
      d.progress.tutorialDone = true;
      d.progress.credits = 340;
      d.progress.wonContracts = ['night_shift'];
      d.progress.upgrades = { hull: 2, servos: 1, fence: 2, calibration: 2 };
      d.progress.totalRuns = 9;
      d.progress.totalKills = 1147;
    });
    window.__app.show('menu');
  });
  await wait(1300);

  /* ---- 0:00 menu -> contract ---- */
  await tap(T.play, 650);
  await page.locator('#ui-root .card', { hasText: T.contract }).first().click();
  await wait(850);
  await tap(T.accept, 600);

  /* ---- stage a dense mid-contract wave with a single weapon ---- */
  await page.evaluate(() => {
    const r = window.__app.run;
    r.waveIndex = 3;
    r.wavesCleared = 3;
    r.rewardedWaves = [0, 1, 2];
    r.scrap = 96;
    r.slots = ['riveter', null, 'buzzsaw', null, null, null];
    window.__app.show('prep');
  });
  await wait(800);
  await tap(T.startWave, 350);

  /* ---- 0:04 combat ---- */
  await page.evaluate(autopilot(layout.stick.x, layout.stick.y));
  await page.evaluate(() => window.__auto.start());
  await wait(6500);

  /* ---- 0:11 end the wave on cue ---- */
  await page.evaluate(() => window.__auto.stop());
  await page.evaluate(() => {
    const w = window.__app.world;
    w.timeLeft = 0.01;
    for (const e of w.enemies.items) if (e.active) w.enemies.release(e);
  });
  await page.waitForFunction(() => window.__app.screen === 'prep', null, { timeout: 15000 });
  await wait(900);

  /* ---- 0:12 the shop: put a Battery beside the Riveter ---- */
  await page.evaluate(() => {
    const r = window.__app.run;
    // Seed the offer, the way a trailer stages a shot. The purchase, the
    // placement and the effect it produces are all the game's own doing.
    r.offers = [
      { gear: 'battery', price: 28, sold: false },
      ...r.offers.filter((o) => o.gear !== 'battery').slice(0, 3),
    ];
    r.scrap = 96;
    window.__app.show('prep');
  });
  await wait(1000);
  await page.locator('#ui-root button', { hasText: T.buy }).first().click();
  await wait(1500);

  /* ---- 0:15 the whole point: tap the Battery and read what it is doing.
         The explanation renders directly under the panel, so the link and the
         numbers are on screen together and nothing has to scroll. ---- */
  await page.locator('#ui-root .cell').nth(1).click();
  await wait(3000);
  await page.locator('#ui-root .cell').nth(1).click();
  await wait(500);

  /* ---- 0:19 next wave, visibly faster ---- */
  await tap(T.startWave, 350);
  await page.evaluate(() => window.__auto.start());
  await wait(5800);

  /* ---- 0:25 boss ---- */
  await page.evaluate(() => window.__auto.stop());
  await page.evaluate(() => {
    const a = window.__app;
    a.run.waveIndex = 6;
    a.run.slots = ['riveter', 'battery', 'buzzsaw', 'coil', 'mortar', 'targeter'];
    a.startWave();
    // Put the boss on screen straight away rather than walking to it.
    const b = a.world.boss;
    if (b) { b.x = a.world.px + 40; b.y = a.world.py - 150; }
  });
  await wait(800);
  await page.evaluate(() => window.__auto.start());
  await wait(5600);
  await page.evaluate(() => window.__auto.stop());
  await wait(500);

  const video = page.video();
  await ctx.close();

  const raw = await video.path();
  const dest = path.join(OUT, `gameplay-${layout.name}.webm`);
  fs.copyFileSync(raw, dest);
  const kb = (fs.statSync(dest).size / 1024).toFixed(0);
  console.log(`store/video/gameplay-${layout.name}.webm  ${kb} KB  ${layout.viewport.width}x${layout.viewport.height}  ${layout.lang}`);
  if (errors.length) console.log('  page errors:', errors);
  else console.log('  no page errors during recording');
}

await browser.close();
