import type { BossId, EnemyId } from './enemies';

/** One arena's visual identity; indexes into assets/tiles.png (4 frames each). */
export type ArenaId = 'sorting' | 'foundry' | 'arc';

export const ARENA_TILE_BASE: Record<ArenaId, number> = {
  sorting: 0, foundry: 4, arc: 8,
};

export interface WaveDef {
  /** Seconds the wave lasts. Boss waves ignore this and end when the boss dies. */
  duration: number;
  /** Total enemies released over the wave. */
  budget: number;
  /** Relative spawn weights. Types absent from the map never appear. */
  mix: Partial<Record<EnemyId, number>>;
  /** Extra enemies released together at the start, for a strong opening beat. */
  opener?: number;
  boss?: BossId;
}

/**
 * A modifier is a one-sentence rule the player reads before accepting the
 * contract. Numbers here multiply the wave's own values.
 */
export interface ContractModifier {
  id: string;
  enemySpeed?: number;
  enemyHp?: number;
  scrapGain?: number;
  /** Extra scrap handed over at the start of the contract. */
  startingScrap?: number;
  /** Free module granted on wave 1, by id. */
  startingModule?: string;
}

export interface ContractDef {
  id: string;
  arena: ArenaId;
  /** 0-based difficulty tier; feeds SCALING.hpPerTier. */
  tier: number;
  /** Contracts unlock in order; index of the contract that must be won first. */
  requires: string | null;
  modifiers: ContractModifier[];
  waves: WaveDef[];
}

export const CONTRACTS: ContractDef[] = [
  // ---- 1. NIGHT SHIFT — the teaching contract. Gentle mix, one boss. ----
  {
    id: 'night_shift',
    arena: 'sorting',
    tier: 0,
    requires: null,
    modifiers: [],
    waves: [
      { duration: 38, budget: 16, mix: { crusher: 1 }, opener: 3 },
      { duration: 42, budget: 26, mix: { crusher: 3, skitter: 2 }, opener: 4 },
      { duration: 45, budget: 34, mix: { crusher: 3, skitter: 3, lancer: 1 }, opener: 5 },
      { duration: 46, budget: 40, mix: { crusher: 3, skitter: 3, lancer: 2, bulwark: 1 }, opener: 6 },
      { duration: 48, budget: 48, mix: { crusher: 3, skitter: 3, lancer: 2, bulwark: 2, kegger: 1 }, opener: 6 },
      { duration: 0, budget: 30, mix: { crusher: 2, skitter: 2, lancer: 1 }, boss: 'press' },
    ],
  },

  // ---- 2. FOUNDRY RUSH — everything is faster, and pays better for it. ----
  {
    id: 'foundry_rush',
    arena: 'foundry',
    tier: 1,
    requires: 'night_shift',
    modifiers: [{ id: 'overdrive_line', enemySpeed: 1.2, scrapGain: 1.3 }],
    waves: [
      { duration: 40, budget: 24, mix: { crusher: 2, skitter: 3 }, opener: 5 },
      { duration: 44, budget: 34, mix: { crusher: 3, skitter: 3, kegger: 2 }, opener: 6 },
      { duration: 46, budget: 42, mix: { crusher: 3, skitter: 3, lancer: 2, kegger: 2 }, opener: 6 },
      { duration: 48, budget: 50, mix: { crusher: 2, skitter: 4, bulwark: 2, kegger: 2, mender: 1 }, opener: 7 },
      { duration: 50, budget: 58, mix: { crusher: 3, skitter: 4, bulwark: 2, lancer: 2, kegger: 2, mender: 1 }, opener: 8 },
      { duration: 52, budget: 64, mix: { crusher: 3, skitter: 4, bulwark: 3, lancer: 3, kegger: 2, mender: 2 }, opener: 8 },
      { duration: 0, budget: 30, mix: { skitter: 3, lancer: 1, mender: 1 }, boss: 'sovereign' },
    ],
  },

  // ---- 3. ARC QUARANTINE — two bosses, armour everywhere, a head start. ----
  {
    id: 'arc_quarantine',
    arena: 'arc',
    tier: 2,
    requires: 'foundry_rush',
    modifiers: [{ id: 'hardened', enemyHp: 1.12, startingScrap: 30, startingModule: 'heatsink' }],
    waves: [
      { duration: 42, budget: 28, mix: { crusher: 3, bulwark: 1, skitter: 2 }, opener: 6 },
      { duration: 45, budget: 38, mix: { crusher: 3, bulwark: 2, lancer: 2, skitter: 2 }, opener: 6 },
      { duration: 47, budget: 46, mix: { crusher: 2, bulwark: 3, lancer: 2, mender: 2, skitter: 2 }, opener: 7 },
      { duration: 0, budget: 40, mix: { bulwark: 2, skitter: 3, lancer: 2, kegger: 1 }, boss: 'press' },
      { duration: 48, budget: 54, mix: { crusher: 3, bulwark: 3, lancer: 3, kegger: 2, mender: 2 }, opener: 8 },
      { duration: 50, budget: 62, mix: { crusher: 3, bulwark: 3, lancer: 3, kegger: 3, mender: 2, skitter: 3 }, opener: 8 },
      { duration: 52, budget: 70, mix: { crusher: 3, bulwark: 4, lancer: 3, kegger: 3, mender: 3, skitter: 4 }, opener: 9 },
      { duration: 0, budget: 36, mix: { bulwark: 2, lancer: 2, mender: 2, skitter: 3 }, boss: 'sovereign' },
    ],
  },
];

export const contractById = (id: string): ContractDef | undefined =>
  CONTRACTS.find((c) => c.id === id);

/** Merge every modifier on a contract into one lookup. */
export function contractEffects(c: ContractDef): Required<Omit<ContractModifier, 'id' | 'startingModule'>> & { startingModule?: string } {
  const out = { enemySpeed: 1, enemyHp: 1, scrapGain: 1, startingScrap: 0 } as
    Required<Omit<ContractModifier, 'id' | 'startingModule'>> & { startingModule?: string };
  for (const m of c.modifiers) {
    out.enemySpeed *= m.enemySpeed ?? 1;
    out.enemyHp *= m.enemyHp ?? 1;
    out.scrapGain *= m.scrapGain ?? 1;
    out.startingScrap += m.startingScrap ?? 0;
    if (m.startingModule) out.startingModule = m.startingModule;
  }
  return out;
}
