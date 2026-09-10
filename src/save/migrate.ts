import { CONTRACTS } from '../config/contracts';
import { ALL_GEAR, type GearId } from '../config/gear';
import { ROBOTS, type RobotId } from '../config/robots';
import { UPGRADES, type UpgradeId } from '../config/upgrades';
import { GRID_CELLS } from '../sim/grid';
import type { RunState } from '../sim/run';
import {
  defaultProgress, defaultSave, defaultSettings, SAVE_VERSION,
  type Progress, type SaveData, type Settings,
} from './schema';

const num = (v: unknown, fallback: number, lo = -Infinity, hi = Infinity): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(hi, Math.max(lo, n));
};

const bool = (v: unknown, fallback: boolean): boolean =>
  typeof v === 'boolean' ? v : fallback;

const str = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

/**
 * Validate a decoded save.
 *
 * Anything unrecognised is replaced with its default rather than trusted:
 * this file is the only place that turns untrusted JSON — which on Yandex may
 * come from cloud storage written by an older build — into typed state.
 */
export function sanitize(raw: unknown, fallbackLang: 'ru' | 'en' = 'ru'): SaveData {
  const base = defaultSave(fallbackLang);
  if (!raw || typeof raw !== 'object') return base;
  const d = raw as Record<string, unknown>;

  const s = (d.settings ?? {}) as Record<string, unknown>;
  const settings: Settings = {
    lang: str(s.lang, ['ru', 'en'] as const, base.settings.lang),
    music: num(s.music, base.settings.music, 0, 1),
    sfx: num(s.sfx, base.settings.sfx, 0, 1),
    screenShake: bool(s.screenShake, base.settings.screenShake),
    showDamage: bool(s.showDamage, base.settings.showDamage),
    stickSide: str(s.stickSide, ['left', 'right'] as const, base.settings.stickSide),
  };

  const p = (d.progress ?? {}) as Record<string, unknown>;
  const upgrades: Progress['upgrades'] = {};
  const rawUpgrades = (p.upgrades ?? {}) as Record<string, unknown>;
  for (const id of Object.keys(UPGRADES) as UpgradeId[]) {
    const lvl = Math.floor(num(rawUpgrades[id], 0, 0, UPGRADES[id].maxLevel));
    if (lvl > 0) upgrades[id] = lvl;
  }

  const validRobots = Object.keys(ROBOTS) as RobotId[];
  const unlockedRobots = Array.isArray(p.unlockedRobots)
    ? [...new Set(p.unlockedRobots.filter((r): r is RobotId => validRobots.includes(r as RobotId)))]
    : [...base.progress.unlockedRobots];
  if (!unlockedRobots.includes('scrap14')) unlockedRobots.unshift('scrap14');

  const contractIds = CONTRACTS.map((c) => c.id);
  const wonContracts = Array.isArray(p.wonContracts)
    ? [...new Set(p.wonContracts.filter((c): c is string => contractIds.includes(c as string)))]
    : [];

  const bestWave: Record<string, number> = {};
  const rawBest = (p.bestWave ?? {}) as Record<string, unknown>;
  for (const id of contractIds) {
    const v = Math.floor(num(rawBest[id], 0, 0, 99));
    if (v > 0) bestWave[id] = v;
  }

  const progress: Progress = {
    credits: Math.floor(num(p.credits, 0, 0, 9_999_999)),
    upgrades,
    unlockedRobots,
    wonContracts,
    tutorialDone: bool(p.tutorialDone, false),
    totalRuns: Math.floor(num(p.totalRuns, 0, 0, 9_999_999)),
    totalKills: Math.floor(num(p.totalKills, 0, 0, 99_999_999)),
    bestWave,
    ownsCosmetics: bool(p.ownsCosmetics, false),
    adFree: bool(p.adFree, false),
  };

  return {
    version: SAVE_VERSION,
    revision: Math.floor(num(d.revision, 0, 0, Number.MAX_SAFE_INTEGER)),
    updatedAt: Math.floor(num(d.updatedAt, 0, 0, Number.MAX_SAFE_INTEGER)),
    settings,
    progress,
    activeRun: sanitizeRun(d.activeRun, unlockedRobots),
    finishedContracts: Math.floor(num(d.finishedContracts, 0, 0, 999_999)),
    lastInterstitialAt: Math.floor(num(d.lastInterstitialAt, 0, 0, Number.MAX_SAFE_INTEGER)),
    sessions: Math.floor(num(d.sessions, 0, 0, 999_999)),
  };
}

