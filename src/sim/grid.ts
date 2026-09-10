import {
  ALL_GEAR, isModule, isWeapon, MODULES, STAT_CAPS, WEAPONS,
  type GearId, type ModuleId, type StatKey, type WeaponId,
} from '../config/gear';

/**
 * The 2x3 equipment panel.
 *
 *   cell 0 | cell 1
 *   cell 2 | cell 3
 *   cell 4 | cell 5
 *
 * Adjacency is orthogonal only — cell 0 touches 1 and 2, never 3.
 */
export const GRID_COLS = 2;
export const GRID_ROWS = 3;
export const GRID_CELLS = GRID_COLS * GRID_ROWS;

export type Slots = (GearId | null)[];

export const emptySlots = (): Slots => new Array(GRID_CELLS).fill(null);

/** Orthogonal neighbours of a cell index, precomputed. */
export const NEIGHBOURS: readonly (readonly number[])[] = (() => {
  const out: number[][] = [];
  for (let i = 0; i < GRID_CELLS; i++) {
    const col = i % GRID_COLS, row = (i / GRID_COLS) | 0;
    const n: number[] = [];
    if (col > 0) n.push(i - 1);
    if (col < GRID_COLS - 1) n.push(i + 1);
    if (row > 0) n.push(i - GRID_COLS);
    if (row < GRID_ROWS - 1) n.push(i + GRID_COLS);
    out.push(n);
  }
  return out;
})();

/** Resolved multipliers/addends for one installed weapon. */
export interface ResolvedStats {
  damage: number;
  fireRate: number;
  range: number;
  projectiles: number;
  heatGain: number;
  cooling: number;
  chain: number;
  knockback: number;
  armorPierce: number;
  scrapBonus: number;
}

/** Which module in which cell contributed what — drives the UI explanation. */
export interface Contribution {
  fromCell: number;
  module: ModuleId;
  stat: StatKey;
  add?: number;
  mul?: number;
}

export interface ResolvedWeapon {
  cell: number;
  weapon: WeaponId;
  /** Stats with no neighbours attached. */
  bare: ResolvedStats;
  /** Stats after adjacency, after caps. */
  stats: ResolvedStats;
  contributions: Contribution[];
}

export interface ResolvedPlayerBonus {
  regen: number;
  pickupRadius: number;
  maxHp: number;
  moveSpeed: number;
}

export interface Resolution {
  weapons: ResolvedWeapon[];
  player: ResolvedPlayerBonus;
  /** Modules installed but touching no weapon — surfaced as a UI warning. */
  idleModules: number[];
  /** Combos (weapon+module adjacency pairs) currently active. */
  activePairs: { cell: number; weapon: WeaponId; module: ModuleId; moduleCell: number }[];
}

const NEUTRAL = (): ResolvedStats => ({
  damage: 1, fireRate: 1, range: 1, projectiles: 0, heatGain: 1,
  cooling: 1, chain: 0, knockback: 1, armorPierce: 0, scrapBonus: 0,
});

/*
 * Neutral values encode how each stat combines: multiplier stats start at 1 and
 * an `add: 0.25` reads as +25%; count stats (projectiles, chain, armorPierce,
 * scrapBonus) start at 0 and add literally. One code path covers both.
 */
function applyCap(stat: StatKey, value: number): number {
  const cap = STAT_CAPS[stat];
  if (!cap) return value;
  if (cap.min !== undefined && value < cap.min) return cap.min;
  if (cap.max !== undefined && value > cap.max) return cap.max;
  return value;
}

/**
 * Resolve the whole panel in ONE pass.
 *
 * Modules read only from the static catalogue and write only to weapons, so no
 * module can ever observe another module's output. Calling this twice with the
 * same slots returns the same numbers, and calling it once is enough — there is
 * no iteration to converge.
 */
