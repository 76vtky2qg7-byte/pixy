# Balance

All numbers live in `src/config/`. Nothing in `src/sim` or `src/render`
hard-codes a balance value. `BALANCE_VERSION` in `src/config/balance.ts` is
stamped into every analytics event so a session can be attributed to the tuning
pass that produced it. It is currently **3**.

The tables below are produced by a headless harness, not written by hand:

```bash
npx vite-node tools/sim/report.ts
```

The harness runs the real simulation with a scripted bot that keeps away from
bodies, steps out of telegraphed rings, dodges incoming shots and drifts toward
loot (`tools/sim/bot.ts`). It is a **measuring instrument, not a claim about how
the game feels** — a person plays better in some ways (target priority, reading
a boss) and worse in others (reaction time). Read the clear rates as relative
comparisons between builds, not as predicted human win rates.

---

## Income and prices

### Two currencies, deliberately separate

| | Scrap (`лом`) | Credits (`кредиты`) |
|---|---|---|
| Earned | inside a contract, from kills and wave bonuses | at the end of a contract |
| Spent on | weapons and modules in the shop | permanent upgrades, unlocking the second robot |
| Survives the contract? | **No** — reset every attempt | **Yes** — saved forever |
| Shown | only during a contract | only in the menu, workshop and results |

They are never shown side by side except on the results screen, where the
transition from one to the other is the point.

### Scrap

| Source | Amount |
|---|---|
| Kill | 1–5 per enemy type (`ENEMIES[*].scrap`), ×contract multiplier ×Fence upgrade |
| Wave cleared | 14 + 5 per wave index |
| Boss killed | 40 (Press Mother) / 55 (Arc Sovereign) plus a burst of scrap and a repair cell |
| Leftover on the floor | swept into your total when the wave ends — a good wave is never taxed for ending at the wrong moment |

### Prices

| Item | Base | Note |
|---|---|---|
| Riveter | 0 | the starting weapon; growth never makes it cost |
| Magnet | 18 | |
| Heatsink | 20 | |
| Battery | 22 | |
| Piston | 24 | |
| Buzzsaw, Targeter, Repair Loop | 26 | |
| Coil | 28 | |
| Feeder | 30 | |
| Arc Emitter | 32 | |
| Mag Hammer | 34 | |
| Shrapnel Mortar | 36 | |
| Cutter Beam | 38 | |

Prices grow **+9% per wave index**, so the same module costs more late in a
contract. Selling anything back returns **50%**, rounded down. The shop offers
**4 items** per visit; the **first reroll each wave is free**, then 8, then 14,
then 20.

### Credits

| Source | Amount |
|---|---|
| Each wave cleared | 6 |
| Machines scrapped | 1 per 10 kills |
| Contract completed | +40 |
| Difficulty | +25% of the above per tier (contract 2 = ×1.25, contract 3 = ×1.5) |
| Failed attempt | half rate, with a floor of 5 — an attempt always pays something |
| Rewarded video | ×2 the total, at most once per finished contract, entirely optional |

The kill component and the floor exist because a first-ever attempt that died in
wave one used to pay literally zero, which reads as "that was a waste of four
minutes" — and it made the rewarded-video button offer to double nothing.

---

## Permanent upgrades

Eight lines, all capped. Fully maxed they cost **2,655 credits** and add roughly
a third to survivability and a fifth to damage.

| Upgrade | Levels | Per level | Costs | Maxed |
|---|---|---|---|---|
| Reinforced Hull | 5 | +9 max HP | 30/55/90/140/210 | +45 HP (+41%) |
| Servos | 4 | +4% speed | 35/65/110/175 | +16% |
| Field Welder | 3 | +0.18 HP/s | 50/100/180 | +0.54 HP/s |
| Grapple Coil | 4 | +13% pickup radius | 25/45/75/120 | +52% |
| Fence | 4 | +8% scrap | 40/75/125/195 | +32% |
| Calibration | 5 | +4% weapon damage | 45/80/130/200/290 | +20% |
| Jumpstart | 3 | +12 starting scrap | 30/60/105 | +36 scrap |
| Backup Cell | 1 | one revive per contract at 40% HP | 320 | — |
| **Volt-9 robot** | — | second frame | 260 | — |

