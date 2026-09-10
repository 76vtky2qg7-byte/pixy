import { audio } from '../../audio/audio';
import { ALL_GEAR, isModule, type GearId } from '../../config/gear';
import { SHOP } from '../../config/balance';
import type { AppContext } from '../app';
import {
  buyOffer, doReroll, isBossWave, offerPrice, rerollCost,
  sellCell, wavesTotal, type RunState,
} from '../../sim/run';
import { GRID_CELLS } from '../../sim/grid';
import { button, clear, currency, el, iconEl, screen, toast } from '../dom';
import { t, tk } from '../i18n';
import {
  activeCombos, diffElement, EquipmentPanel, hasNoWeapon, moduleEffectLine,
  type PreviewSummary,
} from '../panel';

/**
 * Preparation between waves: the shop, the equipment panel, and the explanation
 * of what the current layout does.
 *
 * Rearranging is free and unlimited here. Buying into a full panel asks which
 * cell to replace and shows the refund before committing, so no purchase can
 * silently destroy a part.
 */
export function mountPrep(ctx: AppContext): () => void {
  const { app, save, ui } = ctx;
  let run = app.run;
  if (!run) { app.show('menu'); return () => {}; }

  const boss = isBossWave(run);

  /** Set while a bought part is waiting for the player to choose a cell. */
  let awaitingCell: { offerIndex: number; gear: GearId } | null = null;

  const scrapPill = el('span', { class: 'pill amber' }, currency('scrap'), String(run.scrap));
  const s = screen({
    title: boss
      ? `${t('bossWave')} · ${t('nextWave')} ${run.waveIndex + 1}/${wavesTotal(run)}`
      : `${t('nextWave')} ${run.waveIndex + 1}/${wavesTotal(run)}`,
    onBack: () => app.quitToMenu(),
    headExtra: [scrapPill],
  });

  const offersBox = el('div', { class: 'offers' });
  const detailBox = el('div', { class: 'card', style: 'min-height:78px' });
  const comboBox = el('div', { class: 'col' });
  const hintBox = el('div', { class: 'muted tiny', style: 'text-align:center;min-height:18px' });

  const panel = new EquipmentPanel(run.slots, {
    onChange: (next) => {
      run = { ...run!, slots: next };
      app.run = run;
      save.update((d) => { d.activeRun = run; });
      audio.play('place');
      refresh();
    },
    onPreview: (diff) => renderDetail(diff),
    onSelect: () => audio.play('select'),
    onPendingPlace: (cell) => completePendingPurchase(cell),
  });

  /* ---------------- shop ---------------- */

  function renderOffers(): void {
    clear(offersBox);
    for (let i = 0; i < run!.offers.length; i++) {
      const offer = run!.offers[i];
      const def = ALL_GEAR[offer.gear];
      const price = offerPrice(run!, offer.gear);
      const affordable = run!.scrap >= price;

      const card = el('div', { class: `card offer ${offer.sold ? 'sold' : ''}`.trim() });
      const meta = el('div', { class: 'meta' },
        el('div', { class: 'name', text: tk('gear', offer.gear) }),
        el('div', { class: 'desc', text: tk('gear', `${offer.gear}_desc`) }),
      );
      if (isModule(offer.gear)) {
        meta.append(el('div', { class: 'tiny', style: 'color:var(--arc);margin-top:3px', text: moduleEffectLine(offer.gear) }));
      }

      const buyRow = el('div', { class: 'row', style: 'margin-top:6px;gap:6px' });
      if (offer.sold) {
        buyRow.append(el('span', { class: 'muted tiny', text: t('sold') }));
      } else {
        buyRow.append(
          el('span', { class: `price ${affordable ? '' : 'cant'}`.trim() }, currency('scrap'), String(price)),
          button(t('buy'), () => attemptBuy(i), { class: 'primary sm', disabled: !affordable }),
        );
      }
      meta.append(buyRow);

      card.append(iconEl(def.icon), meta);
      // Hovering or tapping the card previews where it would go.
      card.addEventListener('pointerenter', () => previewGear(offer.gear));
      card.addEventListener('pointerleave', () => renderDetail(null));
      offersBox.append(card);
    }
  }

  /**
   * Buy flow.
   *
   * With a free cell the purchase completes immediately. With a full panel we
   * enter "choose a cell" mode: nothing is spent, nothing is placed, and
   * cancelling returns the player exactly where they were.
   */
  function attemptBuy(index: number): void {
    const res = buyOffer(run!, index);
    if (res.ok) {
      run = res.run;
      app.run = run;
      panel.setSlots(run.slots);
      save.update((d) => { d.activeRun = run; });
      audio.play('buy');
      app.tutorial.trigger('adjacency');
      refresh();
      return;
    }

    switch (res.reason) {
      case 'no_money':
        audio.play('deny');
        toast(t('notEnoughScrap'));
        break;
      case 'already_sold':
        // A second tap landing after the first already succeeded. Silent.
        break;
      case 'no_space':
        awaitingCell = { offerIndex: index, gear: run!.offers[index].gear };
        panel.setPendingGear(awaitingCell.gear);
        toast(t('panelFull'));
        refresh();
        break;
      default:
        audio.play('deny');
    }
  }

  /**
   * Finish a purchase that was waiting on a destination cell. The whole thing
   * — spend, install, refund the displaced part, mark the offer sold — is one
   * call to buyOffer, so it cannot half-happen.
   */
  function completePendingPurchase(cell: number): void {
    const pending = awaitingCell;
    if (!pending) return;
    const res = buyOffer(run!, pending.offerIndex, cell);
    if (!res.ok) {
      audio.play('deny');
      toast(res.reason === 'no_money' ? t('notEnoughScrap') : t('cancel'));
      cancelPending();
      return;
    }
    awaitingCell = null;
    run = res.run;
    app.run = run;
    panel.setPendingGear(null);
    panel.setSlots(run.slots);
    save.update((d) => { d.activeRun = run; });
    audio.play('buy');
    if (res.displaced) {
      toast(`${tk('gear', res.displaced)} → ${currencyText(Math.floor(offerPrice(run, res.displaced) * SHOP.sellRefund))}`);
    }
    app.tutorial.trigger('adjacency');
    refresh();
  }

  const currencyText = (n: number) => `+${n} ${t('scrap')}`;

  /** Cancelling costs nothing and destroys nothing — the offer stays for sale. */
  function cancelPending(): void {
    awaitingCell = null;
    panel.setPendingGear(null);
    refresh();
  }

  function previewGear(gear: GearId): void {
    // Show what the part would do in the first empty cell, or cell 0.
    const target = run!.slots.findIndex((x) => x === null);
    renderDetail(panel.previewFor(target >= 0 ? target : 0, gear));
  }

  /* ---------------- explanation ---------------- */

  function renderDetail(diff: PreviewSummary | null): void {
    clear(detailBox);
    if (!diff) {
      detailBox.append(
        el('h3', { text: t('equipment') }),
        el('div', { class: 'muted tiny', text: t('tapToPlace') }),
      );
      return;
    }
    const label = diff.gear ? tk('gear', diff.gear) : t('emptyCell');
    detailBox.append(el('h3', { text: `${label} → ${t('chooseCell')} ${diff.cell + 1}` }));
    detailBox.append(diffElement(diff));
  }

  function renderCombos(): void {
    clear(comboBox);
    const combos = activeCombos(run!.slots);
    const active = combos.filter((c) => c.active);
    comboBox.append(el('h3', { text: `${t('combos')} ${active.length}/${combos.length}` }));
    const wrap = el('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px' });
    for (const c of combos) {
      wrap.append(el('span', {
        class: `pill tiny ${c.active ? 'amber' : ''}`.trim(),
        style: c.active ? '' : 'opacity:.45',
        text: tk('combo', c.id),
        title: c.active ? t('comboActive') : t('comboHint'),
      }));
    }
    comboBox.append(wrap);
  }

  /* ---------------- controls ---------------- */

  const rerollBtn = button('', () => {
    const cost = rerollCost(run!);
    if (run!.scrap < cost) { audio.play('deny'); toast(t('notEnoughScrap')); return; }
    run = doReroll(run!);
    app.run = run;
    save.update((d) => { d.activeRun = run; });
    audio.play('select');
    refresh();
  }, { class: 'sm' });

  const sellBtn = button(t('sell'), () => {
    const sel = panel.selectedCell ?? -1;
    if (sel < 0 || !run!.slots[sel]) { toast(t('tapToPlace')); return; }
    run = sellCell(run!, sel);
    app.run = run;
    panel.setSlots(run.slots);
    save.update((d) => { d.activeRun = run; });
    audio.play('buy');
    refresh();
  }, { class: 'ghost sm' });

  const cancelBtn = button(t('cancel'), () => cancelPending(), { class: 'ghost sm' });

  const startBtn = button(boss ? `${t('startWave')} · ${t('bossWave')}` : t('startWave'), () => {
    if (hasNoWeapon(run!.slots)) { audio.play('deny'); toast(t('weapons')); return; }
    app.startWave();
  }, { class: 'primary wide' });

  /* ---------------- assembly ---------------- */

  function refresh(): void {
    scrapPill.replaceChildren(currency('scrap'), document.createTextNode(String(run!.scrap)));
    const cost = rerollCost(run!);
    rerollBtn.textContent = cost === 0 ? t('rerollFree') : `${t('reroll')} · ${cost}`;
    rerollBtn.disabled = run!.scrap < cost;
    cancelBtn.style.display = awaitingCell ? '' : 'none';
    sellBtn.style.display = awaitingCell ? 'none' : '';
    hintBox.textContent = awaitingCell
      ? t('panelFull')
      : run!.slots.some((x) => x === null) ? t('tapToPlace') : t('swapHint');
    renderOffers();
    renderCombos();
    panel.render();
    requestAnimationFrame(() => panel.relayout());
  }

  const left = el('div', { class: 'col' },
    el('h3', { text: t('equipment') }),
    panel.root,
    hintBox,
    el('div', { class: 'row', style: 'justify-content:center;gap:6px' }, sellBtn, cancelBtn),
    comboBox,
    detailBox,
  );
  const right = el('div', { class: 'col' },
    el('div', { class: 'row' },
      el('h3', { text: t('shop'), style: 'flex:1;margin:0' }),
      rerollBtn,
    ),
    offersBox,
  );

  s.body.append(el('div', { class: 'two-col' }, left, right));
  s.foot.append(startBtn);
  ui.append(s.root);

  renderDetail(null);
  refresh();
  app.tutorial.trigger('shop');

  const onResize = () => panel.relayout();
  window.addEventListener('resize', onResize);
  void GRID_CELLS;
  void SHOP;

  return () => {
    window.removeEventListener('resize', onResize);
    s.root.remove();
  };
}

/** Exposed for the tests: what a run looks like after a purchase. */
export type { RunState };