/** A run that fails validation is dropped entirely — a broken resume is worse
 *  than no resume, and the player keeps their credits either way. */
function sanitizeRun(raw: unknown, unlockedRobots: RobotId[]): RunState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const contract = CONTRACTS.find((c) => c.id === r.contractId);
  if (!contract) return null;

  const robotId = str(r.robotId, unlockedRobots, 'scrap14' as RobotId);
  const waveIndex = Math.floor(num(r.waveIndex, 0, 0, contract.waves.length));
  if (waveIndex >= contract.waves.length) return null; // already finished

  const gearIds = Object.keys(ALL_GEAR) as GearId[];
  const slots: (GearId | null)[] = new Array(GRID_CELLS).fill(null);
  if (Array.isArray(r.slots)) {
    for (let i = 0; i < GRID_CELLS; i++) {
      const v = r.slots[i];
      if (typeof v === 'string' && gearIds.includes(v as GearId)) slots[i] = v as GearId;
    }
  }

  const offers = Array.isArray(r.offers)
    ? r.offers
        .filter((o): o is Record<string, unknown> => !!o && typeof o === 'object')
        .filter((o) => typeof o.gear === 'string' && gearIds.includes(o.gear as GearId))
        .slice(0, 8)
        .map((o) => ({
          gear: o.gear as GearId,
          price: Math.floor(num(o.price, 0, 0, 9999)),
          sold: bool(o.sold, false),
        }))
    : [];

  const rewardedWaves = Array.isArray(r.rewardedWaves)
    ? [...new Set(r.rewardedWaves
        .filter((v): v is number => typeof v === 'number' && Number.isInteger(v))
        .filter((v) => v >= 0 && v < contract.waves.length))]
    : [];

  return {
    contractId: contract.id,
    robotId,
    waveIndex,
    slots,
    scrap: Math.floor(num(r.scrap, 0, 0, 999_999)),
    seed: Math.floor(num(r.seed, 1, 1, Number.MAX_SAFE_INTEGER)),
    rewardedWaves,
    offers,
    rerolls: Math.floor(num(r.rerolls, 0, 0, 99)),
    totalKills: Math.floor(num(r.totalKills, 0, 0, 999_999)),
    wavesCleared: Math.floor(num(r.wavesCleared, 0, 0, contract.waves.length)),
    startedAt: Math.floor(num(r.startedAt, Date.now(), 0, Number.MAX_SAFE_INTEGER)),
    finished: bool(r.finished, false),
    won: bool(r.won, false),
    rewardedClaimed: bool(r.rewardedClaimed, false),
  };
}

/**
 * Step an older save forward one version at a time. Each step gets the shape
 * the previous version produced and returns the next one; sanitize() then does
 * the final validation, so a step only has to move fields around.
 */
type MigrationStep = (data: Record<string, unknown>) => Record<string, unknown>;

const STEPS: Record<number, MigrationStep> = {
  // 0 -> 1: pre-versioning saves are not a real case for a first release, but
  // the table has to exist for version 2 to have somewhere to go.
  0: (d) => ({ ...d, version: 1, progress: { ...defaultProgress(), ...(d.progress as object ?? {}) } }),
};

export function migrate(raw: unknown, fallbackLang: 'ru' | 'en' = 'ru'): {
  data: SaveData; migratedFrom: number | null;
} {
  if (!raw || typeof raw !== 'object') {
    return { data: defaultSave(fallbackLang), migratedFrom: null };
  }
  let d = raw as Record<string, unknown>;
  const from = typeof d.version === 'number' ? d.version : 0;

  if (from > SAVE_VERSION) {
    // A save written by a newer build. Keep settings and credits, drop the run
    // rather than guess at a format we do not know.
    const salvaged = sanitize({ ...d, activeRun: null }, fallbackLang);
    return { data: salvaged, migratedFrom: from };
  }

  let v = from;
  while (v < SAVE_VERSION) {
    const step = STEPS[v];
    if (!step) break;
    d = step(d);
    v = typeof d.version === 'number' ? d.version : v + 1;
  }

  return {
    data: sanitize({ ...d, version: SAVE_VERSION }, fallbackLang),
    migratedFrom: from === SAVE_VERSION ? null : from,
  };
}

export const defaultSettingsFor = defaultSettings;