**Intent:** these shorten the gap between a first attempt and a first clear; they
do not replace choosing gear well. The tables below show that a weak panel
(build C) still fails the hardest content at maximum upgrades, while a good
panel (build D) clears contract 1 with no upgrades at all.

**First-purchase pacing:** a first attempt that reaches wave 4 of contract 1 and
loses pays roughly 6×3 + kills/10 + floor ≈ 25–35 credits. The cheapest useful
line (Grapple Coil, 25) is affordable immediately, and Reinforced Hull (30) after
one more attempt — meeting the "first permanent purchase after the first
attempt with visible progress" target. From there a purchase lands roughly every
1–3 completed attempts until the expensive tails.

---

## Combinations

These are **not special-cased anywhere**. Each one is just what the generic
adjacency rules already do when those two pieces sit side by side. Naming them
gives players a vocabulary for what they are discovering.

| Name | Pair | What it does |
|---|---|---|
| Rivet Storm | Riveter + Battery | +25% fire rate on an already fast weapon |
| Scattergun | Riveter + Feeder | +1 projectile in a spread, −12% damage each |
| Chain Saw | Buzzsaw + Coil | the orbiting blade's hits jump to a second target |
| Siege Mortar | Mortar + Targeter | +20% damage and +25% range on the heaviest hit |
| Open Beam | Beam + Heatsink | −45% heat lets the beam run without overheating |
| Armour Breaker | Hammer + Piston | +4 armour pierce and doubled knockback |
| Storm Arc | Arc Emitter + Coil | 3 jumps instead of 2 |
| Salvage Saw | Buzzsaw + Magnet | +20% scrap from everything the blade kills |

### Why no infinite loops are possible

Modules affect **weapons only**, never other modules. The effect graph is
therefore bipartite and exactly one level deep: there is no path by which a
module's output can return to its own input. Resolution is a **single pass** with
no fixed point to converge on, and `resolveGrid` is a pure function of the slot
array — calling it ten times returns the same numbers, which is asserted in
`src/tests/grid.test.ts`.

Stacking is still bounded. A weapon in a middle cell touches at most three
modules (four in no reachable layout on a 2×3 grid), and `STAT_CAPS` bounds every
resolved stat regardless: damage ×0.3–2.6, fire rate ×0.4–2.4, projectiles 1–5,
chain 0–4, armour pierce 0–12.

---

## Heat

Every weapon builds heat. At 100 it overheats and fires at **1/2.2 speed** until
heat falls back to 50, and dissipation itself slows to 70% while overheated.
Base cooling is 24/second.

This is what makes the Heatsink a real choice rather than a stat stick: the
Cutter Beam generates 2.9 heat per 0.1s tick and cannot run continuously without
one, while the Riveter at 5 heat per shot rarely needs one at all.

---

## Difficulty scaling

| | Per wave index | Per contract tier |
|---|---|---|
| Enemy HP | +16% | +18% |
| Enemy damage | +8.5% | +10% |
| Enemy speed | +1.2% | — |

Bosses take the **tier** curve but not the per-wave curve, because they are
hand-tuned per contract.

Boss telegraph windows are set so a robot at base speed can always clear the
ring: `(attackRadius + player radius) / telegraph ≤ player speed`. The Press
Mother's slam is radius 88 with a 1.2s wind-up, which needs 82 px/s against a
126 px/s robot. An earlier tuning pass had radius 112 at 1.05s — 117 px/s, which
was effectively undodgeable and read as unfair rather than hard.

Armour subtracts flat damage but **never below 25% of the raw hit**. Without that
floor, a 4-armour Bulwark reduced the Cutter Beam's 2.6-damage tick to literally
1, which reads as the weapon being broken rather than as a reason to fit a
Piston.

---

## Identified dominant strategies and risks

