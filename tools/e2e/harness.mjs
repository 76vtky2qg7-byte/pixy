/** Shared helpers for the end-to-end checks. */
import { chromium } from 'playwright';
import { fakeSdkScript } from './fakesdk.mjs';

export const BASE = process.env.E2E_BASE || 'http://127.0.0.1:4173';
const CHROME = process.env.E2E_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

export const DEVICES = {
  phone: { width: 390, height: 844, dsf: 3 },
  phoneSmall: { width: 360, height: 800, dsf: 2 },
  laptop: { width: 1366, height: 768, dsf: 1 },
  phoneLandscape: { width: 844, height: 390, dsf: 3 },
};

export async function newBrowser() {
  return chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--mute-audio'] });
}

/**
 * Open the game with a fake SDK injected and console/page errors collected.
 * `storage` seeds localStorage before boot, which is how the reload tests work.
 */
export async function openGame(browser, { sdk = {}, device = 'phone', storage = null } = {}) {
  const d = DEVICES[device];
  const ctx = await browser.newContext({
    viewport: { width: d.width, height: d.height },
    deviceScaleFactor: d.dsf,
    hasTouch: device.startsWith('phone'),
    isMobile: device.startsWith('phone'),
    locale: 'ru-RU',
  });
  const errors = [];
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.addInitScript(fakeSdkScript(sdk));
  if (storage) {
    await page.addInitScript((s) => {
      for (const [k, v] of Object.entries(s)) window.localStorage.setItem(k, v);
    }, storage);
  }
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForSelector('#ui-root .screen', { timeout: 20000 });
  await page.waitForTimeout(250);
  return { ctx, page, errors };
}

/**
 * Dismiss a blocking tutorial hint, the way a player would before they can
 * touch anything underneath it.
 */
export async function dismissCoach(page) {
  const coach = page.locator('.coach');
  if (!(await coach.count())) return false;
  const ok = coach.locator('button', { hasText: /Понятно|Got it/ }).first();
  if (await ok.count()) {
    await ok.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(120);
    return true;
  }
  return false;
}

/** Click a button by its visible label, clearing any hint in the way first. */
export async function tap(page, label, opts = {}) {
  if (opts.keepCoach !== true) await dismissCoach(page);
  const btn = page.locator('#ui-root button', { hasText: label }).first();
  await btn.waitFor({ state: 'visible', timeout: opts.timeout ?? 8000 });
  await btn.click({ timeout: opts.timeout ?? 8000 });
  await page.waitForTimeout(opts.settle ?? 90);
}

export const uiText = (page) => page.locator('#ui-root').innerText();

/** Case-insensitive: several headings are uppercased by CSS, so innerText
 *  does not match the source string exactly. */
export const has = async (page, text) =>
  (await uiText(page)).toLocaleLowerCase('ru').includes(text.toLocaleLowerCase('ru'));

/** Read the game's own state through the dev handle, when present. */
export const readState = (page) => page.evaluate(() => {
  const a = window.__app;
  if (!a) return null;
  return {
    screen: a.screen,
    paused: a.pause.paused,
    pauseReasons: a.pause.active,
    hasWorld: !!a.world,
    hp: a.world ? Math.round(a.world.hp) : null,
    wave: a.run ? a.run.waveIndex : null,
    scrap: a.run ? a.run.scrap : null,
    slots: a.run ? a.run.slots : null,
    credits: a.save.get().progress.credits,
    outcome: a.world ? a.world.outcome : null,
  };
});

/** Local save as the game stored it. */
export const readSave = (page) => page.evaluate(() =>
  JSON.parse(window.localStorage.getItem('sparkscrapper.save.v1') || 'null'));

export const sdkCalls = (page) => page.evaluate(() => window.__SDK_CALLS);
export const cloudSlot = (page) => page.evaluate(() => window.__CLOUD);

/** Drive the arena for `seconds` while holding a movement key. */
export async function playFor(page, seconds, key = 'KeyD') {
  await page.keyboard.down(key);
  await page.waitForTimeout(seconds * 1000);
  await page.keyboard.up(key);
}

/**
 * Force the current wave to end with the given outcome, without waiting it out.
 *
 * Waits for the world to exist first: starting a wave is asynchronous, and
 * forcing before the simulation is constructed silently does nothing and leaves
 * the caller stuck on the game screen. Then polls for the screen to actually
 * change rather than sleeping a fixed amount, so a slow frame does not read as
 * a failure.
 */
export async function forceWave(page, outcome) {
  await page.waitForFunction(() => !!window.__app?.world, null, { timeout: 10000 });

  await page.evaluate((o) => {
    const w = window.__app.world;
    if (o === 'cleared') {
      w.timeLeft = 0.01;
      w.spawnBudget = 0;
      for (const e of w.enemies.items) if (e.active) w.enemies.release(e);
      if (w.wave.boss) { w.outcome = 'cleared'; w.events.push({ t: 'waveCleared' }); }
    } else {
      w.hp = 0;
      w.revives = 0;
      w.outcome = 'failed';
      w.events.push({ t: 'playerDown' });
    }
  }, outcome);

  // The wave-end sweep runs for WAVE.endOfWaveSweepSeconds before the screen
  // changes, and mounting the next screen is a dynamic import.
  await page.waitForFunction(
    () => window.__app.screen === 'prep' || window.__app.screen === 'results',
    null, { timeout: 15000 },
  ).catch(() => {});
  await page.waitForTimeout(120);
}

export class Report {
  constructor() { this.rows = []; }
  add(name, ok, detail = '') {
    this.rows.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  }
  get failed() { return this.rows.filter((r) => !r.ok); }
  summary() {
    const p = this.rows.filter((r) => r.ok).length;
    console.log(`\n${p}/${this.rows.length} checks passed`);
    if (this.failed.length) {
      console.log('failures:');
      for (const f of this.failed) console.log(`  - ${f.name}: ${f.detail}`);
    }
    return this.failed.length === 0;
  }
}
