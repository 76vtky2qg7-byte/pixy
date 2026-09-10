import {
  ALL_GEAR, COMBOS, isModule, isWeapon, MODULES,
  type GearId, type ModuleId, type StatKey, type WeaponId,
} from '../config/gear';
import { round } from '../core/math';
import {
  GRID_COLS, GRID_ROWS, NEIGHBOURS, previewPlacement, resolveGrid, swapCells,
  type Slots,
} from '../sim/grid';
import { cellIconEl, el } from './dom';
import { t, tk, type StringKey } from './i18n';

/**
 * The 2x3 equipment panel.
 *
 * Its whole job is making the adjacency rule visible:
 *  - a weapon and the module feeding it are highlighted together, so the rule
 *    reads as a link between two cells rather than a property of one;
 *  - short bars are drawn in the gaps between linked cells, which shows that
 *    only side-by-side counts and diagonals do not;
 *  - a module touching no weapon is flagged, because "it does nothing here" is
 *    otherwise invisible;
 *  - selecting a part previews the exact before/after numbers for every cell.
 *
 * Interaction is tap-a-part-then-tap-a-cell, which works with one thumb.
 * Dragging is offered as an alternative, never as the only way.
 */
export interface PanelCallbacks {
  onChange(next: Slots): void;
  onSelect?(cell: number | null): void;
  onSell?(cell: number): void;
  /** Announce the diff so a host screen can render it beside the panel. */
  onPreview?(diff: PreviewSummary | null): void;
  /**
   * A cell was chosen while a part from the shop was pending. The panel does
   * NOT place it: the host owns that transaction, because installing a bought
   * part also moves currency and may refund whatever it displaces, and those
   * must succeed or fail together.
   */
  onPendingPlace?(cell: number): void;
}

export interface PreviewSummary {
  cell: number;
  gear: GearId | null;
  rows: { weapon: WeaponId; stat: StatKey; before: number; after: number }[];
}

const STAT_ORDER: StatKey[] = [
  'damage', 'fireRate', 'range', 'projectiles',
  'chain', 'armorPierce', 'heatGain', 'cooling', 'knockback', 'scrapBonus',
];

export class EquipmentPanel {
  readonly root: HTMLElement;
  private gridEl: HTMLElement;
  private cells: HTMLElement[] = [];
  private links: HTMLElement[] = [];
  private slots: Slots;
  private selected: number | null = null;
  private cb: PanelCallbacks;
  private interactive = true;
  /** Set while a part from the shop is waiting for a destination cell. */
  private pendingGear: GearId | null = null;

