/**
 * End-to-end checks against the PRODUCTION build.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   node tools/e2e/run.mjs
 *
 * A fake Yandex SDK is injected before boot so the real adapter — the one that
 * ships — is what gets exercised, including every ad outcome.
 */
import fs from 'node:fs';
import {
  dismissCoach, forceWave, has, newBrowser, openGame, playFor, readSave,
  readState, Report, sdkCalls, tap, uiText, cloudSlot,
} from './harness.mjs';

const SHOTS = process.env.E2E_SHOTS || '/tmp/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const report = new Report();
const browser = await newBrowser();
const allErrors = [];

const note = (errs, label) => {
  const real = errs.filter((e) => !/ERR_TUNNEL|ERR_INTERNET|favicon/i.test(e));
  if (real.length) allErrors.push(`[${label}] ` + real.join(' | '));
  return real;
};

/* ================================================================== */
/* 1. New player: boot, tutorial, first wave                           */
/* ================================================================== */
{
  const { ctx, page, errors } = await openGame(browser);
  report.add('boots to menu', await has(page, 'ИСКРОЛОМ'));
  report.add('LoadingAPI.ready called once', (await sdkCalls(page)).ready === 1,
    `ready=${(await sdkCalls(page)).ready}`);

  await tap(page, 'Играть');
  report.add('contract list shows 3 contracts', (await uiText(page)).includes('Ночная смена')
    && (await uiText(page)).includes('Литейный аврал') && (await uiText(page)).includes('Дуговой карантин'));
  report.add('later contracts locked for a new player', await has(page, 'Закрыто'));

  await page.locator('#ui-root .card', { hasText: 'Ночная смена' }).first().click();
  await tap(page, 'Принять контракт');
  report.add('prep screen reached', await has(page, 'Склад'));
  const coachShown = await page.locator('.coach').count() > 0;
  const coachText = await has(page, 'по стороне, не по диагонали');
  report.add('tutorial explains the panel on the first shop visit', coachShown && coachText);
  report.add('a pausing hint blocks the screen beneath it',
    await page.locator('.coach-scrim').count() === 1);
  await page.screenshot({ path: `${SHOTS}/02-prep-phone.png` });

  await dismissCoach(page);
  const before = await readState(page);
  await tap(page, 'Начать волну');
  await page.waitForTimeout(600);
  const during = await readState(page);
  report.add('wave starts and simulation runs', during.screen === 'game' && during.hasWorld);
  report.add('GameplayAPI.start called', (await sdkCalls(page)).gameplayStart >= 1);
  report.add('tutorial coach mark appears in the wave', await page.locator('.coach').count() > 0);

  await playFor(page, 3);
  await page.screenshot({ path: `${SHOTS}/03-combat-phone.png` });
  const moved = await readState(page);
  report.add('robot survives the opening seconds', moved.hp > 0, `hp=${moved.hp}`);
  void before;

  note(errors, 'new player');
  await ctx.close();
}

