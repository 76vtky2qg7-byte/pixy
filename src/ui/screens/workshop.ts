import { audio } from '../../audio/audio';
import {
  levelOf, nextCost, UPGRADES, UPGRADE_IDS, workshopBonuses, type UpgradeId,
} from '../../config/upgrades';
import { analytics } from '../../platform/analytics';
import type { AppContext } from '../app';
import { button, currency, el, screen, toast } from '../dom';
import { t, tk } from '../i18n';
import { mountPurchases } from './purchases';

/** Permanent upgrades. Every line is capped, and the cap is always visible. */
export function mountWorkshop(ctx: AppContext): () => void {
  const { app, save, ui } = ctx;

  const creditPill = el('span', { class: 'pill arc' });
  const s = screen({
    title: t('workshopTitle'),
    onBack: () => app.show('menu'),
    headExtra: [creditPill],
  });

  const list = el('div', { class: 'col' });
  const summary = el('div', { class: 'card' });
  const purchaseBox = el('div', { class: 'col' });

  function render(): void {
    const d = save.get();
    creditPill.replaceChildren(currency('credit'), document.createTextNode(String(d.progress.credits)));

    list.replaceChildren();
    for (const id of UPGRADE_IDS) {
      const def = UPGRADES[id];
      const lvl = levelOf(d.progress.upgrades, id);
      const cost = nextCost(d.progress.upgrades, id);
      const maxed = cost === null;
      const affordable = !maxed && d.progress.credits >= cost;

      const pips = el('div', { class: 'row', style: 'gap:3px' });
      for (let i = 0; i < def.maxLevel; i++) {
        pips.append(el('i', {
          style: `width:14px;height:8px;border-radius:2px;background:${i < lvl ? 'var(--amber)' : 'var(--line-soft)'}`,
        }));
      }

      list.append(el('div', { class: 'card' },
        el('div', { class: 'row' },
          el('div', { style: 'flex:1;min-width:0' },
            el('div', { text: tk('up', id) }),
            el('div', { class: 'muted tiny', text: tk('up', `${id}_desc`) }),
            el('div', { class: 'row', style: 'margin-top:5px;gap:8px' },
              pips,
              el('span', { class: 'muted tiny', text: `${lvl}/${def.maxLevel}` }),
            ),
          ),
          maxed
            ? el('span', { class: 'pill tiny', text: t('maxLevel') })
            : button(
                el('span', { class: 'price' }, currency('credit'), String(cost)),
                () => buy(id, cost),
                { class: affordable ? 'primary sm' : 'sm', disabled: !affordable },
              ),
        ),
      ));
    }

    // What the purchased upgrades actually add, so the wallet has a purpose the
    // player can see rather than a number that only goes up.
    const b = workshopBonuses(d.progress.upgrades);
    summary.replaceChildren(
      el('h3', { text: t('workshopHint') }),
      stat(t('up_hull'), `+${Math.round(b.maxHp)}`),
      stat(t('up_servos'), `${Math.round((b.moveSpeed - 1) * 100)}%`),
      stat(t('up_calibration'), `${Math.round((b.damage - 1) * 100)}%`),
      stat(t('up_fence'), `${Math.round((b.scrapGain - 1) * 100)}%`),
    );

    purchaseBox.replaceChildren();
    mountPurchases(ctx, purchaseBox);
  }

  function buy(id: UpgradeId, cost: number): void {
    const before = save.get();
    if (before.progress.credits < cost) { audio.play('deny'); toast(t('notEnoughScrap')); return; }
    let applied = false;
    save.update((d) => {
      // Re-read inside the write: two taps in the same frame must not both buy.
      const lvl = levelOf(d.progress.upgrades, id);
      const price = nextCost(d.progress.upgrades, id);
      if (price === null || d.progress.credits < price) return;
      d.progress.credits -= price;
      d.progress.upgrades[id] = lvl + 1;
      applied = true;
    });
    if (!applied) { audio.play('deny'); return; }
    audio.play('buy');
    analytics.track({
      name: 'upgrade_purchased', upgrade: id,
      level: levelOf(save.get().progress.upgrades, id), cost,
    });
    render();
  }

  s.body.append(el('div', { class: 'two-col' },
    el('div', { class: 'col' }, summary, purchaseBox),
    list,
  ));
  ui.append(s.root);
  render();

  const off = save.events.on('changed', () => render());
  return () => { off(); s.root.remove(); };
}

function stat(label: string, value: string): HTMLElement {
  return el('div', { class: 'tally' }, el('span', { text: label }), el('span', { text: value }));
}
