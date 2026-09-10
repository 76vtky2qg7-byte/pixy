import type { AppContext } from '../app';
import type { SaveData } from '../../save/schema';
import { button, el } from '../dom';
import { setLang, t } from '../i18n';

/**
 * Local-vs-cloud conflict.
 *
 * Shown only when neither side strictly dominates, and it states what each side
 * actually holds so the choice is informed. Nothing is merged and nothing is
 * summed: the player picks one snapshot.
 */
export function mountCloudConflict(ctx: AppContext, cloud: SaveData): void {
  const { app, save, ui } = ctx;
  const local = save.get();

  const describe = (d: SaveData, label: string) => el('div', { class: 'card', style: 'flex:1;min-width:0' },
    el('h3', { text: label }),
    el('div', { class: 'tally' }, el('span', { text: t('credits') }), el('span', { text: String(d.progress.credits) })),
    el('div', { class: 'tally' }, el('span', { text: t('lifetimeRuns') }), el('span', { text: String(d.progress.totalRuns) })),
    el('div', { class: 'tally' }, el('span', { text: t('contracts') }), el('span', { text: String(d.progress.wonContracts.length) })),
    el('div', { class: 'tally' }, el('span', { text: t('lifetimeKills') }), el('span', { text: String(d.progress.totalKills) })),
  );

  const card = el('div', { class: 'card', style: 'max-width:min(520px,94vw);margin:auto' },
    el('h2', { text: t('cloudConflict') }),
    el('p', {
      class: 'muted',
      text: t('cloudConflictExplain'),
      style: 'font-size:14px;line-height:1.45;margin:0 0 12px',
    }),
    el('div', { class: 'row', style: 'align-items:stretch;gap:8px;margin-bottom:12px' },
      describe(local, t('cloudLocal')),
      describe(cloud, t('cloudCloud')),
    ),
    el('div', { class: 'row', style: 'gap:8px' },
      button(t('keepLocal'), () => { save.resolveConflict('local', cloud); done(); }, { class: 'wide' }),
      button(t('keepCloud'), () => {
        save.resolveConflict('cloud', cloud);
        setLang(save.get().settings.lang);
        done();
        app.show('menu');
      }, { class: 'primary wide' }),
    ),
  );

  const wrap = el('div', {
    class: 'screen overlay',
    style: 'z-index:85;justify-content:center;align-items:center',
  }, card);
  const done = () => wrap.remove();
  ui.append(wrap);
}
