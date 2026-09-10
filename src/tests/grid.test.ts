import { describe, expect, it } from 'vitest';
import { MODULES, WEAPONS } from '../config/gear';
import {
  emptySlots, GRID_CELLS, NEIGHBOURS, placeGear, previewPlacement,
  resolveGrid, swapCells, weaponRuntime, type Slots,
} from '../sim/grid';

const build = (...gear: (string | null)[]): Slots => {
  const s = emptySlots();
  gear.forEach((g, i) => { if (g) s[i] = g as never; });
  return s;
};

describe('adjacency geometry', () => {
  it('treats only orthogonal cells as neighbours', () => {
    // Layout:  0 1
    //          2 3
    //          4 5
    expect(NEIGHBOURS[0]).toEqual(expect.arrayContaining([1, 2]));
    expect(NEIGHBOURS[0]).toHaveLength(2);
    expect(NEIGHBOURS[2]).toEqual(expect.arrayContaining([3, 0, 4]));
    expect(NEIGHBOURS[5]).toEqual(expect.arrayContaining([4, 3]));
  });

  it('never treats a diagonal as a neighbour', () => {
    // 0/3, 1/2, 2/5 and 3/4 are the four diagonal pairs on a 2x3 grid.
    for (const [a, b] of [[0, 3], [1, 2], [2, 5], [3, 4]]) {
      expect(NEIGHBOURS[a]).not.toContain(b);
      expect(NEIGHBOURS[b]).not.toContain(a);
    }
  });

  it('is symmetric', () => {
    for (let i = 0; i < GRID_CELLS; i++) {
      for (const n of NEIGHBOURS[i]) expect(NEIGHBOURS[n]).toContain(i);
    }
  });
});

