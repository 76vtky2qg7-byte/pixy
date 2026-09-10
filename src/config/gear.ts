/**
 * Gear catalogue: six weapons, eight support modules.
 *
 * Support modules only ever affect ORTHOGONALLY adjacent cells, and they only
 * affect weapons — never other modules. That single restriction is what makes
 * the panel explainable in one sentence per module and makes an infinite
 * feedback loop structurally impossible: the effect graph is bipartite and
 * one level deep, so resolution is a single pass with no fixed point to chase.
 */

export type GearKind = 'weapon' | 'module';

/** Which weapon stat an adjacency effect moves. Used for the tooltip diff. */
export type StatKey =
  | 'damage'
  | 'fireRate'
  | 'range'
  | 'projectiles'
  | 'heatGain'
  | 'cooling'
  | 'chain'
  | 'knockback'
  | 'armorPierce'
  | 'scrapBonus';

export interface WeaponDef {
  id: WeaponId;
  kind: 'weapon';
  icon: number;              // frame index into assets/icons.png
  /** Behaviour selector — each value is a genuinely different firing pattern. */
  behaviour: 'bolt' | 'orbit' | 'chain' | 'mortar' | 'beam' | 'slam';
  price: number;
  base: {
    damage: number;
    /** Seconds between activations at 1x fire rate. */
    cooldown: number;
    range: number;
    projectiles: number;
    projectileSpeed: number;
    /** Heat added per activation (per second, for sustained weapons). */
    heatGain: number;
    /** Extra targets a hit jumps to. */
    chain: number;
    knockback: number;
    /** Flat armour ignored. */
    armorPierce: number;
    /** Weapon-specific numbers the behaviour reads. */
    area?: number;
    shards?: number;
    hitCooldown?: number;
    sweep?: number;
  };
}

export interface ModuleDef {
  id: ModuleId;
  kind: 'module';
  icon: number;
  price: number;
  /** Effects applied to each orthogonally adjacent WEAPON. */
  neighbour: Partial<Record<StatKey, { add?: number; mul?: number }>>;
  /** Effects applied to the player regardless of neighbours. */
  self?: { regen?: number; pickupRadius?: number; maxHp?: number; moveSpeed?: number };
}

export type WeaponId = 'riveter' | 'buzzsaw' | 'arc' | 'mortar' | 'beam' | 'hammer';
export type ModuleId =
  | 'battery' | 'heatsink' | 'coil' | 'targeter'
  | 'feeder' | 'piston' | 'repair' | 'magnet';
export type GearId = WeaponId | ModuleId;

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  // Cheap, reliable, single target. The weapon every run starts with.
  riveter: {
    id: 'riveter', kind: 'weapon', icon: 0, behaviour: 'bolt', price: 0,
    base: {
      damage: 9, cooldown: 0.42, range: 265, projectiles: 1, projectileSpeed: 430,
      heatGain: 5, chain: 0, knockback: 30, armorPierce: 0,
    },
  },
  // Persistent orbiting blade — no aiming, rewards moving through crowds.
  buzzsaw: {
    id: 'buzzsaw', kind: 'weapon', icon: 1, behaviour: 'orbit', price: 26,
    base: {
      damage: 8, cooldown: 1, range: 64, projectiles: 1, projectileSpeed: 2.3,
      heatGain: 4, chain: 0, knockback: 55, armorPierce: 1, hitCooldown: 0.42,
    },
  },
  // Instant hitscan that jumps between targets. Loves the Coil.
  arc: {
    id: 'arc', kind: 'weapon', icon: 2, behaviour: 'chain', price: 32,
    base: {
      damage: 13, cooldown: 1.15, range: 205, projectiles: 1, projectileSpeed: 0,
      heatGain: 15, chain: 1, knockback: 10, armorPierce: 0,
    },
  },
  // Lobbed area damage aimed at the densest cluster. Slow, heavy, hot.
  mortar: {
    id: 'mortar', kind: 'weapon', icon: 3, behaviour: 'mortar', price: 36,
    base: {
      damage: 27, cooldown: 2.05, range: 345, projectiles: 1, projectileSpeed: 240,
      heatGain: 21, chain: 0, knockback: 90, armorPierce: 2, area: 66, shards: 4,
    },
  },
  // Sustained sweeping beam. Very high heat — needs a Heatsink to run open.
  beam: {
    id: 'beam', kind: 'weapon', icon: 4, behaviour: 'beam', price: 38,
    base: {
      damage: 2.6, cooldown: 0.1, range: 195, projectiles: 1, projectileSpeed: 0,
      heatGain: 2.9, chain: 0, knockback: 6, armorPierce: 0, sweep: 1.35,
    },
  },
  // Melee shockwave around the robot. Clears the ring that gets you killed.
  hammer: {
    id: 'hammer', kind: 'weapon', icon: 5, behaviour: 'slam', price: 34,
    base: {
      damage: 35, cooldown: 1.95, range: 95, projectiles: 1, projectileSpeed: 0,
      heatGain: 18, chain: 0, knockback: 230, armorPierce: 3, area: 95,
    },
  },
};