/* ================================================================== */
/* 2. Buying, placing, swapping and cancelling gear                    */
/* ================================================================== */
{
  const { ctx, page, errors } = await openGame(browser, { device: 'laptop' });
  await tap(page, 'Играть');
  await page.locator('#ui-root .card', { hasText: 'Ночная смена' }).first().click();
  await tap(page, 'Принять контракт');

  // Give the run enough scrap to shop with, without playing five waves.
  await page.evaluate(() => {
    window.__app.run.scrap = 400;
    window.__app.show('prep');
  });
  await page.waitForTimeout(300);

  const slotsBefore = (await readState(page)).slots;
  const scrapBefore = (await readState(page)).scrap;

  // Buy the first available offer.
  await dismissCoach(page);
  const buyBtn = page.locator('#ui-root button', { hasText: /^Купить$/ }).first();
  await buyBtn.click();
  await page.waitForTimeout(200);
  const afterBuy = await readState(page);
  const added = afterBuy.slots.filter(Boolean).length - slotsBefore.filter(Boolean).length;
  report.add('buying installs exactly one part', added === 1, `delta=${added}`);
  report.add('buying spends scrap', afterBuy.scrap < scrapBefore, `${scrapBefore} -> ${afterBuy.scrap}`);

  // Double-tap protection: click the same offer's button twice very fast.
  await page.evaluate(() => { window.__app.run.scrap = 400; window.__app.show('prep'); });
  await page.waitForTimeout(250);
  const s0 = await readState(page);
  await page.evaluate(async () => {
    const b = [...document.querySelectorAll('#ui-root button')].find((x) => x.textContent === 'Купить');
    b.click(); b.click(); b.click();
  });
  await page.waitForTimeout(300);
  const s1 = await readState(page);
  const delta = s1.slots.filter(Boolean).length - s0.slots.filter(Boolean).length;
  report.add('rapid taps buy an offer only once', delta === 1, `delta=${delta}`);

  // Swap two occupied cells and confirm nothing is lost.
  await page.evaluate(() => {
    window.__app.run.slots = ['riveter', 'battery', 'buzzsaw', null, null, null];
    window.__app.show('prep');
  });
  await page.waitForTimeout(300);
  await dismissCoach(page);
  const cells = page.locator('#ui-root .cell');
  await cells.nth(0).click();
  await cells.nth(2).click();
  await page.waitForTimeout(200);
  const swapped = (await readState(page)).slots;
  report.add('tap-tap swaps two cells, losing nothing',
    swapped[0] === 'buzzsaw' && swapped[2] === 'riveter' && swapped.filter(Boolean).length === 3,
    JSON.stringify(swapped));

  // Cancel a selection: tapping the same cell twice must change nothing.
  await cells.nth(0).click();
  await cells.nth(0).click();
  await page.waitForTimeout(150);
  const afterCancel = (await readState(page)).slots;
  report.add('cancelling a selection changes nothing',
    JSON.stringify(afterCancel) === JSON.stringify(swapped));

  // Adjacency links are drawn, and only between orthogonal neighbours.
  await page.evaluate(() => {
    window.__app.run.slots = ['riveter', 'battery', null, null, null, null];
    window.__app.show('prep');
  });
  await page.waitForTimeout(400);
  const links = await page.locator('#ui-root .link').count();
  const linked = await page.locator('#ui-root .cell.linked').count();
  report.add('orthogonal pair shows one link and two lit cells',
    links === 1 && linked === 2, `links=${links} linked=${linked}`);

  // Diagonal pair must NOT link.
  await page.evaluate(() => {
    window.__app.run.slots = ['riveter', null, null, 'battery', null, null];
    window.__app.show('prep');
  });
  await page.waitForTimeout(400);
  const dLinks = await page.locator('#ui-root .link').count();
  const dLinked = await page.locator('#ui-root .cell.linked').count();
  report.add('diagonal pair shows no link', dLinks === 0 && dLinked === 0,
    `links=${dLinks} linked=${dLinked}`);
  report.add('module touching no weapon is flagged',
    await page.locator('#ui-root .cell.idle').count() === 1);

  await page.screenshot({ path: `${SHOTS}/04-prep-laptop.png` });
  note(errors, 'gear');
  await ctx.close();
}

/* ================================================================== */
/* 3. Twenty consecutive wave -> shop transitions                      */
/* ================================================================== */
{
  const { ctx, page, errors } = await openGame(browser);
  await page.evaluate(() => {
    window.__app.startRun('foundry_rush', 'scrap14');
  });
  await page.waitForTimeout(400);

  let ok = true, detail = '';
  for (let i = 0; i < 20; i++) {
    const st = await readState(page);
    if (st.screen === 'results') {
      // Contract finished; start another and keep cycling.
      await tap(page, 'В меню', { timeout: 6000 }).catch(() => {});
      await page.evaluate(() => window.__app.startRun('foundry_rush', 'scrap14'));
      await page.waitForTimeout(400);
    }
    await dismissCoach(page);
    const startBtn = page.locator('#ui-root button', { hasText: 'Начать волну' }).first();
    await startBtn.waitFor({ state: 'visible', timeout: 8000 })
      .catch(() => { ok = false; detail = `no start button at cycle ${i}`; });
    if (!ok) break;
    if (!(await startBtn.count())) { ok = false; detail = `no start button at cycle ${i}`; break; }
    if (await startBtn.isDisabled()) { ok = false; detail = `start button stuck disabled at cycle ${i}`; break; }
    await startBtn.click();
    await forceWave(page, 'cleared');
    const after = await readState(page);
    if (after.screen !== 'prep' && after.screen !== 'results') {
      ok = false; detail = `landed on ${after.screen} at cycle ${i}`; break;
    }
  }
  report.add('20 wave/shop/results transitions leave buttons usable', ok, detail);
  const leaks = await page.evaluate(() => document.querySelectorAll('#ui-root .screen').length);
  report.add('no screen nodes leak across transitions', leaks <= 1, `screens=${leaks}`);
  note(errors, '20 transitions');
  await ctx.close();
}

