/**
 * Every tunable number in the game lives in src/config. Nothing in src/sim or
 * src/render hard-codes a balance value.
 *
 * BALANCE_VERSION is stamped into analytics events so a session's numbers can
 * be attributed to the tuning pass that produced them. Bump it whenever the
 * values below change in a way that would make two runs incomparable.
 */
export const BALANCE_VERSION = 3;

export const PLAYER = {
  maxHp: 100,
  speed: 132,          // world px per second
  radius: 11,
  pickupRadius: 56,
  /** Invulnerability after taking a hit, so a crowd cannot chain-stun. */
  iframes: 0.45,
  /** Overdrive: sparks charge a meter that briefly boosts every weapon. */
  overdriveMax: 100,
  overdrivePerSpark: 6,
  overdriveDuration: 6,
  overdriveFireRate: 0.55,   // multiplier applied to cooldowns
  overdriveDamage: 1.3,
} as const;

export const HEAT = {
  capacity: 100,
  /** Base dissipation per second while not overheated. */
  cooling: 24,
  /** Dissipation multiplier while overheated — recovery is deliberately slow. */
  overheatedCooling: 0.7,
  /** Fire-rate penalty while overheated. */
  overheatedPenalty: 2.2,
  /** Heat must fall to this fraction of capacity to clear the overheat. */
  clearAt: 0.5,
} as const;

export const ARENA = {
  width: 1800,
  height: 1800,
  tile: 32,
  /** Enemies enter just outside the visible area, whatever its aspect ratio. */
  spawnMargin: 70,
  /** Keeps the player off the very edge so spawns always have room. */
  wallInset: 40,
} as const;

export const WAVE = {
  /** Simultaneous enemies allowed on screen; protects frame rate on phones. */
  maxAlive: 90,
  /** Scrap awarded for surviving a wave, before contract multipliers. */
  clearBonusBase: 14,
  clearBonusPerWave: 5,
  /** Chance an enemy drops a repair cell instead of nothing. */
  cellDropChance: 0.045,
  /** Sparks dropped per kill (Overdrive fuel). */
  sparkChance: 0.5,
  /** Enemies alive when the shift horn sounds power down without paying out. */
  endOfWaveSweepSeconds: 0.8,
} as const;

/** Enemy stats scale per wave index (1-based) so late waves stay dangerous. */
export const SCALING = {
  hpPerWave: 0.16,
  damagePerWave: 0.085,
  speedPerWave: 0.012,
  /** Applied on top of the per-wave curve, per contract tier (0-based). */
  hpPerTier: 0.18,
  damagePerTier: 0.10,
} as const;

/** Between-contract currency. Kept deliberately separate from run scrap. */
export const CREDITS = {
  perWaveCleared: 6,
  contractWinBonus: 40,
  /** Machines scrapped convert to credits at this rate, win or lose. */
  killsPerCredit: 10,
  /** Losing still pays, so a failed attempt is never wasted time. */
  lossMultiplier: 0.5,
  /** Floor for any finished attempt, however badly it went. */
  minimumPayout: 5,
  /** Rewarded video doubles the total, at most once per finished contract. */
  rewardedMultiplier: 2,
} as const;

export const SHOP = {
  /** Items offered each visit. */
  slots: 4,
  /** First reroll is free; each further reroll costs this much more. */
  rerollBase: 8,
  rerollStep: 6,
  /** Selling gear back returns this fraction, rounded down. */
  sellRefund: 0.5,
  /** Price drift as the contract goes on. */
  priceGrowthPerWave: 0.09,
} as const;

/** Ad pacing. Interstitials only ever fire from the results screen. */
export const ADS = {
  /** Minimum finished contracts between two interstitials. */
  interstitialEveryNContracts: 2,
  /** Never show an interstitial within this many seconds of the last one. */
  interstitialCooldownSeconds: 180,
  /** Skip the interstitial on a player's very first session. */
  skipFirstSession: true,
} as const;