export function resolveGrid(slots: Slots): Resolution {
  const weapons: ResolvedWeapon[] = [];
  const player: ResolvedPlayerBonus = { regen: 0, pickupRadius: 0, maxHp: 0, moveSpeed: 0 };
  const idleModules: number[] = [];
  const activePairs: Resolution['activePairs'] = [];

  // Pass A: module self-effects (independent of layout).
  for (let cell = 0; cell < GRID_CELLS; cell++) {
    const id = slots[cell];
    if (!id || !isModule(id)) continue;
    const self = MODULES[id].self;
    if (!self) continue;
    player.regen += self.regen ?? 0;
    player.pickupRadius += self.pickupRadius ?? 0;
    player.maxHp += self.maxHp ?? 0;
    player.moveSpeed += self.moveSpeed ?? 0;
  }

  // Pass B: for each weapon, gather its neighbouring modules.
  for (let cell = 0; cell < GRID_CELLS; cell++) {
    const id = slots[cell];
    if (!id || !isWeapon(id)) continue;

    const bare = NEUTRAL();
    const stats = NEUTRAL();
    const contributions: Contribution[] = [];

    for (const n of NEIGHBOURS[cell]) {
      const nid = slots[n];
      if (!nid || !isModule(nid)) continue; // modules never boost modules
      const def = MODULES[nid];
      activePairs.push({ cell, weapon: id, module: nid, moduleCell: n });
      for (const [rawStat, effect] of Object.entries(def.neighbour)) {
        const stat = rawStat as StatKey;
        if (effect.add !== undefined) {
          stats[stat] += effect.add;
          contributions.push({ fromCell: n, module: nid, stat, add: effect.add });
        }
        if (effect.mul !== undefined) {
          stats[stat] *= effect.mul;
          contributions.push({ fromCell: n, module: nid, stat, mul: effect.mul });
        }
      }
    }

    for (const key of Object.keys(stats) as StatKey[]) {
      stats[key] = applyCap(key, stats[key]);
    }

    weapons.push({ cell, weapon: id, bare, stats, contributions });
  }

  // Pass C: modules that touch no weapon do nothing except their self-effect.
  for (let cell = 0; cell < GRID_CELLS; cell++) {
    const id = slots[cell];
    if (!id || !isModule(id)) continue;
    const touchesWeapon = NEIGHBOURS[cell].some((n) => {
      const nid = slots[n];
      return !!nid && isWeapon(nid);
    });
    const hasNeighbourEffect = Object.keys(MODULES[id].neighbour).length > 0;
    if (!touchesWeapon && hasNeighbourEffect) idleModules.push(cell);
  }

  return { weapons, player, idleModules, activePairs };
}

/** Concrete per-activation numbers for one weapon, after adjacency. */
export interface WeaponRuntime {
  cell: number;
  id: WeaponId;
  damage: number;
  cooldown: number;
  range: number;
  projectiles: number;
  projectileSpeed: number;
  heatGain: number;
  cooling: number;
  chain: number;
  knockback: number;
  armorPierce: number;
  scrapBonus: number;
  area: number;
  shards: number;
  hitCooldown: number;
  sweep: number;
}

/** Turn a resolved weapon into the numbers the simulation actually uses. */
export function weaponRuntime(rw: ResolvedWeapon, globalDamage = 1): WeaponRuntime {
  const def = WEAPONS[rw.weapon];
  const b = def.base;
  const s = rw.stats;
  return {
    cell: rw.cell,
    id: rw.weapon,
    damage: b.damage * s.damage * globalDamage,
    cooldown: b.cooldown / s.fireRate,
    range: b.range * s.range,
    projectiles: b.projectiles + s.projectiles,
    projectileSpeed: b.projectileSpeed,
    heatGain: b.heatGain * s.heatGain,
    cooling: s.cooling,
    chain: b.chain + s.chain,
    knockback: b.knockback * s.knockback,
    armorPierce: b.armorPierce + s.armorPierce,
    scrapBonus: s.scrapBonus,
    area: b.area ?? 0,
    shards: b.shards ?? 0,
    hitCooldown: b.hitCooldown ?? 0,
    sweep: b.sweep ?? 0,
  };
}

/**
 * What would change if `gear` were placed in `cell`. Powers the before/after
 * comparison shown while the player is choosing where to put something.
 */
export interface PreviewDiff {
  weapon: WeaponId;
  cell: number;
  changes: { stat: StatKey; before: number; after: number }[];
}

export function previewPlacement(slots: Slots, cell: number, gear: GearId | null): PreviewDiff[] {
  const before = resolveGrid(slots);
  const trial = slots.slice();
  trial[cell] = gear;
  const after = resolveGrid(trial);

  const beforeByCell = new Map(before.weapons.map((w) => [w.cell, w]));
  const diffs: PreviewDiff[] = [];

  for (const aw of after.weapons) {
    const bw = beforeByCell.get(aw.cell);
    const changes: PreviewDiff['changes'] = [];
    for (const key of Object.keys(aw.stats) as StatKey[]) {
      const b = bw ? bw.stats[key] : NEUTRAL()[key];
      if (Math.abs(b - aw.stats[key]) > 1e-6) {
        changes.push({ stat: key, before: b, after: aw.stats[key] });
      }
    }
    if (changes.length) diffs.push({ weapon: aw.weapon, cell: aw.cell, changes });
  }
  return diffs;
}

/**
 * Place gear into a cell. If the cell is occupied the occupant comes back to
 * the caller, which is what the UI turns into a visible swap. Nothing is ever
 * destroyed here, so cancelling a placement cannot lose an item.
 */
export function placeGear(slots: Slots, cell: number, gear: GearId): { slots: Slots; displaced: GearId | null } {
  const next = slots.slice();
  const displaced = next[cell];
  next[cell] = gear;
  return { slots: next, displaced };
}

/** Swap the contents of two cells; either may be empty. */
export function swapCells(slots: Slots, a: number, b: number): Slots {
  const next = slots.slice();
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

export const firstEmptyCell = (slots: Slots): number => slots.findIndex((s) => s === null);

export const gearName = (id: GearId): string => ALL_GEAR[id].id;
