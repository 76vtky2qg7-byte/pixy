#!/usr/bin/env node
/**
 * Runtime pre-flight audit against the production build.
 *
 * Checks the quality problems a moderator actually sees: clipped or
 * overflowing text at real device widths, glyphs that fall back to a system
 * font, buttons that do nothing, console errors, and any request that leaves
 * the origin.
 *
 *   npm run build && npx vite preview --port 4173 --strictPort &
 *   node tools/audit-browser.mjs
 */
import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:4173';
const CHROME = process.env.E2E_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const SHOTS = process.env.AUDIT_SHOTS || '/tmp/audit';
fs.mkdirSync(SHOTS, { recursive: true });

const findings = [];
const notes = [];
const fail = (area, msg) => findings.push(`${area}: ${msg}`);
const note = (area, msg) => notes.push(`${area}: ${msg}`);

/** Widths a Yandex Games player can realistically arrive with. */
const SIZES = [
  { name: '320x568', w: 320, h: 568, touch: true },   // smallest phone still in use
  { name: '360x640', w: 360, h: 640, touch: true },
  { name: '360x800', w: 360, h: 800, touch: true },
  { name: '390x844', w: 390, h: 844, touch: true },
  { name: '414x896', w: 414, h: 896, touch: true },
  { name: '768x1024', w: 768, h: 1024, touch: true },  // tablet portrait
  { name: '844x390', w: 844, h: 390, touch: true },    // phone landscape
  { name: '1024x768', w: 1024, h: 768, touch: false },
  { name: '1366x768', w: 1366, h: 768, touch: false },
  { name: '1920x1080', w: 1920, h: 1080, touch: false },
];

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--mute-audio'] });

/* ------------------------------------------------------------------ */
/* Helpers injected into the page                                      */
/* ------------------------------------------------------------------ */

/**
 * Find text that does not fit its box.
 *
 * Reports an element whose content overflows horizontally, or whose rendered
 * height is clipped by a fixed height. Ignores containers that are explicitly
 * scrollable, since those are meant to overflow.
 */
const OVERFLOW_PROBE = `(() => {
  const bad = [];
  const root = document.getElementById('ui-root');
  if (!root) return bad;
  for (const el of root.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const scrollable = cs.overflowY === 'auto' || cs.overflowY === 'scroll'
      || cs.overflowX === 'auto' || cs.overflowX === 'scroll';
    if (scrollable) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;

    // Horizontal overflow of the element's own content.
    if (el.scrollWidth > el.clientWidth + 1 && cs.overflow !== 'visible') {
      bad.push({ kind: 'clipped-x', tag: el.tagName, cls: el.className,
        text: (el.textContent || '').trim().slice(0, 60),
        scroll: el.scrollWidth, client: el.clientWidth });
    }
    if (el.scrollHeight > el.clientHeight + 1 && cs.overflow === 'hidden') {
      bad.push({ kind: 'clipped-y', tag: el.tagName, cls: el.className,
        text: (el.textContent || '').trim().slice(0, 60),
        scroll: el.scrollHeight, client: el.clientHeight });
    }
    // Anything sticking out past the viewport horizontally.
    if (r.left < -1 || r.right > window.innerWidth + 1) {
      bad.push({ kind: 'offscreen-x', tag: el.tagName, cls: el.className,
        text: (el.textContent || '').trim().slice(0, 60),
        left: Math.round(r.left), right: Math.round(r.right), vw: window.innerWidth });
    }
  }
  return bad;
})()`;

/**
 * Detect characters that do not render in the bundled pixel font.
 *
 * Measures each character twice — once with the game font first in the stack,
 * once with only the fallback. Identical widths mean the game font supplied no
 * glyph and the fallback is what the player sees.
 */
const GLYPH_PROBE = `(async () => {
  await document.fonts.ready;
  // Rendering to a canvas and comparing pixels, rather than comparing advance
  // widths: two unrelated fonts agree on a width often enough to make the
  // width test lie in both directions.
  const render = (ch, family) => {
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 64;
    const c = cv.getContext('2d');
    c.fillStyle = '#fff'; c.fillRect(0, 0, 64, 64);
    c.fillStyle = '#000'; c.font = '40px ' + family; c.textBaseline = 'top';
    c.fillText(ch, 4, 4);
    return cv.toDataURL();
  };
  const chars = new Set();
  for (const el of document.querySelectorAll('#ui-root *')) {
    for (const n of el.childNodes) {
      if (n.nodeType === 3) for (const ch of n.textContent) {
        if (ch.trim()) chars.add(ch);
      }
    }
  }
  const out = [];
  for (const ch of chars) {
    // 'Pixelify' with no fallback listed resolves to the browser default
    // (serif) for any character the bundled file does not cover.
    if (render(ch, "'Pixelify'") === render(ch, 'serif')) {
      out.push({ ch, cp: 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0') });
    }
  }
  return out;
})()`;