  constructor(slots: Slots, cb: PanelCallbacks) {
    this.slots = slots.slice();
    this.cb = cb;
    this.gridEl = el('div', { class: 'grid' });
    this.root = el('div', { class: 'panel-wrap', style: 'position:relative' }, this.gridEl);

    for (let i = 0; i < GRID_COLS * GRID_ROWS; i++) {
      const cell = el('div', {
        class: 'cell',
        role: 'button',
        tabindex: '0',
        'aria-label': `${t('emptyCell')} ${i + 1}`,
      });
      cell.addEventListener('click', () => this.tapCell(i));
      cell.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
          e.preventDefault();
          this.tapCell(i);
        }
      });
      this.enableDrag(cell, i);
      this.cells.push(cell);
      this.gridEl.append(cell);
    }
    this.render();
  }

  setSlots(slots: Slots): void {
    this.slots = slots.slice();
    this.render();
  }

  setInteractive(on: boolean): void {
    this.interactive = on;
    this.render();
  }

  /** Called by the shop: the next cell tap chooses a home for this part. */
  setPendingGear(gear: GearId | null): void {
    this.pendingGear = gear;
    this.selected = null;
    this.render();
  }

  /** Index of the cell the player currently has selected, if any. */
  get selectedCell(): number | null {
    return this.selected;
  }

  get pending(): GearId | null {
    return this.pendingGear;
  }

  get value(): Slots {
    return this.slots.slice();
  }

  /* ---------------- interaction ---------------- */

  private tapCell(index: number): void {
    if (!this.interactive) return;

    // A part is waiting to be installed: this tap only chooses where. The host
    // performs the purchase and calls setSlots() with the result.
    if (this.pendingGear) {
      this.cb.onPendingPlace?.(index);
      return;
    }

    if (this.selected === null) {
      if (!this.slots[index]) return;   // nothing to pick up from an empty cell
      this.selected = index;
      this.cb.onSelect?.(index);
      this.cb.onPreview?.(this.previewFor(index, this.slots[index]));
      this.render();
      return;
    }

    if (this.selected === index) {
      this.selected = null;
      this.cb.onSelect?.(null);
      this.cb.onPreview?.(null);
      this.render();
      return;
    }

    // Second tap on a different cell: swap. Both parts are kept — an occupied
    // destination trades places rather than destroying anything.
    const next = swapCells(this.slots, this.selected, index);
    this.slots = next;
    this.selected = null;
    this.cb.onSelect?.(null);
    this.cb.onPreview?.(null);
    this.cb.onChange(next);
    this.render();
  }

  /** Dragging is an alternative to tapping, offered on pointer devices. */
  private enableDrag(cell: HTMLElement, index: number): void {
    cell.draggable = false;
    let startX = 0, startY = 0, dragging = false, id = -1;

    cell.addEventListener('pointerdown', (e) => {
      if (!this.interactive || this.pendingGear) return;
      if (!this.slots[index]) return;
      id = e.pointerId;
      startX = e.clientX; startY = e.clientY; dragging = false;
    });

    cell.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      if (!dragging && Math.hypot(e.clientX - startX, e.clientY - startY) > 12) {
        dragging = true;
        this.selected = index;
        this.render();
      }
    });

    const finish = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = -1;
      if (!dragging) return;
      dragging = false;
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.cell');
      const target = over ? this.cells.indexOf(over as HTMLElement) : -1;
      if (target >= 0 && target !== index) {
        const next = swapCells(this.slots, index, target);
        this.slots = next;
        this.selected = null;
        this.cb.onChange(next);
      } else {
        // Dropped nowhere useful: the part goes back where it was. A cancelled
        // drag must never lose an item.
        this.selected = null;
      }
      this.render();
    };
    cell.addEventListener('pointerup', finish);
    // A cancelled drag is a cancel, not a drop into the void.
    cell.addEventListener('pointercancel', (e) => {
      if (e.pointerId !== id) return;
      id = -1; dragging = false;
      this.selected = null;
      this.render();
    });
  }

  previewFor(cell: number, gear: GearId | null): PreviewSummary {
    const diffs = previewPlacement(this.slots, cell, gear);
    const rows: PreviewSummary['rows'] = [];
    for (const d of diffs) {
      for (const c of d.changes) rows.push({ weapon: d.weapon, stat: c.stat, before: c.before, after: c.after });
    }
    rows.sort((a, b) => STAT_ORDER.indexOf(a.stat) - STAT_ORDER.indexOf(b.stat));
    return { cell, gear, rows };
  }

  /* ---------------- rendering ---------------- */

  render(): void {
    const res = resolveGrid(this.slots);
    const linked = new Set<number>();
    for (const p of res.activePairs) { linked.add(p.cell); linked.add(p.moduleCell); }
    const idle = new Set(res.idleModules);

    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i];
      const gear = this.slots[i];
      cell.replaceChildren();
      cell.className = 'cell';

      if (gear) {
        cell.classList.add('filled', isWeapon(gear) ? 'weapon' : 'module');
        cell.append(cellIconEl(ALL_GEAR[gear].icon));
        cell.setAttribute('aria-label', `${tk('gear', gear)} — ${t('equipment')} ${i + 1}`);
        cell.title = `${tk('gear', gear)}\n${tk('gear', `${gear}_desc`)}`;
      } else {
        cell.setAttribute('aria-label', `${t('emptyCell')} ${i + 1}`);
        cell.title = t('emptyCell');
      }

      if (linked.has(i)) cell.classList.add('linked');
      if (idle.has(i)) {
        cell.classList.add('idle');
        cell.title += `\n${t('idleModule')}`;
      }
      if (this.selected === i) cell.classList.add('sel');
      // While a part waits for a home, every cell is a valid destination.
      if (this.pendingGear) cell.classList.add('target');
    }

    this.drawLinks(res.activePairs);
  }

  /**
   * Draw a short bar in the gap between each linked pair. Because the bars only
   * ever appear in the 8px gutters between side-by-side cells, the picture
   * itself says diagonals are not connections.
   */
  private drawLinks(pairs: { cell: number; moduleCell: number }[]): void {
    for (const l of this.links) l.remove();
    this.links.length = 0;
    if (!this.cells[0]) return;

    const seen = new Set<string>();
    // Bars are appended to `root`, which is the positioned ancestor, so their
    // offsets must be measured against it — not against the grid, which is
    // narrower and centred inside it.
    const rootRect = this.root.getBoundingClientRect();
    if (rootRect.width === 0) return;   // not laid out yet

    for (const p of pairs) {
      const a = Math.min(p.cell, p.moduleCell), b = Math.max(p.cell, p.moduleCell);
      const key = `${a}-${b}`;
      if (seen.has(key)) continue;
      if (!NEIGHBOURS[a].includes(b)) continue;
      seen.add(key);

      const ra = this.cells[a].getBoundingClientRect();
      const rb = this.cells[b].getBoundingClientRect();
      const horizontal = Math.abs(ra.top - rb.top) < 2;
      const bar = el('i', { class: 'link' });
      if (horizontal) {
        bar.style.left = `${ra.right - rootRect.left}px`;
        bar.style.top = `${ra.top + ra.height / 2 - rootRect.top - 3}px`;
        bar.style.width = `${Math.max(3, rb.left - ra.right)}px`;
        bar.style.height = '6px';
      } else {
        bar.style.left = `${ra.left + ra.width / 2 - rootRect.left - 3}px`;
        bar.style.top = `${ra.bottom - rootRect.top}px`;
        bar.style.height = `${Math.max(3, rb.top - ra.bottom)}px`;
        bar.style.width = '6px';
      }
      this.links.push(bar);
      this.root.append(bar);
    }
  }

  /** Re-measure link positions after a resize or a layout change. */
  relayout(): void {
    this.drawLinks(resolveGrid(this.slots).activePairs);
  }
}

