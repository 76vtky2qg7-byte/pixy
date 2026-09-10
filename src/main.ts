import './ui/style.css';
import { App } from './ui/app';

/**
 * Entry point. Anything that throws here would leave the player on the loading
 * screen forever, so the boot is wrapped and failure is made visible.
 */
const app = new App();

app.boot().catch((error) => {
  console.error('[sparkscrapper] boot failed', error);
  const text = document.getElementById('boot-text');
  if (text) {
    text.textContent = 'Ошибка загрузки. Обновите страницу. / Loading failed, please reload.';
    text.style.color = '#e04a3c';
  }
});

// Surface anything unhandled during play; the game keeps running.
window.addEventListener('error', (e) => console.error('[sparkscrapper]', e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => console.error('[sparkscrapper]', e.reason));

/**
 * Diagnostics handle.
 *
 * Exposed in the production bundle on purpose: the automated browser checks in
 * tools/e2e drive the real shipped artifact through this, rather than a special
 * build that would not be the thing players receive. It reads and drives game
 * state only — it holds no credentials and unlocks nothing a player could not
 * already reach by editing their own local save.
 */
(globalThis as { __app?: App }).__app = app;