| Risk | Assessment |
|---|---|
| **Three weapons + three modules beats two weapons + four modules.** | Confirmed: build D outperforms every other panel in the tables below. It is not degenerate — it requires 3 weapon purchases at 32–36 scrap each and gives up all defensive self-effects (Repair Loop, Magnet), so it wins fights and loses to attrition. Watch it. |
| **Mortar + Targeter is the strongest single pair.** | Highest single-target and cluster damage in the game. Balanced by 2.05s cooldown, 21 heat per shot and 36 scrap. |
| **Melee-only panels are weak.** | Build C (Beam + Hammer) fails the hardest content even at maximum upgrades. This is a real weakness, not a bug: both weapons are short-ranged, and the game rewards mixed range. Acceptable, but if players gravitate to it, Mag Hammer needs a range or damage pass. |
| **Repair Loop could trivialise attrition.** | Capped at +0.6 HP/s and +10 max HP, with a −5% damage penalty on neighbours. It does not out-heal a wave-5 crowd. |
| **Magnet economy snowball.** | +20% scrap per adjacent weapon, capped at +100% by `STAT_CAPS.scrapBonus`. Reaching the cap costs cells that would otherwise hold damage. |
| **Overdrive uptime.** | Sparks drop from 50% of kills at 6 charge each, needing ~17 kills for 6 seconds of +30% damage and −45% cooldown. Rises with kill rate, which is intended: it rewards clearing crowds. |

**The known difficulty peak** is the final boss of contract 3 (Arc Sovereign at
tier 2). Even a strong build with maximum upgrades clears it about 3 times in 5
with the scripted bot. That is the intended ceiling of the release content, but
it is the first thing to soften if players stall there.

---

## Wave clear rate by build (5 seeds each, scripted bot)

### 1. night_shift — 6 waves, tier 0

