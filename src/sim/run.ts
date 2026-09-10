import { CREDITS, SHOP, WAVE } from '../config/balance';
import { CONTRACTS, contractById, contractEffects, type ContractDef } from '../config/contracts';
import {
  ALL_GEAR, isWeapon, MODULE_IDS, WEAPON_IDS,
  type GearId, type ModuleId,
} from '../config/gear';
import { ROBOTS, type RobotId } from '../config/robots';
import { workshopBonuses, type UpgradeLevels } from '../config/upgrades';
import { Rng } from '../core/rng';
import { emptySlots, firstEmptyCell, GRID_CELLS, type Slots } from './grid';

export interface ShopOffer {
  gear: GearId;
  price: number;
  /** Set once bought, so a double tap cannot buy the same offer twice. */
  sold: boolean;
}

/**
 * State of one contract attempt. This is the object that gets serialised, so
 * everything needed to resume sits here and nothing is inferred from the UI.
 */
export interface RunState {
  contractId: string;
  robotId: RobotId;
  /** 0-based index of the wave about to be played. */
  waveIndex: number;
  slots: Slots;
  scrap: number;
  seed: number;
  /** Wave indices whose clear reward has already been paid. */
  rewardedWaves: number[];
  /** Persisted so a reload does not reroll the player's shop. */
  offers: ShopOffer[];
  rerolls: number;
  /** Totals for the results screen. */
  totalKills: number;
  wavesCleared: number;
  startedAt: number;
  /** True once the contract has ended, one way or the other. */
  finished: boolean;
  won: boolean;
  /** Guards the once-per-contract rewarded-video bonus. */
  rewardedClaimed: boolean;
}

export function createRun(
  contractId: string, robotId: RobotId, levels: UpgradeLevels, seed = Date.now(),
): RunState {
  const contract = contractById(contractId);
  if (!contract) throw new Error(`unknown contract: ${contractId}`);
  const robot = ROBOTS[robotId];
  const effects = contractEffects(contract);
  const wb = workshopBonuses(levels);

  const slots = emptySlots();
  for (const l of robot.loadout) slots[l.cell] = l.gear;
  if (effects.startingModule) {
    const cell = firstEmptyCell(slots);
    if (cell >= 0) slots[cell] = effects.startingModule as ModuleId;
  }

  const run: RunState = {
    contractId,
    robotId,
    waveIndex: 0,
    slots,
    scrap: robot.startingScrap + effects.startingScrap + wb.startingScrap,
    seed,
    rewardedWaves: [],
    offers: [],
    rerolls: 0,
    totalKills: 0,
    wavesCleared: 0,
    startedAt: Date.now(),
    finished: false,
    won: false,
    rewardedClaimed: false,
  };
  run.offers = rollShop(run);
  return run;
}

export const runContract = (run: RunState): ContractDef => {
  const c = contractById(run.contractId);
  if (!c) throw new Error(`unknown contract: ${run.contractId}`);
  return c;
};

export const isBossWave = (run: RunState): boolean =>
  !!runContract(run).waves[run.waveIndex]?.boss;

export const wavesTotal = (run: RunState): number => runContract(run).waves.length;

/* -------------------------------------------------------------------- */
/* shop                                                                  */
/* -------------------------------------------------------------------- */

/**
 * Offers are derived from (seed, waveIndex, rerolls), so reloading the page
 * mid-shop shows exactly the same four items rather than handing the player a
 * free reroll.
 */
export function rollShop(run: RunState): ShopOffer[] {
  const rng = new Rng(run.seed * 7919 + run.waveIndex * 131 + run.rerolls * 17 + 3);
  const pool: GearId[] = [...WEAPON_IDS, ...MODULE_IDS, ...MODULE_IDS];
  rng.shuffle(pool);

  const offers: ShopOffer[] = [];
  const seen = new Set<GearId>();
  for (const gear of pool) {
    if (offers.length >= SHOP.slots) break;
    if (seen.has(gear)) continue;
    seen.add(gear);
    offers.push({ gear, price: offerPrice(run, gear), sold: false });
  }
  return offers;
}

export function offerPrice(run: RunState, gear: GearId): number {
  const base = ALL_GEAR[gear].price;
  const growth = 1 + SHOP.priceGrowthPerWave * run.waveIndex;
  // The starter weapon is free by definition; never let growth make it cost.
  return base === 0 ? 0 : Math.max(1, Math.round(base * growth));
}

export const rerollCost = (run: RunState): number =>
  run.rerolls === 0 ? 0 : SHOP.rerollBase + (run.rerolls - 1) * SHOP.rerollStep;

export type ShopResult =
  | { ok: true; run: RunState; placedAt: number; displaced: GearId | null }
  | { ok: false; reason: 'no_money' | 'already_sold' | 'no_space' | 'bad_offer' };

/**
 * Buy an offer and install it.
 *
 * Every failure path leaves `run` untouched, and the offer is marked sold
 * before any currency moves, so two taps landing in the same frame cannot both
 * succeed. `intoCell` is required only when the panel is full.
 */
