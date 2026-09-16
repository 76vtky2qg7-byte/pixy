#!/usr/bin/env node
/**
 * Iframe audit.
 *
 * Yandex Games serves a game inside a cross-origin iframe on its own page, and
 * several things behave differently there: storage can be partitioned or
 * blocked outright, keyboard events only arrive once the frame has focus, and
 * fullscreen and pointer capture need permission. A game that works standalone
 * can still be unplayable embedded, and that is not something the other checks
 * would ever catch.
 *
 *   npm run build && npx vite preview --port 4173 --strictPort &
 *   node tools/audit-iframe.mjs
 */
import fs from 'node:fs';
import http from 'node:http';
import { chromium } from 'playwright';

const GAME = process.env.E2E_BASE || 'http://127.0.0.1:4173';
const CHROME = process.env.E2E_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const HOST_PORT = 4190;
const SHOTS = process.env.AUDIT_SHOTS || '/tmp/audit';
fs.mkdirSync(SHOTS, { recursive: true });

const findings = [];
const notes = [];
const fail = (a, m) => findings.push(`${a}: ${m}`);
const note = (a, m) => notes.push(`${a}: ${m}`);

/**
 * A stand-in for the portal page: a different origin (localhost vs 127.0.0.1)
 * embedding the game in an iframe, the way the platform does.
 */
