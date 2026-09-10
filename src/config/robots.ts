import type { GearId } from './gear';

export type RobotId = 'scrap14' | 'volt9';

export interface RobotDef {
  id: RobotId;
  /** Frame pair in assets/actors.png. */
  frames: [number, number];
  maxHp: number;
  speed: number;
  /** Scrap the robot carries into wave 1. */
  startingScrap: number;
  /** Gear pre-installed at the start of a contract, keyed by cell index. */
  loadout: { cell: number; gear: GearId }[];
  /** Credits needed to unlock. Zero means available from the first session. */
  unlockCost: number;
}

export const ROBOTS: Record<RobotId, RobotDef> = {
  // Tougher, slower, starts with a plain weapon and nothing else.
  scrap14: {
    id: 'scrap14', frames: [0, 1],
    maxHp: 110, speed: 126, startingScrap: 20,
    loadout: [{ cell: 0, gear: 'riveter' }],
    unlockCost: 0,
  },
  // Fragile and quick, but opens with a weapon already wired to a battery —
  // it starts the run mid-combo, which teaches the panel by example.
  volt9: {
    id: 'volt9', frames: [2, 3],
    maxHp: 82, speed: 152, startingScrap: 12,
    loadout: [{ cell: 0, gear: 'riveter' }, { cell: 1, gear: 'battery' }],
    unlockCost: 260,
  },
};

export const ROBOT_IDS = Object.keys(ROBOTS) as RobotId[];