| build | upgrades | wave | cleared | time | HP left | kills | scrap |
|---|---|---|---|---|---|---|---|
| starter (riveter only) | none | 1 | 5/5 | 38.8s | 110/110 | 16 | 32 |
| starter (riveter only) | none | 4 | 2/5 | 40.6s | 17/110 | 29.8 | 47.4 |
| starter (riveter only) | none | 6 (boss) | 1/5 | 69.8s | 12/110 | 52.6 | 81.8 |
| A rivet storm | none | 1 | 5/5 | 38.8s | 110/110 | 16 | 32 |
| A rivet storm | none | 4 | 5/5 | 46.8s | 85.2/110 | 39.8 | 86.6 |
| A rivet storm | none | 6 (boss) | 5/5 | 35.5s | 63.4/110 | 37.4 | 175.2 |
| B saw + mortar | none | 1 | 5/5 | 38.8s | 110/110 | 16 | 32 |
| B saw + mortar | none | 4 | 5/5 | 46.8s | 94.6/110 | 40 | 91.8 |
| B saw + mortar | none | 6 (boss) | 5/5 | 22.8s | 78.4/110 | 19.8 | 148.2 |
| C beam + breaker | none | 1 | 5/5 | 38.8s | 110/110 | 16 | 32 |
| C beam + breaker | none | 4 | 5/5 | 46.8s | 74.2/110 | 39.2 | 78.2 |
| C beam + breaker | none | 6 (boss) | 4/5 | 53.2s | 59.2/110 | 45.8 | 153.8 |
| D three weapons | none | 1 | 5/5 | 38.8s | 110/110 | 16 | 32 |
| D three weapons | none | 4 | 5/5 | 46.8s | 103.2/110 | 39.8 | 80.4 |
| D three weapons | none | 6 (boss) | 5/5 | 18.6s | 106/110 | 14.6 | 141.2 |
| starter (riveter only) | mid | 1 | 5/5 | 38.8s | 128/128 | 16 | 32 |
| starter (riveter only) | mid | 4 | 3/5 | 42.3s | 26.8/128 | 33 | 66.8 |
| starter (riveter only) | mid | 6 (boss) | 5/5 | 71.8s | 43/128 | 55.8 | 200.8 |
| A rivet storm | mid | 1 | 5/5 | 38.8s | 128/128 | 16 | 32 |
| A rivet storm | mid | 4 | 5/5 | 46.8s | 84.8/128 | 39.8 | 92.4 |
| A rivet storm | mid | 6 (boss) | 5/5 | 33.6s | 99.8/128 | 34.8 | 179 |
| B saw + mortar | mid | 1 | 5/5 | 38.8s | 128/128 | 16 | 35.4 |
| B saw + mortar | mid | 4 | 5/5 | 46.8s | 114.8/128 | 40 | 99 |
| B saw + mortar | mid | 6 (boss) | 5/5 | 22.9s | 119/128 | 22.2 | 164.2 |
| C beam + breaker | mid | 1 | 5/5 | 38.8s | 128/128 | 16 | 32 |
| C beam + breaker | mid | 4 | 5/5 | 46.8s | 85.6/128 | 38.6 | 91.8 |
| C beam + breaker | mid | 6 (boss) | 5/5 | 54s | 102.4/128 | 47 | 196.6 |
| D three weapons | mid | 1 | 5/5 | 38.8s | 128/128 | 16 | 32 |
| D three weapons | mid | 4 | 5/5 | 46.8s | 114/128 | 40 | 84.2 |
| D three weapons | mid | 6 (boss) | 5/5 | 19.5s | 120.6/128 | 18 | 152.2 |
| starter (riveter only) | max | 1 | 5/5 | 38.8s | 155/155 | 16 | 48 |
| starter (riveter only) | max | 4 | 5/5 | 46.8s | 74.2/155 | 39 | 110.6 |
| starter (riveter only) | max | 6 (boss) | 5/5 | 66.2s | 105.2/155 | 53 | 236.2 |
| A rivet storm | max | 1 | 5/5 | 38.8s | 155/155 | 16 | 48 |
| A rivet storm | max | 4 | 5/5 | 46.8s | 129.6/155 | 39.4 | 114.2 |
| A rivet storm | max | 6 (boss) | 5/5 | 26.4s | 137.4/155 | 26 | 182.8 |
| B saw + mortar | max | 1 | 5/5 | 38.8s | 155/155 | 16 | 48 |
| B saw + mortar | max | 4 | 5/5 | 46.8s | 144.6/155 | 40 | 127 |
| B saw + mortar | max | 6 (boss) | 5/5 | 19.6s | 121.8/155 | 17 | 174.6 |
| C beam + breaker | max | 1 | 5/5 | 38.8s | 155/155 | 16 | 48 |
| C beam + breaker | max | 4 | 5/5 | 46.8s | 90/155 | 38.8 | 111.8 |
| C beam + breaker | max | 6 (boss) | 5/5 | 46.6s | 146.2/155 | 44.2 | 222 |
| D three weapons | max | 1 | 5/5 | 38.8s | 155/155 | 16 | 48 |
| D three weapons | max | 4 | 5/5 | 46.8s | 153.6/155 | 40 | 110.6 |
| D three weapons | max | 6 (boss) | 5/5 | 17.2s | 148.8/155 | 13.4 | 155.6 |

### 2. foundry_rush — 7 waves, tier 1

