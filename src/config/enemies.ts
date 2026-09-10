/**
 * Six regular enemy types and two bosses. Each regular type has a different
 * BEHAVIOUR, not just different numbers — the AI selector below is what the
 * simulation branches on.
 */
export type EnemyId = 'crusher' | 'skitter' | 'bulwark' | 'lancer' | 'kegger' | 'mender';
export type BossId = 'press' | 'sovereign';

export type EnemyBehaviour =
  | 'chase'      // walks straight at you and hits on contact
  | 'dart'       // fast, fragile, overshoots and re-approaches
  | 'shield'     // slow, armoured, ignores knockback
  | 'shooter'    // holds range, telegraphs, then fires
  | 'bomber'     // closes in, arms a visible fuse, detonates
  | 'support';   // holds back and heals other enemies

export interface EnemyDef {
  id: EnemyId;
  behaviour: EnemyBehaviour;
  /** Frame pair in assets/actors.png. */
  frames: [number, number];
  hp: number;
  speed: number;
  radius: number;
  /** Contact damage. Zero for enemies that never melee. */
  contactDamage: number;
  contactCooldown: number;
  /** Flat damage subtracted from every hit, before armour pierce. */
  armor: number;
  /** Resistance to knockback, 0 = shoved freely, 1 = immovable. */
  poise: number;
  scrap: number;
  /** Behaviour-specific numbers. */
  standoff?: number;      // preferred distance for shooter/support
  telegraph?: number;     // seconds of warning before the attack lands
  shotDamage?: number;
  shotSpeed?: number;
  fuse?: number;          // bomber arming time
  blastDamage?: number;
  blastRadius?: number;
  healAmount?: number;
  healInterval?: number;
  healRadius?: number;
}

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  // The baseline threat. Everything else is defined against this.
  crusher: {
    id: 'crusher', behaviour: 'chase', frames: [4, 5],
    hp: 27, speed: 53, radius: 13, contactDamage: 8, contactCooldown: 0.8,
    armor: 0, poise: 0.25, scrap: 2,
  },
  // Fast and fragile: dies to anything, punishes standing still.
  skitter: {
    id: 'skitter', behaviour: 'dart', frames: [6, 7],
    hp: 10, speed: 112, radius: 10, contactDamage: 5, contactCooldown: 0.6,
    armor: 0, poise: 0, scrap: 1,
  },
  // Armoured: flat reduction makes rapid weak hits useless without pierce.
  bulwark: {
    id: 'bulwark', behaviour: 'shield', frames: [8, 9],
    hp: 74, speed: 33, radius: 16, contactDamage: 14, contactCooldown: 1.0,
    armor: 4, poise: 0.92, scrap: 5,
  },
  // Holds range and telegraphs. The sprite lights up during the wind-up.
  lancer: {
    id: 'lancer', behaviour: 'shooter', frames: [10, 11],
    hp: 23, speed: 44, radius: 12, contactDamage: 0, contactCooldown: 1,
    armor: 1, poise: 0.4, scrap: 3,
    standoff: 215, telegraph: 0.85, shotDamage: 11, shotSpeed: 205,
  },
  // Closes, arms with a visible fuse, then detonates. Kill it early or leave.
  kegger: {
    id: 'kegger', behaviour: 'bomber', frames: [14, 15],
    hp: 25, speed: 64, radius: 13, contactDamage: 0, contactCooldown: 1,
    armor: 0, poise: 0.3, scrap: 3,
    fuse: 1.25, blastDamage: 27, blastRadius: 82,
  },
  // Heals nearby enemies. Changes what you shoot first.
  mender: {
    id: 'mender', behaviour: 'support', frames: [18, 19],
    hp: 19, speed: 47, radius: 11, contactDamage: 0, contactCooldown: 1,
    armor: 0, poise: 0.15, scrap: 4,
    standoff: 175, healAmount: 7, healInterval: 1.7, healRadius: 135,
  },
};

/** Extra frames used to show a wind-up state. */
export const ENEMY_TELEGRAPH_FRAMES: Partial<Record<EnemyId, [number, number]>> = {
  lancer: [12, 13],
  kegger: [16, 17],
};

export interface BossPhase {
  /** Phase begins when HP drops to or below this fraction. */
  atHpFraction: number;
  attackCooldown: number;
  telegraph: number;
  /** Number of simultaneous attack instances. */
  volleys: number;
  summonEvery: number;
  summonCount: number;
  summonType: EnemyId;
  speed: number;
}

export interface BossDef {
  id: BossId;
  /** Base frame index and frame count in assets/bosses.png. */
  frameBase: number;
  hp: number;
  radius: number;
  contactDamage: number;
  armor: number;
  scrap: number;
  attack: 'slam' | 'radial';
  attackDamage: number;
  attackRadius: number;
  phases: BossPhase[];
}

export const BOSSES: Record<BossId, BossDef> = {
  // PRESS MOTHER — telegraphed ground slams, escalating in phase two.
  press: {
    id: 'press', frameBase: 0, hp: 1150, radius: 30, contactDamage: 11, armor: 2, scrap: 40,
    attack: 'slam', attackDamage: 20, attackRadius: 88,
    phases: [
      { atHpFraction: 1.00, attackCooldown: 3.2, telegraph: 1.20, volleys: 1, summonEvery: 9, summonCount: 3, summonType: 'skitter', speed: 42 },
      { atHpFraction: 0.55, attackCooldown: 2.4, telegraph: 1.00, volleys: 2, summonEvery: 7, summonCount: 4, summonType: 'crusher', speed: 54 },
      { atHpFraction: 0.22, attackCooldown: 1.9, telegraph: 0.90, volleys: 3, summonEvery: 6, summonCount: 4, summonType: 'skitter', speed: 62 },
    ],
  },
  // ARC SOVEREIGN — charges its coils, then fires a radial burst.
  sovereign: {
    id: 'sovereign', frameBase: 5, hp: 1330, radius: 28, contactDamage: 10, armor: 1, scrap: 55,
    attack: 'radial', attackDamage: 18, attackRadius: 26,
    phases: [
      { atHpFraction: 1.00, attackCooldown: 2.8, telegraph: 1.25, volleys: 8,  summonEvery: 10, summonCount: 3, summonType: 'skitter', speed: 46 },
      { atHpFraction: 0.60, attackCooldown: 2.2, telegraph: 1.0,  volleys: 11, summonEvery: 8,  summonCount: 2, summonType: 'mender', speed: 56 },
      { atHpFraction: 0.25, attackCooldown: 1.7, telegraph: 0.8,  volleys: 14, summonEvery: 7,  summonCount: 3, summonType: 'lancer', speed: 64 },
    ],
  },
};

export const ENEMY_IDS = Object.keys(ENEMIES) as EnemyId[];
