import type { RobotId } from '../config/robots';
import type { UpgradeLevels } from '../config/upgrades';
import type { RunState } from '../sim/run';

/**
 * Save format version. Bump on every shape change and add a migration step in
 * migrate.ts — never reinterpret an old field in place.
 *
 *  1 — initial release format
 */
export const SAVE_VERSION = 1;

export interface Settings {
  lang: 'ru' | 'en';
  music: number;      // 0..1
  sfx: number;        // 0..1
  screenShake: boolean;
  showDamage: boolean;
  /** Left-handed players can flip the on-screen stick. */
  stickSide: 'left' | 'right';
}

export interface Progress {
  credits: number;
  upgrades: UpgradeLevels;
  unlockedRobots: RobotId[];
  wonContracts: string[];
  tutorialDone: boolean;
  /** Lifetime counters, shown on the workshop screen. */
  totalRuns: number;
  totalKills: number;
  bestWave: Record<string, number>;
  /** Cosmetic set, if the optional purchase is enabled and owned. */
  ownsCosmetics: boolean;
  adFree: boolean;
}

export interface SaveData {
  version: number;
  /** Monotonic counter used to resolve local-vs-cloud conflicts. */
  revision: number;
  updatedAt: number;
  settings: Settings;
  progress: Progress;
  /** An interrupted contract, so the player can resume it. */
  activeRun: RunState | null;
  /** Contracts finished, for interstitial pacing. */
  finishedContracts: number;
  lastInterstitialAt: number;
  sessions: number;
}

export const defaultSettings = (lang: 'ru' | 'en' = 'ru'): Settings => ({
  lang,
  music: 0.5,
  sfx: 0.75,
  screenShake: true,
  showDamage: true,
  stickSide: 'left',
});

export const defaultProgress = (): Progress => ({
  credits: 0,
  upgrades: {},
  unlockedRobots: ['scrap14'],
  wonContracts: [],
  tutorialDone: false,
  totalRuns: 0,
  totalKills: 0,
  bestWave: {},
  ownsCosmetics: false,
  adFree: false,
});

export const defaultSave = (lang: 'ru' | 'en' = 'ru'): SaveData => ({
  version: SAVE_VERSION,
  revision: 0,
  updatedAt: 0,
  settings: defaultSettings(lang),
  progress: defaultProgress(),
  activeRun: null,
  finishedContracts: 0,
  lastInterstitialAt: 0,
  sessions: 0,
});