export function buyOffer(run: RunState, offerIndex: number, intoCell?: number): ShopResult {
  const offer = run.offers[offerIndex];
  if (!offer) return { ok: false, reason: 'bad_offer' };
  if (offer.sold) return { ok: false, reason: 'already_sold' };
  if (run.scrap < offer.price) return { ok: false, reason: 'no_money' };

  let cell = intoCell ?? firstEmptyCell(run.slots);
  if (cell < 0 || cell >= GRID_CELLS) {
    // Panel full and no target chosen: the caller must ask the player which
    // cell to replace. Nothing is spent and nothing is lost.
    return { ok: false, reason: 'no_space' };
  }

  const slots = run.slots.slice();
  const displaced = slots[cell];
  slots[cell] = offer.gear;

  const refund = displaced ? Math.floor(offerPrice(run, displaced) * SHOP.sellRefund) : 0;
  const offers = run.offers.map((o, i) => (i === offerIndex ? { ...o, sold: true } : o));

  return {
    ok: true,
    run: { ...run, slots, offers, scrap: run.scrap - offer.price + refund },
    placedAt: cell,
    displaced,
  };
}

/** Sell whatever sits in a cell back for a partial refund. */
export function sellCell(run: RunState, cell: number): RunState {
  const gear = run.slots[cell];
  if (!gear) return run;
  const slots = run.slots.slice();
  slots[cell] = null;
  return { ...run, slots, scrap: run.scrap + Math.floor(offerPrice(run, gear) * SHOP.sellRefund) };
}

export function doReroll(run: RunState): RunState {
  const cost = rerollCost(run);
  if (run.scrap < cost) return run;
  const next: RunState = { ...run, scrap: run.scrap - cost, rerolls: run.rerolls + 1 };
  next.offers = rollShop(next);
  return next;
}

/* -------------------------------------------------------------------- */
/* wave results                                                          */
/* -------------------------------------------------------------------- */

export interface WaveReward {
  scrapCollected: number;
  clearBonus: number;
  total: number;
  /** False when this wave's reward was already banked (a resumed run). */
  granted: boolean;
}

/**
 * Bank a cleared wave.
 *
 * Idempotent by wave index: replaying a wave after a mid-wave reload cannot pay
 * its clear bonus twice. The scrap physically collected during the replay is
 * still credited, because that scrap was re-earned by re-playing the fight.
 */
export function completeWave(
  run: RunState, scrapCollected: number, kills: number,
): { run: RunState; reward: WaveReward } {
  const already = run.rewardedWaves.includes(run.waveIndex);
  const contract = runContract(run);
  const effects = contractEffects(contract);
  const clearBonus = already
    ? 0
    : Math.round(
        (WAVE.clearBonusBase + WAVE.clearBonusPerWave * run.waveIndex) * effects.scrapGain,
      );

  const next: RunState = {
    ...run,
    scrap: run.scrap + scrapCollected + clearBonus,
    totalKills: run.totalKills + kills,
    wavesCleared: already ? run.wavesCleared : run.wavesCleared + 1,
    rewardedWaves: already ? run.rewardedWaves : [...run.rewardedWaves, run.waveIndex],
    waveIndex: run.waveIndex + 1,
    rerolls: 0,
  };
  next.offers = rollShop(next);

  return {
    run: next,
    reward: {
      scrapCollected, clearBonus, total: scrapCollected + clearBonus, granted: !already,
    },
  };
}

export const isContractComplete = (run: RunState): boolean =>
  run.waveIndex >= wavesTotal(run);

/* -------------------------------------------------------------------- */
/* contract results                                                      */
/* -------------------------------------------------------------------- */

export interface ContractResult {
  won: boolean;
  wavesCleared: number;
  wavesTotal: number;
  kills: number;
  /** Credits before any rewarded-video bonus. */
  baseCredits: number;
  breakdown: { key: string; amount: number }[];
  durationSeconds: number;
}

/**
 * Credits are computed purely from what happened in the run. The rewarded video
 * multiplies the total afterwards; it never changes this number, so the base
 * payout is identical whether or not an ad was available.
 */
export function contractResult(run: RunState, won: boolean): ContractResult {
  const perWave = Math.round(CREDITS.perWaveCleared * run.wavesCleared);
  // Machines scrapped pay too, so an attempt that died partway through wave one
  // still returns something. Without this a first-ever failure pays literally
  // zero, which reads as "that was a waste of four minutes".
  const perKill = Math.floor(run.totalKills / CREDITS.killsPerCredit);
  const winBonus = won ? CREDITS.contractWinBonus : 0;
  const tier = runContract(run).tier;
  const tierBonus = Math.round((perWave + winBonus) * 0.25 * tier);
  const raw = perWave + perKill + winBonus + tierBonus;
  const base = Math.max(
    won ? raw : CREDITS.minimumPayout,
    won ? raw : Math.round(raw * CREDITS.lossMultiplier),
  );

  const breakdown = [
    { key: 'waves', amount: perWave },
    ...(perKill ? [{ key: 'kills', amount: perKill }] : []),
    ...(won ? [{ key: 'win', amount: winBonus }] : []),
    ...(tierBonus ? [{ key: 'tier', amount: tierBonus }] : []),
    ...(won ? [] : [{ key: 'retreat', amount: base - perWave - perKill - tierBonus }]),
  ];

  return {
    won,
    wavesCleared: run.wavesCleared,
    wavesTotal: wavesTotal(run),
    kills: run.totalKills,
    baseCredits: base,
    breakdown,
    durationSeconds: Math.round((Date.now() - run.startedAt) / 1000),
  };
}

/** Which contracts the player may start, given what they have won. */
export function unlockedContracts(won: string[]): ContractDef[] {
  return CONTRACTS.filter((c) => !c.requires || won.includes(c.requires));
}

/** Human-facing summary of a panel, used by the prep screen header. */
export function panelSummary(slots: Slots): { weapons: number; modules: number; empty: number } {
  let weapons = 0, modules = 0, empty = 0;
  for (const s of slots) {
    if (!s) empty++;
    else if (isWeapon(s)) weapons++;
    else modules++;
  }
  return { weapons, modules, empty };
}
