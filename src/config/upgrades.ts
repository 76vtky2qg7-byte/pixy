/**
 * Permanent workshop upgrades, bought with Credits between contracts.
 *
 * Every line is capped at a small number of levels and the totals are modest on
 * purpose: fully upgraded, these add roughly a third to survivability and a
 * fifth to damage. They shorten the gap between a first attempt and a first
 * clear; they do not replace choosing gear well.
 */
export type UpgradeId =
  | 'hull' | 'servos' | 'welder' | 'grapple'
  | 'fence' | 'calibration' | 'jumpstart' | 'backup';

export interface UpgradeDef {
  id: UpgradeId;
  maxLevel: number;
  /** Credit cost of each level, index 0 = first level. */
  costs: number[];
  /** Value added per level; meaning depends on the id. */
  step: number;
}

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  hull:        { id: 'hull',        maxLevel: 5, costs: [30, 55, 90, 140, 210], step: 9 },     // +max HP
  servos:      { id: 'servos',      maxLevel: 4, costs: [35, 65, 110, 175],     step: 0.04 },  // +move speed
  welder:      { id: 'welder',      maxLevel: 3, costs: [50, 100, 180],         step: 0.18 },  // +HP/sec
  grapple:     { id: 'grapple',     maxLevel: 4, costs: [25, 45, 75, 120],      step: 0.13 },  // +pickup radius
  fence:       { id: 'fence',       maxLevel: 4, costs: [40, 75, 125, 195],     step: 0.08 },  // +scrap gained
  calibration: { id: 'calibration', maxLevel: 5, costs: [45, 80, 130, 200, 290], step: 0.04 }, // +weapon damage
  jumpstart:   { id: 'jumpstart',   maxLevel: 3, costs: [30, 60, 105],          step: 12 },    // +starting scrap
  backup:      { id: 'backup',      maxLevel: 1, costs: [320],                  step: 1 },     // one revive per contract
};

export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];

export type UpgradeLevels = Partial<Record<UpgradeId, number>>;

export const levelOf = (levels: UpgradeLevels, id: UpgradeId): number =>
  Math.min(levels[id] ?? 0, UPGRADES[id].maxLevel);

/** Cost of the NEXT level, or null when the line is maxed. */
export function nextCost(levels: UpgradeLevels, id: UpgradeId): number | null {
  const lvl = levelOf(levels, id);
  const def = UPGRADES[id];
  return lvl >= def.maxLevel ? null : def.costs[lvl];
}

/** Aggregate every purchased upgrade into the bonuses the simulation reads. */
export interface WorkshopBonuses {
  maxHp: number;
  moveSpeed: number;      // multiplier
  regen: number;
  pickupRadius: number;   // multiplier
  scrapGain: number;      // multiplier
  damage: number;         // multiplier
  startingScrap: number;
  revives: number;
}

export function workshopBonuses(levels: UpgradeLevels): WorkshopBonuses {
  return {
    maxHp: levelOf(levels, 'hull') * UPGRADES.hull.step,
    moveSpeed: 1 + levelOf(levels, 'servos') * UPGRADES.servos.step,
    regen: levelOf(levels, 'welder') * UPGRADES.welder.step,
    pickupRadius: 1 + levelOf(levels, 'grapple') * UPGRADES.grapple.step,
    scrapGain: 1 + levelOf(levels, 'fence') * UPGRADES.fence.step,
    damage: 1 + levelOf(levels, 'calibration') * UPGRADES.calibration.step,
    startingScrap: levelOf(levels, 'jumpstart') * UPGRADES.jumpstart.step,
    revives: levelOf(levels, 'backup'),
  };
}
