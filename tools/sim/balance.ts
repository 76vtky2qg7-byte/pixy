/**
 * Headless balance harness. Runs scripted builds through waves and prints the
 * numbers that go into BALANCE.md. Deterministic: same seeds, same table.
 *
 *   npx vite-node tools/sim/balance.ts
 */
import { World } from '../../src/sim/world';
import { CONTRACTS } from '../../src/config/contracts';
import { ROBOTS, type RobotId } from '../../src/config/robots';
import { workshopBonuses, type UpgradeLevels } from '../../src/config/upgrades';
import { emptySlots, type Slots } from '../../src/sim/grid';
import type { GearId } from '../../src/config/gear';
import { driveBot } from './bot';

export interface RunResult {
  outcome: string;
  seconds: number;
  hp: number;
  maxHp: number;
  kills: number;
  scrap: number;
  overflow: number;
  worstStepMs: number;
}

export function build(...gear: (GearId | null)[]): Slots {
  const s = emptySlots();
  gear.forEach((g, i) => { if (g) s[i] = g; });
  return s;
}

export function runWave(
  contractIdx: number, waveIndex: number, slots: Slots,
  robot: RobotId = 'scrap14', levels: UpgradeLevels = {}, seed = 1234,
): RunResult {
  const w = new World({
    contract: CONTRACTS[contractIdx],
    waveIndex,
    slots,
    robot: { maxHp: ROBOTS[robot].maxHp, speed: ROBOTS[robot].speed },
    workshop: workshopBonuses(levels),
    seed,
  });
  w.viewRadius = 430;
  let steps = 0;
  let worst = 0;
  const cap = 60 * 240;
  while (w.outcome === 'running' && steps < cap) {
    driveBot(w);
    const t0 = performance.now();
    w.step();
    const dt = performance.now() - t0;
    if (dt > worst) worst = dt;
    w.events.length = 0;
    steps++;
  }
  return {
    outcome: w.outcome,
    seconds: +(steps / 60).toFixed(1),
    hp: Math.round(w.hp),
    maxHp: w.maxHp,
    kills: w.kills,
    scrap: w.scrapEarned,
    overflow: w.stats().overflow,
    worstStepMs: +worst.toFixed(2),
  };
}

/** Average a run over several seeds so one unlucky spawn does not mislead. */
export function average(
  contractIdx: number, waveIndex: number, slots: Slots,
  robot: RobotId = 'scrap14', levels: UpgradeLevels = {}, seeds = [11, 22, 33, 44, 55],
): RunResult & { winRate: number } {
  const rs = seeds.map((s) => runWave(contractIdx, waveIndex, slots, robot, levels, s));
  const n = rs.length;
  const avg = (f: (r: RunResult) => number) => +(rs.reduce((a, r) => a + f(r), 0) / n).toFixed(1);
  return {
    outcome: `${rs.filter((r) => r.outcome === 'cleared').length}/${n}`,
    winRate: rs.filter((r) => r.outcome === 'cleared').length / n,
    seconds: avg((r) => r.seconds),
    hp: avg((r) => r.hp),
    maxHp: rs[0].maxHp,
    kills: avg((r) => r.kills),
    scrap: avg((r) => r.scrap),
    overflow: rs.reduce((a, r) => a + r.overflow, 0),
    worstStepMs: Math.max(...rs.map((r) => r.worstStepMs)),
  };
}