/* -------------------------------------------------------------------- */
/* explanation helpers shared by the shop and the prep screen            */
/* -------------------------------------------------------------------- */

/** Format a stat value the way the player reads it: percentages or counts. */
export function formatStat(stat: StatKey, value: number): string {
  switch (stat) {
    case 'projectiles':
    case 'chain':
    case 'armorPierce':
      return value > 0 ? `+${round(value, 0)}` : String(round(value, 0));
    case 'scrapBonus':
      return `+${Math.round(value * 100)}%`;
    default: {
      const pct = Math.round((value - 1) * 100);
      return pct === 0 ? '—' : `${pct > 0 ? '+' : ''}${pct}%`;
    }
  }
}

/** Higher is better for most stats; heat is the exception. */
export const statIsGood = (stat: StatKey, before: number, after: number): boolean =>
  stat === 'heatGain' ? after < before : after > before;

/** Build the before/after block shown under a selected part. */
export function diffElement(summary: PreviewSummary): HTMLElement {
  const box = el('div', { class: 'diff' });
  if (!summary.rows.length) {
    box.append(el('div', { class: 'muted tiny', text: t('idleModule') }));
    return box;
  }
  for (const r of summary.rows) {
    const good = statIsGood(r.stat, r.before, r.after);
    box.append(el('div', { class: 'diff-row' },
      el('span', { class: 'muted', text: `${tk('gear', r.weapon)} · ${t(`stat_${r.stat}` as StringKey)}` }),
      el('span', {},
        el('span', { class: 'arrow', text: formatStat(r.stat, r.before) }),
        el('span', { class: 'arrow', text: ' → ' }),
        el('span', { class: good ? 'up' : 'down', text: formatStat(r.stat, r.after) }),
      ),
    ));
  }
  return box;
}

/** One-line description of what a module does to its neighbours. */
export function moduleEffectLine(id: ModuleId): string {
  const def = MODULES[id];
  const parts: string[] = [];
  for (const [stat, effect] of Object.entries(def.neighbour)) {
    const key = stat as StatKey;
    const label = t(`stat_${key}` as StringKey);
    if (effect.add !== undefined) {
      parts.push(`${label} ${formatStat(key, key === 'projectiles' || key === 'chain' || key === 'armorPierce' || key === 'scrapBonus' ? effect.add : 1 + effect.add)}`);
    }
    if (effect.mul !== undefined) parts.push(`${label} ${formatStat(key, effect.mul)}`);
  }
  return parts.join(', ');
}

/** Which named combinations the current panel has running. */
export function activeCombos(slots: Slots): { id: string; active: boolean }[] {
  const res = resolveGrid(slots);
  const pairSet = new Set(res.activePairs.map((p) => `${p.weapon}+${p.module}`));
  return COMBOS.map((c) => ({ id: c.id, active: pairSet.has(`${c.weapon}+${c.module}`) }));
}

/** True when the panel holds no weapon at all — worth warning about. */
export const hasNoWeapon = (slots: Slots): boolean =>
  !slots.some((s) => !!s && isWeapon(s));

export const countModules = (slots: Slots): number =>
  slots.filter((s) => !!s && isModule(s)).length;
