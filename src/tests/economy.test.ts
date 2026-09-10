import { beforeEach, describe, expect, it } from 'vitest';
import { CREDITS, SHOP, WAVE } from '../config/balance';
import { contractEffects, contractById } from '../config/contracts';
import { ALL_GEAR } from '../config/gear';
import {
  buyOffer, completeWave, contractResult, createRun, doReroll, offerPrice,
  rerollCost, rollShop, sellCell, unlockedContracts, wavesTotal, type RunState,
} from '../sim/run';
import { workshopBonuses } from '../config/upgrades';

const newRun = (contract = 'night_shift'): RunState =>
  createRun(contract, 'scrap14', {}, 4242);

describe('run setup', () => {
  it('starts with the robot loadout installed', () => {
    const run = newRun();
    expect(run.slots[0]).toBe('riveter');
    expect(run.waveIndex).toBe(0);
    expect(run.rewardedWaves).toEqual([]);
  });

  it('applies contract starting bonuses', () => {
    const run = createRun('arc_quarantine', 'scrap14', {}, 1);
    const eff = contractEffects(contractById('arc_quarantine')!);
    expect(eff.startingScrap).toBe(30);
    expect(run.scrap).toBe(20 + 30);
    expect(run.slots).toContain('heatsink');
  });

  it('adds the jumpstart upgrade to starting scrap', () => {
    const plain = createRun('night_shift', 'scrap14', {}, 1);
    const boosted = createRun('night_shift', 'scrap14', { jumpstart: 3 }, 1);
    expect(boosted.scrap - plain.scrap).toBe(workshopBonuses({ jumpstart: 3 }).startingScrap);
  });
});

describe('shop', () => {
  it('offers a stable set for the same seed, wave and reroll count', () => {
    const run = newRun();
    expect(rollShop(run).map((o) => o.gear)).toEqual(rollShop(run).map((o) => o.gear));
  });

  it('offers a different set after a reroll', () => {
    const run = { ...newRun(), scrap: 500 };
    const before = run.offers.map((o) => o.gear).join(',');
    const after = doReroll(run);
    expect(after.rerolls).toBe(1);
    expect(after.offers.map((o) => o.gear).join(',')).not.toBe(before);
  });

  it('never repeats an item within one shop', () => {
    for (let w = 0; w < 6; w++) {
      const run = { ...newRun(), waveIndex: w };
      const offers = rollShop(run).map((o) => o.gear);
      expect(new Set(offers).size).toBe(offers.length);
    }
  });

  it('makes the first reroll free and later ones cost more', () => {
    const run = newRun();
    expect(rerollCost({ ...run, rerolls: 0 })).toBe(0);
    expect(rerollCost({ ...run, rerolls: 1 })).toBe(SHOP.rerollBase);
    expect(rerollCost({ ...run, rerolls: 2 })).toBe(SHOP.rerollBase + SHOP.rerollStep);
  });

  it('refuses a reroll that cannot be paid for, without changing anything', () => {
    const run = { ...newRun(), rerolls: 3, scrap: 0 };
    expect(doReroll(run)).toBe(run);
  });

  it('grows prices as the contract goes on, but keeps free gear free', () => {
    const early = { ...newRun(), waveIndex: 0 };
    const late = { ...newRun(), waveIndex: 5 };
    expect(offerPrice(late, 'mortar')).toBeGreaterThan(offerPrice(early, 'mortar'));
    expect(ALL_GEAR.riveter.price).toBe(0);
    expect(offerPrice(late, 'riveter')).toBe(0);
  });
});

describe('buying', () => {
  let run: RunState;
  beforeEach(() => { run = { ...newRun(), scrap: 500 }; });

  it('installs into the first empty cell and charges once', () => {
    const price = run.offers[0].price;
    const res = buyOffer(run, 0);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.run.scrap).toBe(500 - price);
    expect(res.run.slots[res.placedAt]).toBe(run.offers[0].gear);
    expect(res.run.offers[0].sold).toBe(true);
  });

  it('refuses to buy the same offer twice', () => {
    const first = buyOffer(run, 0);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = buyOffer(first.run, 0);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe('already_sold');
  });

  it('leaves the run untouched when there is not enough scrap', () => {
    const poor = { ...run, scrap: 0 };
    const res = buyOffer(poor, 0);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('no_money');
    expect(poor.scrap).toBe(0);
    expect(poor.offers[0].sold).toBe(false);
  });

  it('asks for a target cell when the panel is full, spending nothing', () => {
    const full = { ...run, slots: ['riveter', 'battery', 'coil', 'magnet', 'buzzsaw', 'arc'] as RunState['slots'] };
    const res = buyOffer(full, 0);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('no_space');
    expect(full.scrap).toBe(500);
    expect(full.offers[0].sold).toBe(false);
  });

  it('refunds the displaced part when buying into an occupied cell', () => {
    const full = { ...run, slots: ['riveter', 'battery', 'coil', 'magnet', 'buzzsaw', 'arc'] as RunState['slots'] };
    const price = full.offers[0].price;
    const refund = Math.floor(offerPrice(full, 'battery') * SHOP.sellRefund);
    const res = buyOffer(full, 0, 1);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.displaced).toBe('battery');
    expect(res.run.scrap).toBe(500 - price + refund);
    expect(res.run.slots[1]).toBe(full.offers[0].gear);
  });

  it('sells a cell back for a partial refund and empties it', () => {
    const after = sellCell(run, 0);
    expect(after.slots[0]).toBeNull();
    expect(after.scrap).toBe(500 + Math.floor(offerPrice(run, 'riveter') * SHOP.sellRefund));
  });

  it('selling an empty cell is a no-op', () => {
    expect(sellCell(run, 5)).toBe(run);
  });
});