/* ================================================================== */
/* 4. Rewarded video: every outcome                                    */
/* ================================================================== */
for (const [mode, expectDouble, label] of [
  ['rewarded', true, 'reward granted'],
  ['closed', false, 'closed without reward'],
  ['error', false, 'ad error'],
  ['never', false, 'ad never calls back'],
  ['unavailable', false, 'no ad to show'],
  ['double', true, 'duplicate reward callback'],
]) {
  const { ctx, page, errors } = await openGame(browser, { sdk: { rewarded: mode, adDelay: 40 } });
  await page.evaluate(() => {
    window.__app.startRun('night_shift', 'scrap14');
    // Reach the loss with real progress behind it, so there are credits to double.
    const r = window.__app.run;
    r.waveIndex = 3; r.wavesCleared = 3; r.rewardedWaves = [0, 1, 2]; r.totalKills = 60;
    window.__app.show('prep');
  });
  await page.waitForTimeout(300);
  await tap(page, 'Начать волну');
  await page.waitForTimeout(300);
  await forceWave(page, 'failed');
  await page.waitForTimeout(500);

  const onResults = await has(page, 'Смена прервана');
  const creditsBefore = (await readState(page)).credits;
  const btn = page.locator('#ui-root button:visible', { hasText: /Удвоить кредиты|Реклама недоступна/ }).first();
  if (await btn.count()) {
    await btn.click();
    await page.waitForTimeout(mode === 'never' ? 1200 : 900);
  }
  // 'never' must give up on its own within a few seconds, not hang the game.
  if (mode === 'never') await page.waitForTimeout(6500);
  const creditsAfter = (await readState(page)).credits;
  const doubled = creditsAfter > creditsBefore;
  report.add(`rewarded video — ${label}`, onResults && doubled === expectDouble,
    `credits ${creditsBefore} -> ${creditsAfter}`);

  if (mode === 'double') {
    report.add('duplicate reward callback pays exactly once',
      creditsAfter === creditsBefore * 2, `${creditsBefore} -> ${creditsAfter}`);
    // A second attempt must be refused outright.
    const claimed = page.locator('#ui-root button', { hasText: /Кредиты удвоены|Уже получено/ }).first();
    report.add('reward offer is closed after claiming',
      await claimed.count() > 0 && await claimed.isDisabled());
  }

  const st = await readState(page);
  report.add(`ad leaves no lingering pause — ${label}`, !st.pauseReasons.includes('ad'),
    st.pauseReasons.join(','));
  note(errors, `rewarded:${mode}`);
  await ctx.close();
}

/* ================================================================== */
/* 5. Ad closing in a hidden tab must not resume combat                */
/* ================================================================== */
{
  const { ctx, page, errors } = await openGame(browser, { sdk: { rewarded: 'rewarded', adDelay: 300 } });
  await page.evaluate(() => window.__app.startRun('night_shift', 'scrap14'));
  await page.waitForTimeout(300);
  await tap(page, 'Начать волну');
  await page.waitForTimeout(400);

  // Hide the tab, then run an ad to completion while still hidden.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(150);
  const hidden = await readState(page);
  report.add('hidden tab pauses the wave', hidden.paused && hidden.pauseReasons.includes('hidden'),
    hidden.pauseReasons.join(','));

  await page.evaluate(async () => { await window.__app.maybeShowInterstitial(); });
  await page.waitForTimeout(200);
  await page.evaluate(async () => {
    window.__app.pause.set('ad');
    await window.__app.platform.showRewarded();
    window.__app.pause.clear('ad');
  });
  await page.waitForTimeout(700);

  const afterAd = await readState(page);
  report.add('closing an ad in a hidden tab does not resume combat',
    afterAd.paused && afterAd.pauseReasons.includes('hidden') && !afterAd.pauseReasons.includes('ad'),
    `paused=${afterAd.paused} reasons=${afterAd.pauseReasons.join(',')}`);

  // Restore visibility; now it should resume.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(200);
  const restored = await readState(page);
  report.add('restoring the tab resumes the wave', !restored.paused, restored.pauseReasons.join(','));

  // Host pause event (a call arriving) is its own independent reason.
  await page.evaluate(() => window.__hostPause());
  await page.waitForTimeout(150);
  const hostPaused = await readState(page);
  report.add('host pause event pauses independently',
    hostPaused.paused && hostPaused.pauseReasons.includes('system'));
  await page.evaluate(() => window.__hostResume());
  await page.waitForTimeout(150);
  report.add('host resume clears its own reason', !(await readState(page)).paused);

  note(errors, 'hidden tab');
  await ctx.close();
}

