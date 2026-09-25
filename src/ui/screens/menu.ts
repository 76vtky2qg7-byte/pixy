import { audio } from '../../audio/audio';
import { contractById } from '../../config/contracts';
import type { AppContext } from '../app';
import { button, currency, el, screen } from '../dom';
import { t } from '../i18n';
import { mountCloudConflict } from './conflict';

export function mountMenu(ctx: AppContext): () => void {
  const { app, save, ui } = ctx;
  const d = save.get();

  const s = screen({});
  s.root.style.justifyContent = 'center';
  s.root.style.alignItems = 'center';
  s.root.style.textAlign = 'center';
  s.root.style.background = 'linear-gradient(180deg, rgba(5,8,15,.92), rgba(5,8,15,.72) 40%, rgba(5,8,15,.95))';
  s.head.remove();
  s.body.style.flex = '0 0 auto';
  s.body.style.overflow = 'visible';

  const title = el('div', { style: 'margin-bottom:6px' },
    el('div', {
      class: 'boot-logo',
      text: t('gameTitle'),
      // The English title is 13 characters against the Russian 8, so the
      // narrowest phone sets the ceiling here, not the longest screen.
      style: 'font-size:clamp(28px,9vw,58px)',
    }),
    el('div', { class: 'muted', text: t('gameSubtitle'), style: 'margin-top:2px' }),
  );

  const wallet = el('div', { class: 'row', style: 'justify-content:center;margin:14px 0' },
    el('span', { class: 'pill arc' }, currency('credit'), String(d.progress.credits)),
  );

  const buttons = el('div', { class: 'col', style: 'width:min(320px,86vw);gap:10px' });

  // Resuming an interrupted contract is offered first, and the explanation of
  // what resuming does is on the button's own screen, not buried in a tooltip.
  const active = d.activeRun;
  if (active && contractById(active.contractId)) {
    buttons.append(button(
      `${t('continueRun')} · ${t('waveLabel')} ${active.waveIndex + 1}`,
      () => mountResumeDialog(ctx, active),
      { class: 'primary wide' },
    ));
  }

  buttons.append(
    button(t('play'), async () => {
      await audio.unlock();
      audio.setMood('menu');
      app.show('contracts');
    }, { class: active ? 'wide' : 'primary wide' }),
    button(t('workshop'), () => app.show('workshop'), { class: 'wide' }),
    button(t('settings'), () => app.show('settings'), { class: 'wide' }),
  );

  const stats = el('div', { class: 'muted tiny', style: 'margin-top:16px' },
    `${t('lifetimeRuns')}: ${d.progress.totalRuns} · ${t('lifetimeKills')}: ${d.progress.totalKills}`,
  );

  s.body.append(title, wallet, buttons, stats);
  s.foot.remove();
  ui.append(s.root);

  // Audio can only start from a gesture; any tap on the menu counts.
  const unlock = () => { void audio.unlock().then(() => audio.setMood('menu')); };
  s.root.addEventListener('pointerdown', unlock, { once: true });

  // A cloud conflict detected during boot is surfaced here, where the player
  // has the context to answer it.
  const conflict = app.takeCloudConflict();
  if (conflict) mountCloudConflict(ctx, conflict);

  return () => {
    s.root.removeEventListener('pointerdown', unlock);
    s.root.remove();
  };
}

/** Explains exactly what continuing does before it does it. */
function mountResumeDialog(ctx: AppContext, run: NonNullable<ReturnType<AppContext['save']['get']>['activeRun']>): void {
  const { app, ui } = ctx;
  const card = el('div', { class: 'card', style: 'max-width:min(430px,92vw);margin:auto' },
    el('h2', { text: t('resumeFound') }),
    el('p', {
      class: 'muted',
      text: t('resumeExplain', { wave: run.waveIndex + 1 }),
      style: 'font-size:14px;line-height:1.45;margin:0 0 14px',
    }),
    el('div', { class: 'row', style: 'gap:8px' },
      button(t('resumeDiscard'), () => { wrap.remove(); app.abandonRun(); app.show('contracts'); }, { class: 'ghost' }),
      button(t('resumeStart'), () => { wrap.remove(); app.resumeRun(run); }, { class: 'primary' }),
    ),
  );
  const wrap = el('div', {
    class: 'screen overlay',
    style: 'z-index:80;justify-content:center;align-items:center',
  }, card);
  ui.append(wrap);
}