describe('wave rewards', () => {
  it('pays collected scrap plus the clear bonus', () => {
    const run = newRun();
    const { run: next, reward } = completeWave(run, 40, 12);
    const eff = contractEffects(contractById('night_shift')!);
    const expected = Math.round(WAVE.clearBonusBase * eff.scrapGain);
    expect(reward.clearBonus).toBe(expected);
    expect(reward.total).toBe(40 + expected);
    expect(next.scrap).toBe(run.scrap + 40 + expected);
    expect(next.waveIndex).toBe(1);
    expect(next.wavesCleared).toBe(1);
    expect(reward.granted).toBe(true);
  });

  it('does not pay the clear bonus twice for the same wave', () => {
    const run = newRun();
    const first = completeWave(run, 40, 12);
    // Simulate a reload: the player replays wave 0, which is already banked.
    const replay: RunState = { ...first.run, waveIndex: 0 };
    const second = completeWave(replay, 25, 8);

    expect(second.reward.granted).toBe(false);
    expect(second.reward.clearBonus).toBe(0);
    // The scrap physically re-collected during the replay still counts.
    expect(second.reward.scrapCollected).toBe(25);
    expect(second.run.scrap).toBe(replay.scrap + 25);
    // And the wave is not counted as cleared a second time.
    expect(second.run.wavesCleared).toBe(first.run.wavesCleared);
    expect(second.run.rewardedWaves).toEqual([0]);
  });

  it('resets rerolls between waves', () => {
    const run = { ...newRun(), rerolls: 3, scrap: 500 };
    expect(completeWave(run, 0, 0).run.rerolls).toBe(0);
  });

  it('reaches the end of the contract after every wave', () => {
    let run = newRun();
    const total = wavesTotal(run);
    for (let i = 0; i < total; i++) run = completeWave(run, 10, 5).run;
    expect(run.waveIndex).toBe(total);
    expect(run.wavesCleared).toBe(total);
  });
});

describe('contract results', () => {
  it('pays more for a win than for the same progress lost', () => {
    const base: RunState = { ...newRun(), wavesCleared: 4, totalKills: 120 };
    const win = contractResult(base, true);
    const loss = contractResult(base, false);
    expect(win.baseCredits).toBeGreaterThan(loss.baseCredits);
    expect(win.breakdown.some((b) => b.key === 'win')).toBe(true);
  });

  it('never pays nothing for a finished attempt', () => {
    const nothing: RunState = { ...newRun(), wavesCleared: 0, totalKills: 0 };
    expect(contractResult(nothing, false).baseCredits).toBeGreaterThanOrEqual(CREDITS.minimumPayout);
  });

  it('credits machines scrapped even on a failed attempt', () => {
    const few: RunState = { ...newRun(), wavesCleared: 0, totalKills: 0 };
    const many: RunState = { ...newRun(), wavesCleared: 0, totalKills: 300 };
    expect(contractResult(many, false).baseCredits)
      .toBeGreaterThan(contractResult(few, false).baseCredits);
  });

  it('pays a difficulty bonus on later contracts', () => {
    const easy = contractResult({ ...createRun('night_shift', 'scrap14', {}, 1), wavesCleared: 6 }, true);
    const hard = contractResult({ ...createRun('arc_quarantine', 'scrap14', {}, 1), wavesCleared: 6 }, true);
    expect(hard.baseCredits).toBeGreaterThan(easy.baseCredits);
    expect(hard.breakdown.some((b) => b.key === 'tier')).toBe(true);
  });

  it('breaks the payout down into lines that add up', () => {
    const r = contractResult({ ...newRun(), wavesCleared: 5, totalKills: 90 }, true);
    const sum = r.breakdown.reduce((a, b) => a + b.amount, 0);
    expect(sum).toBe(r.baseCredits);
  });

  it('doubling the reward is exactly twice the base', () => {
    const r = contractResult({ ...newRun(), wavesCleared: 3, totalKills: 40 }, false);
    expect(r.baseCredits * CREDITS.rewardedMultiplier).toBe(r.baseCredits * 2);
  });
});

describe('contract unlocking', () => {
  it('offers only the first contract to a new player', () => {
    expect(unlockedContracts([]).map((c) => c.id)).toEqual(['night_shift']);
  });

  it('unlocks the next contract on a win', () => {
    expect(unlockedContracts(['night_shift']).map((c) => c.id))
      .toEqual(['night_shift', 'foundry_rush']);
  });

  it('unlocks everything once the chain is finished', () => {
    expect(unlockedContracts(['night_shift', 'foundry_rush'])).toHaveLength(3);
  });
});