/* ================================================================== */
/* 6. Progress survives a reload; rewards are not paid twice           */
/* ================================================================== */
{
  const { ctx, page, errors } = await openGame(browser);
  await page.evaluate(() => window.__app.startRun('night_shift', 'scrap14'));
  await page.waitForTimeout(300);
  await tap(page, 'Начать волну');
  await page.waitForTimeout(300);
  await forceWave(page, 'cleared');
  await page.waitForTimeout(400);

  const afterWave1 = await readState(page);
  const save1 = await readSave(page);
  report.add('wave 1 clear is banked', save1.activeRun && save1.activeRun.waveIndex === 1,
    `waveIndex=${save1.activeRun?.waveIndex}`);
  const scrapAfter1 = afterWave1.scrap;
  const rewarded1 = save1.activeRun.rewardedWaves.slice();

  // Reload mid-contract and resume.
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#ui-root .screen');
  await page.waitForTimeout(600);
  report.add('reload offers to continue the shift', await has(page, 'Продолжить смену'));
  await tap(page, 'Продолжить смену');
  await page.waitForTimeout(200);
  report.add('resume dialog explains what happens', await has(page, 'начнётся заново'));
  // Scope to the dialog: the menu button behind it also starts with "Продолжить".
  await page.locator('#ui-root .screen.overlay button', { hasText: /^Продолжить$/ }).first().click();
  await page.waitForTimeout(400);

  const resumed = await readState(page);
  report.add('resumed at the right wave with the right scrap',
    resumed.wave === 1 && resumed.scrap === scrapAfter1,
    `wave=${resumed.wave} scrap=${resumed.scrap} (expected ${scrapAfter1})`);

  // Replay wave 2, then confirm wave 1's bonus was never paid again.
  await tap(page, 'Начать волну');
  await page.waitForTimeout(300);
  await forceWave(page, 'cleared');
  await page.waitForTimeout(400);
  const save2 = await readSave(page);
  const dupes = save2.activeRun.rewardedWaves.filter((w, i, a) => a.indexOf(w) !== i);
  report.add('no wave is rewarded twice after a reload', dupes.length === 0,
    `rewarded=${JSON.stringify(save2.activeRun.rewardedWaves)} was=${JSON.stringify(rewarded1)}`);

  note(errors, 'reload');
  await ctx.close();
}

/* ================================================================== */
/* 7. Cloud save round trip                                            */
/* ================================================================== */
{
  const { ctx, page, errors } = await openGame(browser, { sdk: { authorized: true } });
  await page.evaluate(() => {
    window.__app.save.update((d) => { d.progress.credits = 777; });
  });
  await page.evaluate(async () => { await window.__app.save.flushCloud(); });
  await page.waitForTimeout(300);
  const cloud = await cloudSlot(page);
  report.add('progress reaches cloud storage', !!cloud && cloud.progress.credits === 777,
    `cloud credits=${cloud?.progress?.credits}`);
  note(errors, 'cloud');
  await ctx.close();
}