| build | upgrades | wave | cleared | time | HP left | kills | scrap |
|---|---|---|---|---|---|---|---|
| starter (riveter only) | none | 1 | 5/5 | 40.8s | 110/110 | 24 | 42.4 |
| starter (riveter only) | none | 4 | 5/5 | 48.8s | 95.2/110 | 34 | 68.8 |
| starter (riveter only) | none | 7 (boss) | 0/5 | 31.7s | 0/110 | 22.4 | 23.2 |
| A rivet storm | none | 1 | 5/5 | 40.8s | 110/110 | 24 | 42 |
| A rivet storm | none | 4 | 5/5 | 48.8s | 110/110 | 48 | 153.2 |
| A rivet storm | none | 7 (boss) | 0/5 | 31.9s | 0/110 | 26.4 | 27.6 |
| B saw + mortar | none | 1 | 5/5 | 40.8s | 110/110 | 24 | 53 |
| B saw + mortar | none | 4 | 5/5 | 48.8s | 110/110 | 50 | 182.4 |
| B saw + mortar | none | 7 (boss) | 2/5 | 31.7s | 16.6/110 | 28.2 | 135.2 |
| C beam + breaker | none | 1 | 5/5 | 40.8s | 110/110 | 24 | 46.4 |
| C beam + breaker | none | 4 | 5/5 | 48.8s | 106.2/110 | 44.2 | 131.6 |
| C beam + breaker | none | 7 (boss) | 1/5 | 47.7s | 4.2/110 | 32.4 | 70.8 |
| D three weapons | none | 1 | 5/5 | 40.8s | 110/110 | 24 | 42.4 |
| D three weapons | none | 4 | 5/5 | 48.8s | 110/110 | 50 | 168.2 |
| D three weapons | none | 7 (boss) | 4/5 | 21.6s | 52.2/110 | 14.4 | 167 |
| starter (riveter only) | mid | 1 | 5/5 | 40.8s | 128/128 | 24 | 56.2 |
| starter (riveter only) | mid | 4 | 5/5 | 48.8s | 128/128 | 38.4 | 123 |
| starter (riveter only) | mid | 7 (boss) | 0/5 | 48.2s | 0/128 | 31.8 | 66.6 |
| A rivet storm | mid | 1 | 5/5 | 40.8s | 128/128 | 24 | 59 |
| A rivet storm | mid | 4 | 5/5 | 48.8s | 128/128 | 49.4 | 207.8 |
| A rivet storm | mid | 7 (boss) | 2/5 | 32.6s | 10.4/128 | 28.8 | 162.2 |
| B saw + mortar | mid | 1 | 5/5 | 40.8s | 128/128 | 24 | 61.4 |
| B saw + mortar | mid | 4 | 5/5 | 48.8s | 128/128 | 50 | 215.4 |
| B saw + mortar | mid | 7 (boss) | 4/5 | 31.8s | 39.6/128 | 25.2 | 218 |
| C beam + breaker | mid | 1 | 5/5 | 40.8s | 128/128 | 24 | 57.8 |
| C beam + breaker | mid | 4 | 5/5 | 48.8s | 128/128 | 47.2 | 185.6 |
| C beam + breaker | mid | 7 (boss) | 1/5 | 50s | 4.2/128 | 35 | 121 |
| D three weapons | mid | 1 | 5/5 | 40.8s | 128/128 | 24 | 59.4 |
| D three weapons | mid | 4 | 5/5 | 48.8s | 128/128 | 50 | 205.2 |
| D three weapons | mid | 7 (boss) | 5/5 | 19.3s | 91/128 | 13.4 | 228.2 |
| starter (riveter only) | max | 1 | 5/5 | 40.8s | 155/155 | 24 | 57.2 |
| starter (riveter only) | max | 4 | 5/5 | 48.8s | 151.2/155 | 36 | 117.4 |
| starter (riveter only) | max | 7 (boss) | 1/5 | 80.3s | 7.6/155 | 48.6 | 173.2 |
| A rivet storm | max | 1 | 5/5 | 40.8s | 155/155 | 24 | 56.8 |
| A rivet storm | max | 4 | 5/5 | 48.8s | 155/155 | 49.8 | 218.8 |
| A rivet storm | max | 7 (boss) | 5/5 | 22.9s | 80.6/155 | 17.6 | 254.4 |
| B saw + mortar | max | 1 | 5/5 | 40.8s | 155/155 | 24 | 62 |
| B saw + mortar | max | 4 | 5/5 | 48.8s | 155/155 | 50 | 231 |
| B saw + mortar | max | 7 (boss) | 5/5 | 25.9s | 91.6/155 | 21.4 | 261 |
| C beam + breaker | max | 1 | 5/5 | 40.8s | 155/155 | 24 | 59 |
| C beam + breaker | max | 4 | 5/5 | 48.8s | 155/155 | 45.2 | 184.2 |
| C beam + breaker | max | 7 (boss) | 5/5 | 60.4s | 57.6/155 | 43.6 | 338.4 |
| D three weapons | max | 1 | 5/5 | 40.8s | 155/155 | 24 | 57.2 |
| D three weapons | max | 4 | 5/5 | 48.8s | 155/155 | 50 | 232.8 |
| D three weapons | max | 7 (boss) | 5/5 | 18.4s | 91/155 | 14.4 | 245.2 |

### 3. arc_quarantine — 8 waves, tier 2

