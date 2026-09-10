/**
 * Produces the tables in BALANCE.md. Deterministic — same seeds, same output.
 *   npx vite-node tools/sim/report.ts
 */
import { average, build, runWave } from './balance';
import { CONTRACTS } from '../../src/config/contracts';
import { SHOP, WAVE } from '../../src/config/balance';
import type { UpgradeLevels } from '../../src/config/upgrades';

const MID: UpgradeLevels = { hull: 2, servos: 2, welder: 1, grapple: 2, fence: 2, calibration: 2 };
const MAX: UpgradeLevels = {
  hull: 5, servos: 4, welder: 3, grapple: 4, fence: 4, calibration: 5, jumpstart: 3, backup: 1,
};

const BUILDS: [string, ReturnType<typeof build>][] = [
  ['starter (riveter only)', build('riveter')],
  ['A rivet storm', build('riveter', 'battery', 'riveter', 'targeter')],
  ['B saw + mortar', build('buzzsaw', 'coil', 'mortar', 'targeter', 'riveter', 'magnet')],
  ['C beam + breaker', build('beam', 'heatsink', 'hammer', 'piston', 'riveter', 'battery')],
  ['D three weapons', build('mortar', 'battery', 'arc', 'coil', 'riveter', 'targeter')],
];

console.log('## Wave clear rate by build (5 seeds each, scripted bot)\n');
for (const [ci, c] of CONTRACTS.entries()) {
  console.log(`### ${ci + 1}. ${c.id} — ${c.waves.length} waves, tier ${c.tier}\n`);
  console.log('| build | upgrades | wave | cleared | time | HP left | kills | scrap |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const [lvlName, lvls] of [['none', {}], ['mid', MID], ['max', MAX]] as [string, UpgradeLevels][]) {
    for (const [name, slots] of BUILDS) {
      const probe = [0, Math.floor(c.waves.length / 2), c.waves.length - 1];
      for (const wi of probe) {
        const r = average(ci, wi, slots, 'scrap14', lvls);
        console.log(`| ${name} | ${lvlName} | ${wi + 1}${c.waves[wi].boss ? ' (boss)' : ''} | ${r.outcome} | ${r.seconds}s | ${r.hp}/${r.maxHp} | ${r.kills} | ${r.scrap} |`);
      }
    }
  }
  console.log('');
}

console.log('## Contract length\n');
console.log('| contract | waves | combat seconds | + prep (est. 25s/visit) | total |');
console.log('|---|---|---|---|---|');
for (const [ci, c] of CONTRACTS.entries()) {
  let combat = 0;
  for (let wi = 0; wi < c.waves.length; wi++) {
    if (c.waves[wi].duration > 0) combat += c.waves[wi].duration;
    else {
      // Boss waves end when the boss dies; measure with a competent build.
      const r = average(ci, wi, BUILDS[3][1], 'scrap14', MID, [11, 22, 33]);
      combat += r.seconds;
    }
  }
  const prep = (c.waves.length) * 25;
  const total = combat + prep;
  console.log(`| ${c.id} | ${c.waves.length} | ${Math.round(combat)}s | ${prep}s | ${Math.floor(total / 60)}m ${Math.round(total % 60)}s |`);
}

console.log('\n## Scrap income per wave (build B, mid upgrades)\n');
console.log('| contract | wave | scrap collected | clear bonus | total |');
console.log('|---|---|---|---|---|');
for (const [ci, c] of CONTRACTS.entries()) {
  for (let wi = 0; wi < c.waves.length; wi += 2) {
    const r = average(ci, wi, BUILDS[2][1], 'scrap14', MID, [11, 22, 33]);
    const bonus = Math.round(WAVE.clearBonusBase + WAVE.clearBonusPerWave * wi);
    console.log(`| ${c.id} | ${wi + 1} | ${r.scrap} | ~${bonus} | ~${Math.round(r.scrap + bonus)} |`);
  }
}

console.log('\n## Worst simulation step observed (ms, 60Hz budget is 16.7)\n');
let worst = 0;
for (const [ci, c] of CONTRACTS.entries()) {
  for (let wi = 0; wi < c.waves.length; wi++) {
    const r = runWave(ci, wi, BUILDS[2][1], 'scrap14', MAX, 7);
    worst = Math.max(worst, r.worstStepMs);
  }
}
console.log(`worst single step across every wave of every contract: ${worst.toFixed(2)} ms`);
console.log(`shop slots per visit: ${SHOP.slots}, first reroll free`);