/* ================================================================== */
/* 8. Win / lose / retry / next contract                               */
/* ================================================================== */
{
  const { ctx, page, errors } = await openGame(browser);
  // Jump to the last wave of contract 1 and clear it, to reach a win.
  await page.evaluate(() => {
    window.__app.startRun('night_shift', 'scrap14');
    const r = window.__app.run;
    r.waveIndex = 5;
    r.wavesCleared = 5;
    r.rewardedWaves = [0, 1, 2, 3, 4];
    window.__app.show('prep');
  });
  await page.waitForTimeout(300);
  await tap(page, 'Начать волну');
  await page.waitForTimeout(400);
  await forceWave(page, 'cleared');
  await page.waitForTimeout(700);

  report.add('clearing the final wave wins the contract', await has(page, 'Контракт выполнен'));
  report.add('results explain the credit breakdown', await has(page, 'За пройденные волны'));
  await page.screenshot({ path: `${SHOTS}/05-results-win.png` });
  const save = await readSave(page);
  report.add('winning unlocks the next contract',
    save.progress.wonContracts.includes('night_shift'));

  await tap(page, 'Следующий контракт');
  await page.waitForTimeout(500);
  report.add('next contract screen shows contract 2 unlocked',
    !(await uiText(page)).match(/Литейный аврал[\s\S]{0,220}Закрыто/));

  // Now a loss and an immediate retry.
  await page.evaluate(() => window.__app.startRun('night_shift', 'scrap14'));
  await page.waitForTimeout(300);
  await tap(page, 'Начать волну');
  await page.waitForTimeout(300);
  await forceWave(page, 'failed');
  await page.waitForTimeout(600);
  report.add('losing shows the failure screen', await has(page, 'Смена прервана'));
  await page.screenshot({ path: `${SHOTS}/06-results-lose.png` });
  await tap(page, 'Повторить');
  await page.waitForTimeout(700);
  const retried = await readState(page);
  report.add('retry goes straight back into the same contract',
    retried.screen === 'prep' && retried.wave === 0, `screen=${retried.screen} wave=${retried.wave}`);

  note(errors, 'win/lose');
  await ctx.close();
}

/* ================================================================== */
/* 9. Language switch, resize, orientation, pointercancel              */
/* ================================================================== */
{
  const { ctx, page, errors } = await openGame(browser, { device: 'laptop' });
  await tap(page, 'Настройки');
  await tap(page, 'English');
  await page.waitForTimeout(300);
  report.add('language switches to English', await has(page, 'Settings'));
  await tap(page, '‹');
  await page.waitForTimeout(200);
  report.add('menu is translated after the switch', await has(page, 'Play'));
  await tap(page, 'Settings');
  await tap(page, 'Русский');
  await tap(page, '‹');
  await page.waitForTimeout(200);
  report.add('language switches back to Russian', await has(page, 'Играть'));

  // Resize across all three target sizes while a wave is running.
  await page.evaluate(() => window.__app.startRun('night_shift', 'scrap14'));
  await page.waitForTimeout(300);
  await tap(page, 'Начать волну');
  await page.waitForTimeout(400);
  let resizeOk = true;
  for (const vp of [{ width: 360, height: 800 }, { width: 390, height: 844 },
                    { width: 1366, height: 768 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(vp);
    await page.waitForTimeout(350);
    const st = await readState(page);
    if (!st.hasWorld || st.hp <= 0) { resizeOk = false; break; }
    const canvas = await page.locator('#game-canvas canvas').boundingBox();
    if (!canvas || canvas.width < 100) { resizeOk = false; break; }
  }
  report.add('resizing and rotating mid-wave keeps the game running', resizeOk);

  // pointercancel must release the stick rather than leaving the robot walking.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const stuck = await page.evaluate(async () => {
    const surface = document.getElementById('game-surface');
    const opts = { pointerId: 7, pointerType: 'touch', clientX: 80, clientY: 600, bubbles: true };
    surface.dispatchEvent(new PointerEvent('pointerdown', opts));
    surface.dispatchEvent(new PointerEvent('pointermove', { ...opts, clientX: 150, clientY: 600 }));
    await new Promise((r) => setTimeout(r, 60));
    const moving = Math.abs(window.__app.input.x) > 0.1;
    surface.dispatchEvent(new PointerEvent('pointercancel', opts));
    await new Promise((r) => setTimeout(r, 60));
    const afterCancel = Math.abs(window.__app.input.x) + Math.abs(window.__app.input.y);
    return { moving, afterCancel };
  });
  report.add('virtual stick responds to touch', stuck.moving);
  report.add('pointercancel releases the stick', stuck.afterCancel < 0.01, `residual=${stuck.afterCancel}`);

  note(errors, 'i18n/resize');
  await ctx.close();
}