| build | upgrades | wave | cleared | time | HP left | kills | scrap |
|---|---|---|---|---|---|---|---|
| starter (riveter only) | none | 1 | 5/5 | 42.8s | 110/110 | 24.8 | 46.4 |
| starter (riveter only) | none | 5 | 0/5 | 40.4s | 0/110 | 14.2 | 19 |
| starter (riveter only) | none | 8 (boss) | 0/5 | 30.8s | 0/110 | 17.4 | 10.8 |
| A rivet storm | none | 1 | 5/5 | 42.8s | 110/110 | 27.8 | 62.6 |
| A rivet storm | none | 5 | 0/5 | 25.5s | 0/110 | 13.4 | 31 |
| A rivet storm | none | 8 (boss) | 0/5 | 29.1s | 0/110 | 16.8 | 14.2 |
| B saw + mortar | none | 1 | 5/5 | 42.8s | 110/110 | 28 | 70 |
| B saw + mortar | none | 5 | 0/5 | 33.8s | 0/110 | 25.8 | 67.4 |
| B saw + mortar | none | 8 (boss) | 0/5 | 26.9s | 0/110 | 14.2 | 13.2 |
| C beam + breaker | none | 1 | 5/5 | 42.8s | 110/110 | 27.6 | 63 |
| C beam + breaker | none | 5 | 0/5 | 30.2s | 0/110 | 14.2 | 26.4 |
| C beam + breaker | none | 8 (boss) | 0/5 | 40.4s | 0/110 | 19.6 | 18.2 |
| D three weapons | none | 1 | 5/5 | 42.8s | 110/110 | 28 | 65.6 |
| D three weapons | none | 5 | 1/5 | 30.2s | 11.4/110 | 24.2 | 64.8 |
| D three weapons | none | 8 (boss) | 0/5 | 31.7s | 0/110 | 20.6 | 21.6 |
| starter (riveter only) | mid | 1 | 5/5 | 42.8s | 128/128 | 25 | 51 |
| starter (riveter only) | mid | 5 | 3/5 | 42.4s | 4.8/128 | 13.4 | 27.2 |
| starter (riveter only) | mid | 8 (boss) | 0/5 | 35.5s | 0/128 | 16.8 | 12.4 |
| A rivet storm | mid | 1 | 5/5 | 42.8s | 128/128 | 28 | 64.8 |
| A rivet storm | mid | 5 | 2/5 | 42.1s | 8.6/128 | 23 | 68 |
| A rivet storm | mid | 8 (boss) | 0/5 | 34.6s | 0/128 | 19.6 | 25.8 |
| B saw + mortar | mid | 1 | 5/5 | 42.8s | 128/128 | 28 | 81.4 |
| B saw + mortar | mid | 5 | 2/5 | 41.2s | 16.6/128 | 35.8 | 135.8 |
| B saw + mortar | mid | 8 (boss) | 0/5 | 34.9s | 0/128 | 17.2 | 23.4 |
| C beam + breaker | mid | 1 | 5/5 | 42.8s | 128/128 | 27.8 | 75.4 |
| C beam + breaker | mid | 5 | 1/5 | 34.3s | 2.4/128 | 15 | 39.2 |
| C beam + breaker | mid | 8 (boss) | 0/5 | 41.5s | 0/128 | 21.8 | 21.6 |
| D three weapons | mid | 1 | 5/5 | 42.8s | 128/128 | 28 | 72.2 |
| D three weapons | mid | 5 | 1/5 | 37.7s | 0.4/128 | 36.8 | 116.4 |
| D three weapons | mid | 8 (boss) | 0/5 | 30.4s | 0/128 | 16.6 | 20 |
| starter (riveter only) | max | 1 | 5/5 | 42.8s | 155/155 | 27.4 | 79 |
| starter (riveter only) | max | 5 | 5/5 | 48.8s | 30.8/155 | 19.6 | 68.8 |
| starter (riveter only) | max | 8 (boss) | 0/5 | 89.3s | 0/155 | 46.2 | 68.8 |
| A rivet storm | max | 1 | 5/5 | 42.8s | 155/155 | 27.8 | 84.6 |
| A rivet storm | max | 5 | 3/5 | 44.8s | 29.4/155 | 39.2 | 170.4 |
| A rivet storm | max | 8 (boss) | 2/5 | 64.8s | 21.4/155 | 42.2 | 185.4 |
| B saw + mortar | max | 1 | 5/5 | 42.8s | 155/155 | 28 | 103.4 |
| B saw + mortar | max | 5 | 5/5 | 48.8s | 65.2/155 | 52.2 | 244.2 |
| B saw + mortar | max | 8 (boss) | 3/5 | 57s | 23.2/155 | 37.2 | 248.2 |
| C beam + breaker | max | 1 | 5/5 | 42.8s | 155/155 | 28 | 93.2 |
| C beam + breaker | max | 5 | 5/5 | 48.8s | 37.8/155 | 28.2 | 112.6 |
| C beam + breaker | max | 8 (boss) | 0/5 | 84.2s | 0/155 | 49 | 87.2 |
| D three weapons | max | 1 | 5/5 | 42.8s | 155/155 | 27.6 | 89.2 |
| D three weapons | max | 5 | 5/5 | 48.8s | 94.8/155 | 53.6 | 241 |
| D three weapons | max | 8 (boss) | 3/5 | 38.1s | 30.8/155 | 28.8 | 193 |

