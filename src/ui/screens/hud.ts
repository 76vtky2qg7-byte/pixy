import { audio } from '../../audio/audio';
import { HEAT, PLAYER } from '../../config/balance';
import { WEAPONS } from '../../config/gear';
import type { AppContext } from '../app';
import { isBossWave, runContract, wavesTotal } from '../../sim/run';
import { button, confirmDialog, currency, el } from '../dom';
import { t, tk } from '../i18n';

/**
 * In-game HUD.
 *
 * Everything here is read-only state plus one button. It is rebuilt once and
 * then mutated in place each frame — creating nodes at 60Hz would be the most
 * expensive thing on screen.
 */
export function mountHud(ctx: AppContext): () => void {
  const { app, save, ui } = ctx;
  const world = app.world;
  const run = app.run;
  if (!world || !run) { app.show('menu'); return () => {}; }

  const boss = isBossWave(run);
  const settings = save.get().settings;

  /* ---- top bar: health, overdrive, wave, pause ---- */
  const hpFill = el('i');
  const hpBar = el('div', { class: 'bar hp' }, hpFill, el('span'));
  const hpText = hpBar.querySelector('span')!;

  const odFill = el('i');
  const odBar = el('div', { class: 'bar od' }, odFill);

  const timer = el('div', { class: 'hud-timer' });
  const waveLabel = el('div', { class: 'muted tiny' });

  const pauseBtn = button('II', () => openPause(), { class: 'btn-pause' });
  pauseBtn.setAttribute('aria-label', t('pause'));

  const top = el('div', { class: 'hud-top' },
    el('div', { class: 'hud-bars' }, hpBar, odBar),
    el('div', { class: 'hud-wave' }, timer, waveLabel),
    pauseBtn,
  );
  pauseBtn.classList.add('tappable');

  /* ---- scrap counter ---- */
  const scrapCount = el('span', { class: 'pill amber' }, currency('scrap'), el('b', { text: '0' }));
  const scrapValue = scrapCount.querySelector('b')!;
  const scrapRow = el('div', { class: 'hud-scrap' }, scrapCount);

  /* ---- boss bar ---- */
  const bossFill = el('i');
  const bossBar = el('div', { class: 'bar boss' }, bossFill);
  const bossBox = el('div', { class: 'hud-boss' },
    el('div', { class: 'label', text: t('boss') }), bossBar);
  bossBox.style.display = 'none';

  /* ---- heat chips, one per installed weapon ---- */
  const heatRow = el('div', { class: 'hud-heat' });
  const chips = world.weapons.map((w) => {
    const fill = el('i', { class: 'fill' });
    const chip = el('div', { class: 'heat-chip', title: tk('gear', w.id) },
      fill,
      (() => {
        const i = el('i', { class: 'ico' });
        const frame = WEAPONS[w.id].icon;
        i.style.backgroundPosition = `${-(frame % 7) * 22}px ${-Math.floor(frame / 7) * 22}px`;
        return i;
      })(),
    );
    heatRow.append(chip);
    return { chip, fill, cell: w.cell };
  });

  /* ---- virtual stick ---- */
  const stickBase = el('div', { class: 'stick-base' });
  const stickKnob = el('div', { class: 'stick-knob' });
  const stickLayer = el('div', { id: 'stick' }, stickBase, stickKnob);
  stickBase.style.display = stickKnob.style.display = 'none';

  const hud = el('div', { id: 'hud' }, top, scrapRow, bossBox, heatRow, stickLayer);
  ui.append(hud);

  /* ---- per-frame update ---- */
  let last = { hp: -1, scrap: -1, timeLeft: -1, od: -1 };

  app.setHudUpdater(() => {
    const w = app.world;
    if (!w) return;

    const hpPct = Math.max(0, w.hp / w.maxHp);
    if (Math.abs(hpPct - last.hp) > 0.002) {
      last.hp = hpPct;
      hpFill.style.width = `${hpPct * 100}%`;
      hpBar.classList.toggle('low', hpPct < 0.3);
      hpText.textContent = `${Math.ceil(w.hp)} / ${w.maxHp}`;
    }

    const odPct = w.overdriveTimer > 0
      ? w.overdriveTimer / PLAYER.overdriveDuration
      : w.overdrive / PLAYER.overdriveMax;
    if (Math.abs(odPct - last.od) > 0.005) {
      last.od = odPct;
      odFill.style.width = `${odPct * 100}%`;
      odBar.style.opacity = w.overdriveTimer > 0 ? '1' : '.7';
    }

    if (w.scrapEarned !== last.scrap) {
      last.scrap = w.scrapEarned;
      scrapValue.textContent = String(w.scrapEarned);
    }

    if (boss) {
      const b = w.boss;
      if (b) {
        bossBox.style.display = '';
        bossFill.style.width = `${Math.max(0, (b.hp / b.maxHp) * 100)}%`;
      } else {
        bossBox.style.display = 'none';
      }
      timer.textContent = '';
      waveLabel.textContent = t('bossWave');
    } else {
      const secs = Math.ceil(w.timeLeft);
      if (secs !== last.timeLeft) {
        last.timeLeft = secs;
        timer.textContent = `${secs}${t('seconds')}`;
        timer.classList.toggle('urgent', secs <= 5);
      }
      waveLabel.textContent =
        `${t('waveLabel')} ${run.waveIndex + 1}/${wavesTotal(run)} · ${tk('contract', run.contractId)}`;
    }

    for (const c of chips) {
      const ws = w.weapons.find((x) => x.cell === c.cell);
      if (!ws) continue;
      const pct = Math.min(1, ws.heat / HEAT.capacity);
      c.fill.style.height = `${pct * 100}%`;
      c.chip.classList.toggle('hot', ws.overheated);
      c.fill.style.background = ws.overheated ? 'var(--danger)' : 'var(--copper)';
    }

    const st = app.input.stick;
    if (st.active) {
      const clampR = 52;
      const d = Math.hypot(st.dx, st.dy);
      const k = d > clampR ? clampR / d : 1;
      stickBase.style.display = stickKnob.style.display = '';
      stickBase.style.left = `${st.ox}px`;
      stickBase.style.top = `${st.oy}px`;
      stickKnob.style.left = `${st.ox + st.dx * k}px`;
      stickKnob.style.top = `${st.oy + st.dy * k}px`;
    } else if (stickBase.style.display !== 'none') {
      stickBase.style.display = stickKnob.style.display = 'none';
    }
  });

  /* ---- pause menu ---- */
  let pauseNode: HTMLElement | null = null;

  function openPause(): void {
    if (pauseNode) return;
    app.pause.set('menu');
    audio.play('select');

    const card = el('div', { class: 'card', style: 'max-width:min(400px,90vw);margin:auto;text-align:center' },
      el('h2', { text: t('paused') }),
      el('div', { class: 'muted tiny', style: 'margin-bottom:12px' },
        `${tk('contract', run!.contractId)} · ${t('waveLabel')} ${run!.waveIndex + 1}/${wavesTotal(run!)}`),
      el('div', { class: 'col', style: 'gap:8px' },
        button(t('resume'), () => closePause(), { class: 'primary wide' }),
        button(t('settings'), () => { closePause(); app.show('settings'); }, { class: 'wide' }),
        button(t('quitToMenu'), async () => {
          const ok = await confirmDialog(t('quitConfirm'), t('confirm'), t('cancel'));
          if (!ok) return;
          closePause();
          app.quitToMenu();
        }, { class: 'danger wide' }),
      ),
    );
    pauseNode = el('div', {
      class: 'screen overlay',
      style: 'z-index:75;justify-content:center;align-items:center',
    }, card);
    ui.append(pauseNode);
  }

  function closePause(): void {
    pauseNode?.remove();
    pauseNode = null;
    // Clearing 'menu' does not resume a hidden tab or an ad — those hold their
    // own reasons and must clear themselves.
    app.pause.clear('menu');
  }

  /* ---- keyboard ---- */
  const onKey = (e: KeyboardEvent) => {
    if (e.code !== 'Escape' && e.code !== 'KeyP') return;
    e.preventDefault();
    if (pauseNode) closePause();
    else openPause();
  };
  window.addEventListener('keydown', onKey);

  // The game screen owns 'menu' only while its own pause card is open.
  app.pause.clear('menu');
  app.tutorial.trigger('move');
  setTimeout(() => app.tutorial.trigger('survive'), 12_000);
  void runContract;
  void settings;

  return () => {
    window.removeEventListener('keydown', onKey);
    app.setHudUpdater(null);
    pauseNode?.remove();
    hud.remove();
  };
}