/* ================================================================== */
/* 10. A full contract, start to finish, watching for console errors   */
/* ================================================================== */
{
  const { ctx, page, errors } = await openGame(browser, { device: 'laptop' });
  await page.evaluate(() => window.__app.startRun('night_shift', 'scrap14'));
  await page.waitForTimeout(300);

  let waves = 0;
  for (let i = 0; i < 8; i++) {
    const st = await readState(page);
    if (st.screen === 'results') break;
    await tap(page, 'Начать волну');
    await page.waitForTimeout(200);
    // Play a real slice of each wave before ending it, so the simulation,
    // renderer and audio all actually run.
    await playFor(page, 2.5, i % 2 ? 'KeyA' : 'KeyD');
    await forceWave(page, 'cleared');
    await page.waitForTimeout(400);
    waves++;
  }
  report.add('a full contract plays through every wave', waves >= 6, `waves=${waves}`);
  report.add('contract ends on the results screen', await has(page, 'Контракт'));

  const real = note(errors, 'full contract');
  report.add('full contract runs with no console errors', real.length === 0, real.join(' | '));
  await ctx.close();
}

/* ================================================================== */
/* 11. Offline play — the store card claims it, so it must be true     */
/* ================================================================== */
{
  const { ctx, page, errors } = await openGame(browser, { device: 'phone' });
  await page.evaluate(() => window.__app.save.update((d) => { d.progress.tutorialDone = true; }));
  await page.waitForFunction(() => window.__app.screensPreloaded === true, null, { timeout: 15000 })
    .catch(() => {});

  const failedRequests = [];
  page.on('requestfailed', (r) => failedRequests.push(r.url()));
  await ctx.setOffline(true);

  // Every screen, with the connection already gone.
  await tap(page, 'Играть');
  const contractsOk = await has(page, 'Ночная смена');
  await page.locator('#ui-root .card', { hasText: 'Ночная смена' }).first().click();
  await tap(page, 'Принять контракт');
  const prepOk = await has(page, 'Склад');
  await dismissCoach(page);
  await tap(page, 'Начать волну');
  await playFor(page, 2.5);
  const waveOk = (await readState(page)).screen === 'game';
  await forceWave(page, 'failed');
  const resultsOk = await has(page, 'Смена прервана');
  await tap(page, 'В меню');
  await tap(page, 'Мастерская');
  const workshopOk = await has(page, 'Мастерская');
  await tap(page, '‹');
  await tap(page, 'Настройки');
  const settingsOk = await has(page, 'Язык');

  report.add('offline: every screen still opens',
    contractsOk && prepOk && waveOk && resultsOk && workshopOk && settingsOk,
    `contracts=${contractsOk} prep=${prepOk} wave=${waveOk} results=${resultsOk} workshop=${workshopOk} settings=${settingsOk}`);
  report.add('offline: no request fails while playing', failedRequests.length === 0,
    failedRequests.slice(0, 3).join(', '));

  // Progress must still be written locally with no network.
  const savedOffline = await readSave(page);
  report.add('offline: progress is still saved locally', !!savedOffline && savedOffline.revision > 0,
    `revision=${savedOffline?.revision}`);

  const offlineErrors = note(errors, 'offline');
  report.add('offline: no console errors', offlineErrors.length === 0, offlineErrors.join(' | '));

  await ctx.setOffline(false);
  await ctx.close();
}

/* ================================================================== */
/* 12. Screenshots at the three required sizes                         */
/* ================================================================== */
for (const [device, name] of [['phoneSmall', '360x800'], ['phone', '390x844'], ['laptop', '1366x768']]) {
  const { ctx, page } = await openGame(browser, { device });
  await page.screenshot({ path: `${SHOTS}/menu-${name}.png` });
  await tap(page, 'Играть');
  await page.screenshot({ path: `${SHOTS}/contracts-${name}.png` });
  await page.evaluate(() => window.__app.startRun('night_shift', 'scrap14'));
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    window.__app.run.scrap = 260;
    window.__app.run.slots = ['riveter', 'battery', 'buzzsaw', 'coil', 'mortar', 'targeter'];
    window.__app.show('prep');
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/prep-${name}.png` });
  await tap(page, 'Начать волну');
  await playFor(page, 6, 'KeyD');
  await page.screenshot({ path: `${SHOTS}/combat-${name}.png` });
  await page.evaluate(() => { window.__app.pause.set('menu'); });
  await page.waitForTimeout(150);
  await ctx.close();
}
report.add('screenshots captured at 360x800, 390x844 and 1366x768', true);

/* ================================================================== */
await browser.close();
if (allErrors.length) {
  console.log('\nconsole/page errors observed:');
  for (const e of allErrors) console.log('  ' + e);
}
const ok = report.summary();
fs.writeFileSync(`${SHOTS}/report.json`, JSON.stringify({ rows: report.rows, errors: allErrors }, null, 2));
process.exit(ok ? 0 : 1);
