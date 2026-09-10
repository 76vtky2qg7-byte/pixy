import type { EnemyId, BossId } from '../config/enemies';
import type { WeaponId } from '../config/gear';
import type { Poolable } from './pool';

export type EnemyState = 'approach' | 'reposition' | 'telegraph' | 'attack' | 'recover' | 'armed';

export interface Enemy extends Poolable {
  active: boolean;
  uid: number;
  type: EnemyId;
  boss: BossId | null;
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  speed: number;
  radius: number;
  armor: number;
  poise: number;
  scrap: number;
  contactDamage: number;
  contactCooldown: number;
  contactTimer: number;
  state: EnemyState;
  timer: number;
  /** Seconds of hit-flash left; purely for the renderer. */
  flash: number;
  facing: number;
  /** Bosses only. */
  phase: number;
  summonTimer: number;
  attackTimer: number;
  /** Wander offset so a crowd does not collapse into one line. */
  jitter: number;
  healTimer: number;
  animT: number;
}

export type ProjectileKind = 'rivet' | 'shell' | 'shard' | 'plasma' | 'boltArc';

export interface Projectile extends Poolable {
  active: boolean;
  uid: number;
  kind: ProjectileKind;
  x: number; y: number;
  vx: number; vy: number;
  life: number;
  damage: number;
  radius: number;
  hostile: boolean;
  armorPierce: number;
  knockback: number;
  /** Explosion radius on impact; 0 means a point hit. */
  area: number;
  shards: number;
  chain: number;
  /** Enemies already hit, so a piercing shot cannot hit the same target twice. */
  hitUids: Set<number>;
  pierce: number;
  scrapBonus: number;
  angle: number;
  spin: number;
  /** Mortar shells arc: they travel a fixed time then detonate. */
  fuse: number;
}

export type PickupKind = 'scrap' | 'spark' | 'cell';

export interface Pickup extends Poolable {
  active: boolean;
  uid: number;
  kind: PickupKind;
  x: number; y: number;
  vx: number; vy: number;
  value: number;
  life: number;
  /** Set once the magnet grabs it, so it never un-grabs. */
  homing: boolean;
  animT: number;
}

/** A blade orbiting the player, owned by an installed Buzzsaw. */
export interface Orbiter {
  cell: number;
  angle: number;
  radius: number;
  damage: number;
  knockback: number;
  armorPierce: number;
  scrapBonus: number;
  /** Per-enemy re-hit delay, keyed by enemy uid. */
  cooldowns: Map<number, number>;
  hitCooldown: number;
}

/** Live per-weapon state: cooldowns, heat, and behaviour-specific angles. */
export interface WeaponState {
  cell: number;
  id: WeaponId;
  cooldown: number;
  heat: number;
  overheated: boolean;
  /** Beam sweep angle / mortar target memory. */
  angle: number;
  /** Damage tick accumulator for sustained weapons. */
  tick: number;
  kills: number;
}

/** Telegraphed ground hazard: a warning ring that later deals damage. */
export interface Hazard extends Poolable {
  active: boolean;
  uid: number;
  x: number; y: number;
  radius: number;
  damage: number;
  /** Seconds until it resolves. While > 0 it only warns. */
  delay: number;
  /** Seconds the damaging state stays up after the delay elapses. */
  linger: number;
  fired: boolean;
  hostile: boolean;
}

export type SimEvent =
  | { t: 'hit'; x: number; y: number; amount: number; killed: boolean }
  | { t: 'kill'; x: number; y: number; enemy: EnemyId; boss: boolean }
  | { t: 'boom'; x: number; y: number; radius: number }
  | { t: 'slam'; x: number; y: number; radius: number }
  | { t: 'zap'; x1: number; y1: number; x2: number; y2: number }
  | { t: 'beam'; x1: number; y1: number; x2: number; y2: number; cell: number }
  | { t: 'pickup'; kind: PickupKind; x: number; y: number; value: number }
  | { t: 'hurt'; x: number; y: number; amount: number }
  | { t: 'warn'; x: number; y: number; radius: number; duration: number }
  | { t: 'overdriveStart' }
  | { t: 'overdriveEnd' }
  | { t: 'overheat'; cell: number }
  | { t: 'cooled'; cell: number }
  | { t: 'bossPhase'; phase: number }
  | { t: 'bossSpawn'; boss: BossId }
  | { t: 'waveCleared' }
  | { t: 'playerDown' }
  | { t: 'revived' };