const host = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><meta charset="utf-8">
<title>portal</title>
<style>html,body{margin:0;height:100%;background:#222}
iframe{display:block;border:0;width:420px;height:760px;margin:0 auto}</style>
<iframe id="game" src="${GAME}/" allow="autoplay; fullscreen"></iframe>`);
});
await new Promise((r) => host.listen(HOST_PORT, '127.0.0.1', r));

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--mute-audio'] });
const ctx = await browser.newContext({
  viewport: { width: 500, height: 820 },
  hasTouch: true,
});
const errors = [];
const failedUrls = [];
const page = await ctx.newPage();
page.on('response', (r) => { if (r.status() >= 400) failedUrls.push(r.url()); });
page.on('requestfailed', (r) => failedUrls.push(r.url()));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

// 'localhost' and '127.0.0.1' are different origins to the browser, so this is
// a genuinely cross-origin embed rather than a same-origin one.
await page.goto(`http://localhost:${HOST_PORT}/`, { waitUntil: 'load' });

const frame = page.frameLocator('#game');
await frame.locator('#ui-root .screen').waitFor({ timeout: 25000 }).catch(() => {
  fail('boot', 'the game did not reach a screen inside a cross-origin iframe');
});

const f = page.frames().find((fr) => fr.url().startsWith(GAME));
if (!f) {
  fail('boot', 'the game frame never loaded');
} else {
  await f.waitForFunction(() => !!window.__app, null, { timeout: 20000 }).catch(() => {});

  /* ---- 1. It actually booted ---- */
  const booted = await f.evaluate(() => !!window.__app && !!document.querySelector('#ui-root .screen'));
  if (!booted) fail('boot', 'the app did not initialise inside the iframe');
  else note('boot', 'the game boots inside a cross-origin iframe');

  /* ---- 2. Storage. Partitioned storage is fine; a throw is not. ---- */
  const storage = await f.evaluate(() => {
    try {
      localStorage.setItem('__probe', '1');
      const ok = localStorage.getItem('__probe') === '1';
      localStorage.removeItem('__probe');
      return { works: ok, threw: false };
    } catch (e) {
      return { works: false, threw: true, msg: String(e) };
    }
  });
  if (storage.threw) {
    note('storage', 'localStorage throws inside the iframe — the save layer must survive this');
  }
  const savedOk = await f.evaluate(() => {
    window.__app.save.update((d) => { d.progress.credits = 4242; });
    return window.__app.save.get().progress.credits === 4242;
  });
  if (!savedOk) fail('storage', 'progress could not be recorded inside the iframe');
  else note('storage', `progress works embedded (localStorage available: ${storage.works})`);

  /* ---- 3. Keyboard, which only arrives once the frame has focus ---- */
  await f.evaluate(() => {
    window.__app.save.update((d) => { d.progress.tutorialDone = true; });
    window.__app.startRun('night_shift', 'scrap14');
  });
  await page.waitForTimeout(400);
  // Called directly rather than by matching a button caption, so the check
  // does not depend on the interface language.
  await f.evaluate(() => window.__app.startWave());
  await page.waitForTimeout(900);

  // Click into the frame first, the way a player does, then press a key.
  await frame.locator('#game-surface').click({ position: { x: 210, y: 400 } }).catch(() => {});
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(700);
  const moved = await f.evaluate(() => Math.abs(window.__app.input.x) > 0.5);
  await page.keyboard.up('KeyD');
  if (!moved) fail('input', 'keyboard input does not reach the game inside an iframe after a click');
  else note('input', 'keyboard reaches the game once the frame has focus');

  /* ---- 4. Touch, which is how it is actually played on the portal ---- */
  const touched = await f.evaluate(async () => {
    const s = document.getElementById('game-surface');
    const o = { pointerId: 21, pointerType: 'touch', isPrimary: true, bubbles: true };
    s.dispatchEvent(new PointerEvent('pointerdown', { ...o, clientX: 70, clientY: 560 }));
    s.dispatchEvent(new PointerEvent('pointermove', { ...o, clientX: 140, clientY: 560 }));
    await new Promise((r) => setTimeout(r, 80));
    const on = Math.abs(window.__app.input.x) > 0.3;
    s.dispatchEvent(new PointerEvent('pointercancel', { ...o, clientX: 140, clientY: 560 }));
    await new Promise((r) => setTimeout(r, 80));
    return { on, released: Math.abs(window.__app.input.x) + Math.abs(window.__app.input.y) < 0.01 };
  });
  if (!touched.on) fail('input', 'the virtual stick does not respond inside an iframe');
  if (!touched.released) fail('input', 'pointercancel does not release the stick inside an iframe');
  if (touched.on && touched.released) note('input', 'virtual stick works and releases correctly when embedded');

  /* ---- 5. The simulation is really running ---- */
  const sim = await f.evaluate(() => {
    const w = window.__app.world;
    return w ? { hp: Math.round(w.hp), enemies: w.stats().enemies } : null;
  });
  if (!sim) fail('sim', 'no simulation is running inside the iframe');
  else note('sim', `wave running embedded: hp ${sim.hp}, ${sim.enemies} machines alive`);

  /* ---- 6. The canvas got a real size inside the frame ---- */
  const canvas = await f.evaluate(() => {
    const c = document.querySelector('#game-canvas canvas');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  if (!canvas || canvas.w < 200 || canvas.h < 200) {
    fail('layout', `the canvas is ${canvas ? `${canvas.w}x${canvas.h}` : 'missing'} inside the iframe`);
  } else note('layout', `canvas sized ${canvas.w}x${canvas.h} inside the iframe`);

  await page.screenshot({ path: `${SHOTS}/iframe.png` });
}

// Off the platform there is no /sdk.js to fetch, so its 404 is expected. The
// browser logs that as a bare "Failed to load resource" with no URL attached,
// so it is matched against the requests that actually failed.
const unexpected = failedUrls.filter((u) => !/\/sdk\.js$|favicon/.test(u));
for (const u of [...new Set(unexpected)]) fail('network', `request failed: ${u}`);
const sdkNoise = failedUrls.some((u) => /\/sdk\.js$/.test(u));
/* ------------------------------------------------------------------ */
/* 7. The same embed, with storage blocked outright                    */
/* ------------------------------------------------------------------ */
// A browser set to block third-party storage makes every localStorage call
// throw inside an embedded frame. The game has to boot and stay playable
// from memory; only persistence across a reload is allowed to be lost.
{
  const blockedCtx = await browser.newContext({ viewport: { width: 500, height: 820 }, hasTouch: true });
  const blockedErrors = [];
  await blockedCtx.addInitScript(() => {
    const deny = () => { throw new DOMException('storage is blocked', 'SecurityError'); };
    for (const name of ['localStorage', 'sessionStorage']) {
      Object.defineProperty(window, name, {
        configurable: true,
        get: () => ({
          getItem: deny, setItem: deny, removeItem: deny, clear: deny,
          key: deny, get length() { return deny(); },
        }),
      });
    }
  });
  const blockedPage = await blockedCtx.newPage();
  blockedPage.on('pageerror', (e) => blockedErrors.push('pageerror: ' + e.message));
  await blockedPage.goto(`http://localhost:${HOST_PORT}/`, { waitUntil: 'load' });
  // The parent's load event fires before the child frame has committed its
  // URL, so the frame has to be waited for rather than looked up at once.
  await blockedPage.frameLocator('#game').locator('#ui-root').waitFor({ timeout: 25000 })
    .catch(() => {});
  const bf = blockedPage.frames().find((fr) => fr.url().startsWith(GAME));
  let booted = false;
  if (bf) {
    await bf.waitForFunction(() => !!window.__app, null, { timeout: 20000 }).catch(() => {});
    booted = await bf.evaluate(() => !!window.__app && !!document.querySelector('#ui-root .screen'))
      .catch(() => false);
  }
  if (!booted) {
    fail('storage', 'the game does not boot when storage is blocked');
  } else {
    // It must still run a contract, keeping progress in memory.
    const ran = await bf.evaluate(async () => {
      window.__app.save.update((d) => { d.progress.tutorialDone = true; d.progress.credits = 77; });
      window.__app.startRun('night_shift', 'scrap14');
      window.__app.startWave();
      await new Promise((r) => setTimeout(r, 900));
      return {
        credits: window.__app.save.get().progress.credits,
        world: !!window.__app.world,
      };
    }).catch(() => null);
    if (!ran || ran.credits !== 77 || !ran.world) {
      fail('storage', `blocked storage breaks play: ${JSON.stringify(ran)}`);
    } else {
      note('storage', 'boots and plays with storage blocked, keeping progress in memory');
    }
  }
  for (const e of [...new Set(blockedErrors)]) fail('storage', `uncaught with storage blocked: ${e}`);
  await blockedCtx.close();
}

const real = errors.filter((e) => {
  if (/ERR_|favicon/i.test(e)) return false;
  if (sdkNoise && /Failed to load resource/i.test(e)) return false;
  return true;
});
for (const e of [...new Set(real)]) fail('console', e);

await browser.close();
host.close();

console.log('IFRAME PRE-FLIGHT AUDIT\n');
for (const n of notes) console.log(`  note  ${n}`);
if (findings.length) {
  console.log('');
  for (const x of [...new Set(findings)]) console.log(`  FAIL  ${x}`);
  console.log(`\n${new Set(findings).size} finding(s)`);
  process.exit(1);
}
console.log('\nno findings');