describe('resolveGrid', () => {
  it('leaves a lone weapon at neutral stats', () => {
    const res = resolveGrid(build('riveter'));
    expect(res.weapons).toHaveLength(1);
    expect(res.weapons[0].stats.damage).toBe(1);
    expect(res.weapons[0].stats.fireRate).toBe(1);
    expect(res.weapons[0].contributions).toHaveLength(0);
  });

  it('applies an orthogonally adjacent module', () => {
    const res = resolveGrid(build('riveter', 'battery'));
    expect(res.weapons[0].stats.fireRate).toBeCloseTo(1.25);
    expect(res.weapons[0].contributions).toHaveLength(1);
  });

  it('ignores a diagonally placed module', () => {
    // riveter at 0, battery at 3 — diagonal, so no effect.
    const res = resolveGrid(build('riveter', null, null, 'battery'));
    expect(res.weapons[0].stats.fireRate).toBe(1);
    expect(res.idleModules).toContain(3);
  });

  it('stacks two adjacent modules additively', () => {
    // battery at 0 and 3 both touch a weapon at 1? No: 1's neighbours are 0 and 3.
    const res = resolveGrid(build('battery', 'riveter', null, 'battery'));
    expect(res.weapons[0].stats.fireRate).toBeCloseTo(1.5);
    expect(res.weapons[0].contributions).toHaveLength(2);
  });

  it('never lets a module affect another module', () => {
    const res = resolveGrid(build('battery', 'coil', 'targeter', 'feeder'));
    // No weapons at all, so nothing is boosted and every module is idle.
    expect(res.weapons).toHaveLength(0);
    expect(res.idleModules.sort()).toEqual([0, 1, 2, 3]);
  });

  it('is a pure function of the slots', () => {
    const slots = build('riveter', 'battery', 'buzzsaw', 'coil');
    const a = resolveGrid(slots);
    const b = resolveGrid(slots);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('resolving twice does not compound — the effect is applied once', () => {
    const slots = build('riveter', 'battery');
    const once = resolveGrid(slots).weapons[0].stats.fireRate;
    // Re-resolving from the same input must give the same number, not 1.5625.
    for (let i = 0; i < 10; i++) {
      expect(resolveGrid(slots).weapons[0].stats.fireRate).toBeCloseTo(once);
    }
    expect(once).toBeCloseTo(1.25);
  });

  it('caps runaway stacking', () => {
    // A weapon at cell 2 touches 0, 3 and 4 — three batteries.
    const res = resolveGrid(build('battery', null, 'riveter', 'battery', 'battery'));
    expect(res.weapons[0].stats.fireRate).toBeLessThanOrEqual(2.4);
    expect(res.weapons[0].stats.fireRate).toBeCloseTo(1.75);
  });

  it('flags a module that touches no weapon', () => {
    const res = resolveGrid(build('riveter', null, null, null, null, 'battery'));
    expect(res.idleModules).toEqual([5]);
  });

  it('does not flag a self-effect-only module as idle when it has no neighbour rule', () => {
    // The magnet does have a neighbour rule, so alone it counts as idle, but
    // its self-effect still applies.
    const res = resolveGrid(build(null, null, null, null, null, 'magnet'));
    expect(res.player.pickupRadius).toBe(MODULES.magnet.self!.pickupRadius);
    expect(res.idleModules).toEqual([5]);
  });

  it('sums module self-effects independently of layout', () => {
    const a = resolveGrid(build('repair', 'magnet'));
    const b = resolveGrid(build(null, null, 'repair', null, 'magnet'));
    expect(a.player.regen).toBe(b.player.regen);
    expect(a.player.maxHp).toBe(b.player.maxHp);
  });
});

describe('weaponRuntime', () => {
  it('turns a fire-rate bonus into a shorter cooldown', () => {
    const bare = weaponRuntime(resolveGrid(build('riveter')).weapons[0]);
    const fed = weaponRuntime(resolveGrid(build('riveter', 'battery')).weapons[0]);
    expect(bare.cooldown).toBeCloseTo(WEAPONS.riveter.base.cooldown);
    expect(fed.cooldown).toBeCloseTo(WEAPONS.riveter.base.cooldown / 1.25);
    expect(fed.cooldown).toBeLessThan(bare.cooldown);
  });

  it('adds projectiles from a feeder and subtracts its damage penalty', () => {
    const rt = weaponRuntime(resolveGrid(build('riveter', 'feeder')).weapons[0]);
    expect(rt.projectiles).toBe(WEAPONS.riveter.base.projectiles + 1);
    expect(rt.damage).toBeLessThan(WEAPONS.riveter.base.damage);
  });

  it('reduces heat with a heatsink', () => {
    const bare = weaponRuntime(resolveGrid(build('beam')).weapons[0]);
    const cooled = weaponRuntime(resolveGrid(build('beam', 'heatsink')).weapons[0]);
    expect(cooled.heatGain).toBeLessThan(bare.heatGain);
    expect(cooled.cooling).toBeGreaterThan(bare.cooling);
  });

  it('applies the global workshop damage multiplier on top', () => {
    const rw = resolveGrid(build('riveter')).weapons[0];
    expect(weaponRuntime(rw, 1.2).damage).toBeCloseTo(WEAPONS.riveter.base.damage * 1.2);
  });
});

describe('placement', () => {
  it('returns the displaced part rather than destroying it', () => {
    const slots = build('riveter', 'battery');
    const { slots: next, displaced } = placeGear(slots, 1, 'coil');
    expect(displaced).toBe('battery');
    expect(next[1]).toBe('coil');
    expect(slots[1]).toBe('battery');   // original untouched
  });

  it('swaps two cells without losing anything', () => {
    const slots = build('riveter', 'battery', 'coil');
    const next = swapCells(slots, 0, 2);
    expect(next[0]).toBe('coil');
    expect(next[2]).toBe('riveter');
    expect(next.filter(Boolean)).toHaveLength(3);
  });

  it('swapping with an empty cell keeps the part', () => {
    const next = swapCells(build('riveter'), 0, 5);
    expect(next[5]).toBe('riveter');
    expect(next[0]).toBeNull();
    expect(next.filter(Boolean)).toHaveLength(1);
  });

  it('previews the exact before/after for a placement', () => {
    const diffs = previewPlacement(build('riveter'), 1, 'battery');
    expect(diffs).toHaveLength(1);
    const change = diffs[0].changes.find((c) => c.stat === 'fireRate');
    expect(change).toBeDefined();
    expect(change!.before).toBe(1);
    expect(change!.after).toBeCloseTo(1.25);
  });

  it('previewing does not mutate the panel', () => {
    const slots = build('riveter');
    const snapshot = JSON.stringify(slots);
    previewPlacement(slots, 1, 'battery');
    previewPlacement(slots, 3, 'coil');
    expect(JSON.stringify(slots)).toBe(snapshot);
  });

  it('previews a removal as well as an addition', () => {
    const diffs = previewPlacement(build('riveter', 'battery'), 1, null);
    const change = diffs[0].changes.find((c) => c.stat === 'fireRate');
    expect(change!.before).toBeCloseTo(1.25);
    expect(change!.after).toBe(1);
  });
});