export const MODULES: Record<ModuleId, ModuleDef> = {
  battery:  {
    id: 'battery', kind: 'module', icon: 6, price: 22,
    neighbour: { fireRate: { add: 0.25 } },
  },
  heatsink: {
    id: 'heatsink', kind: 'module', icon: 7, price: 20,
    neighbour: { heatGain: { mul: 0.55 }, cooling: { add: 0.3 } },
  },
  coil:     {
    id: 'coil', kind: 'module', icon: 8, price: 28,
    neighbour: { chain: { add: 1 } },
  },
  targeter: {
    id: 'targeter', kind: 'module', icon: 9, price: 26,
    neighbour: { damage: { add: 0.2 }, range: { add: 0.25 } },
  },
  feeder:   {
    id: 'feeder', kind: 'module', icon: 10, price: 30,
    neighbour: { projectiles: { add: 1 }, damage: { add: -0.12 } },
  },
  piston:   {
    id: 'piston', kind: 'module', icon: 11, price: 24,
    neighbour: { knockback: { add: 1.1 }, armorPierce: { add: 4 } },
  },
  repair:   {
    id: 'repair', kind: 'module', icon: 12, price: 26,
    neighbour: { damage: { add: -0.05 } },
    self: { regen: 0.6, maxHp: 10 },
  },
  magnet:   {
    id: 'magnet', kind: 'module', icon: 13, price: 18,
    neighbour: { scrapBonus: { add: 0.2 } },
    self: { pickupRadius: 34 },
  },
};

export const ALL_GEAR: Record<GearId, WeaponDef | ModuleDef> = { ...WEAPONS, ...MODULES };

export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];
export const MODULE_IDS = Object.keys(MODULES) as ModuleId[];

export const isWeapon = (id: GearId): id is WeaponId => id in WEAPONS;
export const isModule = (id: GearId): id is ModuleId => id in MODULES;

/**
 * Caps on resolved bonuses. With six cells a weapon can touch at most four
 * modules, so these are reached only by a deliberate build — they exist to
 * bound the extremes, not to punish normal play.
 */
export const STAT_CAPS: Partial<Record<StatKey, { min?: number; max?: number }>> = {
  damage: { min: 0.3, max: 2.6 },
  fireRate: { min: 0.4, max: 2.4 },
  range: { min: 0.5, max: 2.2 },
  projectiles: { min: 1, max: 5 },
  heatGain: { min: 0.15, max: 3 },
  cooling: { min: 0.5, max: 2.5 },
  chain: { min: 0, max: 4 },
  knockback: { min: 0, max: 4 },
  armorPierce: { min: 0, max: 12 },
  scrapBonus: { min: 0, max: 1 },
};

/**
 * Named combinations surfaced in the UI. These are not special-cased in the
 * simulation — each one is just what the generic adjacency rules already do
 * when these two pieces sit next to each other. Listing them gives players a
 * vocabulary for what they are discovering.
 */
export interface ComboDef {
  id: string;
  weapon: WeaponId;
  module: ModuleId;
}

export const COMBOS: ComboDef[] = [
  { id: 'rapid_rivets', weapon: 'riveter', module: 'battery' },
  { id: 'scattergun',   weapon: 'riveter', module: 'feeder' },
  { id: 'chain_saw',    weapon: 'buzzsaw', module: 'coil' },
  { id: 'siege_mortar', weapon: 'mortar',  module: 'targeter' },
  { id: 'open_beam',    weapon: 'beam',    module: 'heatsink' },
  { id: 'breaker',      weapon: 'hammer',  module: 'piston' },
  { id: 'storm_arc',    weapon: 'arc',     module: 'coil' },
  { id: 'salvage_saw',  weapon: 'buzzsaw', module: 'magnet' },
];
