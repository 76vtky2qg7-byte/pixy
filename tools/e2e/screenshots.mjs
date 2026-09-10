/**
 * Capture store screenshots from the real production build.
 * Every image here is a genuine frame of the running game.
 */
import fs from 'node:fs';
import { dismissCoach, newBrowser, openGame, playFor, tap } from './harness.mjs';

const OUT = process.env.SHOT_DIR || 'store/screenshots';
fs.mkdirSync(OUT, { recursive: true });

const b = await newBrowser();

/** Skip the tutorial and drop straight into a configured run. */
async function setup(page, { contract = 'night_shift', wave = 0, slots = null, scrap = 220 } = {}) {
  await page.evaluate((cfg) => {
    window.__app.save.update((d) => {
      d.progress.tutorialDone = true;
      d.progress.credits = 340;
      d.progress.wonContracts = ['night_shift'];
      d.progress.upgrades = { hull: 2, servos: 1, fence: 2, calibration: 2 };
      d.progress.totalRuns = 7;
      d.progress.totalKills = 812;
    });
    window.__app.startRun(cfg.contract, 'scrap14');
    const r = window.__app.run;
    r.waveIndex = cfg.wave;
    r.wavesCleared = cfg.wave;
    r.rewardedWaves = Array.from({ length: cfg.wave }, (_, i) => i);
    r.scrap = cfg.scrap;
    if (cfg.slots) r.slots = cfg.slots;
    window.__app.show('prep');
  }, { contract, wave, slots, scrap });
  await page.waitForTimeout(500);
  await dismissCoach(page);
}

const FULL = ['riveter', 'battery', 'buzzsaw', 'coil', 'mortar', 'targeter'];

for (const [device, tag] of [['phone', '390x844'], ['phoneSmall', '360x800'], ['laptop', '1366x768']]) {
  const { page, ctx } = await openGame(b, { device });

  // 1. Menu
  await page.evaluate(() => {
    window.__app.save.update((d) => {
      d.progress.credits = 340; d.progress.totalRuns = 7; d.progress.totalKills = 812;
      d.progress.tutorialDone = true;
    });
    window.__app.show('menu');
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/1-menu-${tag}.png` });

  // 2. Combat, mid wave, full panel
  await setup(page, { contract: 'foundry_rush', wave: 4, slots: FULL });
  await tap(page, 'Начать волну');
  await playFor(page, 11, 'KeyD');
  await page.screenshot({ path: `${OUT}/2-combat-${tag}.png` });

  // 3. Preparation: the panel, the shop, the adjacency links
  await page.evaluate(() => { window.__app.quitToMenu(); });
  await page.waitForTimeout(400);
  await setup(page, { contract: 'foundry_rush', wave: 3, slots: FULL });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/3-panel-${tag}.png` });

  // 4. Boss fight
  await page.evaluate(() => { window.__app.quitToMenu(); });
  await page.waitForTimeout(400);
  await setup(page, { contract: 'night_shift', wave: 5, slots: FULL });
  await tap(page, 'Начать волну');
  await playFor(page, 9, 'KeyA');
  await page.screenshot({ path: `${OUT}/4-boss-${tag}.png` });

  // 5. Workshop
  await page.evaluate(() => { window.__app.quitToMenu(); window.__app.show('workshop'); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/5-workshop-${tag}.png` });

  // 6. Contracts
  await page.evaluate(() => window.__app.show('contracts'));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/6-contracts-${tag}.png` });

  await ctx.close();
  console.log(`captured ${tag}`);
}
await b.close();
