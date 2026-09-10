/**
 * Measure frame rate on the production build under a heavy late-wave load.
 *
 * This runs in headless Chromium with SwiftShader software rendering on a
 * cloud container — it is a FLOOR, not a phone number. Reported as such.
 */
import { newBrowser, openGame, playFor } from './harness.mjs';

const b = await newBrowser();
const results = [];

for (const [device, label, stress] of [
  ['phone', '390x844 dsf3', false],
  ['laptop', '1366x768 dsf1', false],
  ['phone', '390x844 dsf3 STRESS (pool cap)', true],
  ['laptop', '1366x768 dsf1 STRESS (pool cap)', true],
]) {
  const { page, ctx } = await openGame(b, { device });
  await page.evaluate(() => {
    window.__app.save.update((d) => { d.progress.tutorialDone = true; });
    // Heaviest realistic load: last non-boss wave of the hardest contract with
    // a full six-cell panel.
    window.__app.startRun('arc_quarantine', 'scrap14');
    const r = window.__app.run;
    r.waveIndex = 6;
    r.slots = ['riveter', 'battery', 'buzzsaw', 'coil', 'mortar', 'targeter'];
    window.__app.show('prep');
  });
  await page.waitForTimeout(400);
  await page.locator('#ui-root button', { hasText: 'Начать волну' }).first().click();
  await page.waitForTimeout(1500);

  if (stress) {
    // Fill the arena to the simultaneous-enemy cap and keep it there, so the
    // number reported is the engine's ceiling rather than a typical moment.
    await page.evaluate(() => {
      window.__stress = setInterval(() => {
        const w = window.__app.world;
        if (!w) return;
        const types = ['crusher', 'skitter', 'bulwark', 'lancer', 'kegger', 'mender'];
        // Hold the arena at the game's own simultaneous-enemy cap (WAVE.maxAlive),
        // which is the worst load the game will ever actually present.
        const CAP = 90;
        for (let i = 0; i < 14 && w.stats().enemies < CAP; i++) {
          w.spawnEnemy(types[i % types.length]);
        }
      }, 250);
    });
    await page.waitForTimeout(2500);
  }

  await page.evaluate(() => {
    window.__perf = {
      frames: 0, long: 0, start: performance.now(), last: performance.now(),
      peakEnemies: 0, peakProjectiles: 0, overflow: 0, deaths: 0,
    };
    const tick = () => {
      const now = performance.now();
      const dt = now - window.__perf.last;
      window.__perf.last = now;
      window.__perf.frames++;
      if (dt > 33) window.__perf.long++;
      const w = window.__app.world;
      if (w) {
        const st = w.stats();
        if (st.enemies > window.__perf.peakEnemies) window.__perf.peakEnemies = st.enemies;
        if (st.projectiles > window.__perf.peakProjectiles) window.__perf.peakProjectiles = st.projectiles;
        window.__perf.overflow = Math.max(window.__perf.overflow, st.overflow);
        // Keep the robot alive so the measurement covers the whole window
        // rather than stopping the moment the bot walks into a crowd.
        if (w.hp < w.maxHp * 0.7) { w.hp = w.maxHp; window.__perf.deaths++; }
      }
      window.__perf.raf = requestAnimationFrame(tick);
    };
    window.__perf.raf = requestAnimationFrame(tick);
  });
  await playFor(page, 22, 'KeyD');
  const p = await page.evaluate(() => {
    cancelAnimationFrame(window.__perf.raf);
    const secs = (performance.now() - window.__perf.start) / 1000;
    return {
      fps: window.__perf.frames / secs,
      longFrames: window.__perf.long,
      frames: window.__perf.frames,
      enemies: window.__perf.peakEnemies,
      projectiles: window.__perf.peakProjectiles,
      overflow: window.__perf.overflow,
      clockDropped: window.__app.clock.dropped,
    };
  });
  if (stress) await page.evaluate(() => clearInterval(window.__stress));
  results.push({ device: label, ...p });
  console.log(`${label}: ${p.fps.toFixed(1)} fps over ${p.frames} frames, ` +
    `${p.longFrames} frames >33ms, peak load ${p.enemies} enemies / ${p.projectiles} projectiles, ` +
    `pool overflow ${p.overflow}`);
  await ctx.close();
}
await b.close();
console.log(JSON.stringify(results));