## Contract length

| contract | waves | combat seconds | + prep (est. 25s/visit) | total |
|---|---|---|---|---|
| night_shift | 6 | 272s | 150s | 7m 2s |
| foundry_rush | 7 | 330s | 175s | 8m 25s |
| arc_quarantine | 8 | 382s | 200s | 9m 42s |

## Scrap income per wave (build B, mid upgrades)

| contract | wave | scrap collected | clear bonus | total |
|---|---|---|---|---|
| night_shift | 1 | 35.3 | ~14 | ~49 |
| night_shift | 3 | 60.7 | ~24 | ~85 |
| night_shift | 5 | 157 | ~34 | ~191 |
| foundry_rush | 1 | 61 | ~14 | ~75 |
| foundry_rush | 3 | 154 | ~24 | ~178 |
| foundry_rush | 5 | 261.3 | ~34 | ~295 |
| foundry_rush | 7 | 190 | ~44 | ~234 |
| arc_quarantine | 1 | 93.3 | ~14 | ~107 |
| arc_quarantine | 3 | 171 | ~24 | ~195 |
| arc_quarantine | 5 | 147.3 | ~34 | ~181 |
| arc_quarantine | 7 | 109.3 | ~44 | ~153 |

## Worst simulation step observed (ms, 60Hz budget is 16.7)

worst single step across every wave of every contract: 0.48 ms
shop slots per visit: 4, first reroll free

---

## Measured performance

Measured with `node tools/e2e/perf.mjs` against the production build, in
headless Chromium with SwiftShader **software** rendering, in a cloud container.
These are a floor, not a phone number — see `TEST_REPORT.md` for what that does
and does not tell you.

| Condition | Resolution | FPS | Frames > 33 ms | Peak load |
|---|---|---|---|---|
| Normal play, contract 3 wave 7 | 390×844 @ dsf 3 | 60.0 | 0 | 26 enemies / 12 projectiles |
| Normal play, contract 3 wave 7 | 1366×768 @ dsf 1 | 60.0 | 0 | 26 enemies / 12 projectiles |
| Held at the simultaneous-enemy cap | 390×844 @ dsf 3 | 58.3 | 1 / 1285 | 90 enemies / 15 projectiles |
| Held at the simultaneous-enemy cap | 1366×768 @ dsf 1 | 59.7 | 0 / 1316 | 90 enemies / 18 projectiles |

Object pools reported **zero overflow** in every run, and the fixed-step clock
dropped zero frames.

The simulation itself, measured separately in Node across every wave of every
contract with a full panel and maximum upgrades, peaks at **0.48 ms per step**
against a 16.7 ms budget. Rendering, not simulation, is the cost centre.

Protections that keep this true: a hard cap of 90 simultaneous enemies, fixed
capacity pools (220 enemies / 420 projectiles / 320 pickups) that refuse to
allocate rather than growing, a 64-sprite effect budget and a 24-item damage
number budget that drop new requests when full, and a spatial hash for every
proximity query.