/** Seed a save so every screen has content worth laying out. */
const SEED = `(() => {
  window.__app.save.update((d) => {
    d.progress.tutorialDone = true;
    d.progress.credits = 1240;
    d.progress.wonContracts = ['night_shift', 'foundry_rush'];
    d.progress.unlockedRobots = ['scrap14', 'volt9'];
    d.progress.upgrades = { hull: 3, servos: 2, welder: 1, grapple: 2, fence: 2, calibration: 3 };
    d.progress.totalRuns = 41;
    d.progress.totalKills = 18734;
  });
})()`;

async function openAt(size, lang) {
  const ctx = await browser.newContext({
    viewport: { width: size.w, height: size.h },
    deviceScaleFactor: size.touch ? 2 : 1,
    hasTouch: size.touch,
    isMobile: size.touch,
    locale: lang === 'ru' ? 'ru-RU' : 'en-US',
  });
  const errors = [];
  const requests = [];
  const failed = [];
  const page = await ctx.newPage();
  page.on('response', (r) => { if (r.status() >= 400) failed.push(r.url()); });
  page.on('requestfailed', (r) => failed.push(r.url()));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForSelector('#ui-root .screen', { timeout: 20000 });
  await page.evaluate(SEED);
  if (lang === 'en') {
    await page.evaluate(() => {
      window.__app.save.update((d) => { d.settings.lang = 'en'; });
      window.__app.show('menu');
    });
  }
  await page.waitForTimeout(400);
  return { ctx, page, errors, requests, failed };
}

/* ------------------------------------------------------------------ */
/* 1. Layout at every size, in both languages                          */
/* ------------------------------------------------------------------ */
const SCREENS = [
  ['menu', async (page) => { await page.evaluate(() => window.__app.show('menu')); }],
  ['contracts', async (page) => { await page.evaluate(() => window.__app.show('contracts')); }],
  ['prep', async (page) => {
    await page.evaluate(() => {
      window.__app.startRun('arc_quarantine', 'scrap14');
      const r = window.__app.run;
      r.waveIndex = 4; r.scrap = 428;
      r.slots = ['riveter', 'battery', 'buzzsaw', 'coil', 'mortar', 'targeter'];
      window.__app.show('prep');
    });
  }],
  ['workshop', async (page) => { await page.evaluate(() => window.__app.show('workshop')); }],
  ['settings', async (page) => { await page.evaluate(() => window.__app.show('settings')); }],
  ['results', async (page) => {
    await page.evaluate(() => {
      const a = window.__app;
      a.startRun('arc_quarantine', 'scrap14');
      a.run.wavesCleared = 7; a.run.totalKills = 612; a.run.scrap = 380;
      a.lastResult = { won: true, wavesCleared: 7, wavesTotal: 8, kills: 612,
        baseCredits: 173, durationSeconds: 540,
        breakdown: [{ key: 'waves', amount: 42 }, { key: 'kills', amount: 61 },
          { key: 'win', amount: 40 }, { key: 'tier', amount: 30 }] };
      a.show('results');
    });
  }],
];

let layoutChecks = 0;
for (const lang of ['ru', 'en']) {
  for (const size of SIZES) {
    const { ctx, page, errors, requests, failed } = await openAt(size, lang);

    for (const [name, go] of SCREENS) {
      await go(page);
      await page.waitForTimeout(450);
      layoutChecks++;
      const bad = await page.evaluate(OVERFLOW_PROBE);
      for (const b of bad) {
        fail('layout', `${lang} ${size.name} ${name}: ${b.kind} on ${b.tag}.${String(b.cls).split(' ')[0]} `
          + `"${b.text}" (${b.scroll ?? b.right} vs ${b.client ?? b.vw})`);
      }
      if (size.name === '320x568' || size.name === '1920x1080') {
        await page.screenshot({ path: `${SHOTS}/${lang}-${size.name}-${name}.png` });
      }
    }

    // Every request must stay on this origin. The SDK is same-origin by design.
    const foreign = requests.filter((u) => !u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:'));
    for (const u of [...new Set(foreign)]) fail('network', `${lang} ${size.name}: request left the origin: ${u}`);

    // Yandex serves /sdk.js from the host root; nothing outside the platform
    // can. Its 404 here is expected, and the adapter is supposed to fall back
    // to local play rather than break - which is what gets asserted below.
    const unexpected = failed.filter((u) => !/\/sdk\.js$|favicon/.test(u));
    for (const u of [...new Set(unexpected)]) {
      fail('network', `${lang} ${size.name}: request failed: ${u}`);
    }
    const platform = await page.evaluate(() => ({
      ready: !!window.__app?.screen,
      name: window.__app?.platform?.info?.name ?? null,
    }));
    if (!platform.ready) {
      fail('platform', `${lang} ${size.name}: game did not reach a screen without the SDK`);
    }
    if (platform.name !== 'none') {
      fail('platform', `${lang} ${size.name}: reports platform "${platform.name}" though the SDK did not load`);
    }

    // The bare "Failed to load resource" line the browser logs for the SDK
    // probe carries no URL, so it is matched against what actually failed.
    const sdkNoise = failed.some((u) => /\/sdk\.js$/.test(u));
    const real = errors.filter((e) => {
      if (/ERR_|favicon/i.test(e)) return false;
      if (sdkNoise && /Failed to load resource/i.test(e)) return false;
      return true;
    });
    for (const e of [...new Set(real)]) fail('console', `${lang} ${size.name}: ${e}`);

    await ctx.close();
  }
}
note('layout', `${layoutChecks} screen/size/language combinations checked`);

/* ------------------------------------------------------------------ */
/* 2. Glyph coverage on a screen that uses the decorative characters   */
/* ------------------------------------------------------------------ */
{
  const { ctx, page } = await openAt(SIZES[3], 'ru');
  await page.evaluate(() => window.__app.show('contracts'));
  await page.waitForTimeout(600);
  const missing = await page.evaluate(GLYPH_PROBE);
  for (const m of missing) {
    fail('font', `"${m.ch}" (${m.cp}) has no glyph in the bundled font and falls back to a system font`);
  }
  if (!missing.length) note('font', 'every character on screen renders in the bundled pixel font');
  await ctx.close();
}

/* ------------------------------------------------------------------ */
/* 3. No dead buttons: every control must do something                 */
/* ------------------------------------------------------------------ */
{
  const { ctx, page } = await openAt(SIZES[8], 'ru');
  let clicked = 0;
  for (const [name, go] of SCREENS) {
    await go(page);
    await page.waitForTimeout(400);
    // Re-selecting the option a radio group is already on is meant to do
    // nothing, so those are not candidates for a dead-button check.
    const labels = await page.evaluate(() => [...document.querySelectorAll('#ui-root button')]
      .filter((b) => !b.disabled && b.offsetParent !== null)
      .filter((b) => b.getAttribute('aria-checked') !== 'true')
      .map((b) => (b.textContent || '').trim()));
    for (const label of labels) {
      await go(page);
      await page.waitForTimeout(350);
      const before = await page.evaluate(() => ({
        screen: window.__app.screen,
        html: document.getElementById('ui-root').innerHTML.length,
        save: JSON.stringify(window.__app.save.get()).length,
      }));
      const btn = page.locator('#ui-root button', { hasText: label }).first();
      if (!(await btn.count())) continue;
      await btn.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(450);
      const after = await page.evaluate(() => ({
        screen: window.__app.screen,
        html: document.getElementById('ui-root').innerHTML.length,
        save: JSON.stringify(window.__app.save.get()).length,
        overlay: document.querySelectorAll('#ui-root .screen').length,
        toast: document.querySelector('.toast.show') ? 1 : 0,
      }));
      clicked++;
      const changed = after.screen !== before.screen
        || after.html !== before.html
        || after.save !== before.save
        || after.overlay > 1
        || after.toast === 1;
      if (!changed) fail('dead-ui', `${name}: button "${label}" produced no visible effect`);
      // Dismiss whatever the click opened.
      await page.evaluate(() => {
        document.querySelectorAll('#ui-root .screen.overlay').forEach((n) => n.remove());
      });
    }
  }
  note('dead-ui', `${clicked} buttons exercised across ${SCREENS.length} screens`);
  await ctx.close();
}

await browser.close();

console.log('BROWSER PRE-FLIGHT AUDIT\n');
for (const n of notes) console.log(`  note  ${n}`);
if (findings.length) {
  console.log('');
  const seen = new Set();
  for (const f of findings) {
    if (seen.has(f)) continue;
    seen.add(f);
    console.log(`  FAIL  ${f}`);
  }
  console.log(`\n${seen.size} unique finding(s) from ${findings.length} total`);
  process.exit(1);
}
console.log('\nno findings');
