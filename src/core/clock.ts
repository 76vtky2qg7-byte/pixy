/**
 * Fixed-timestep accumulator. The simulation only ever advances in `step`
 * increments, which is what makes wave replays and the unit tests deterministic.
 *
 * A frame that arrives after the tab was backgrounded is clamped, so returning
 * from the background never fast-forwards the fight.
 */
export const SIM_STEP = 1 / 60;
const MAX_FRAME = 0.25; // never simulate more than a quarter second per frame

export class Clock {
  private acc = 0;
  /** Number of steps skipped by clamping; surfaced for diagnostics. */
  dropped = 0;

  /** Feed a raw frame delta in seconds; returns how many sim steps to run. */
  advance(dtSeconds: number): number {
    if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return 0;
    if (dtSeconds > MAX_FRAME) {
      this.dropped += Math.round((dtSeconds - MAX_FRAME) / SIM_STEP);
      dtSeconds = MAX_FRAME;
    }
    this.acc += dtSeconds;
    let steps = 0;
    while (this.acc >= SIM_STEP) {
      this.acc -= SIM_STEP;
      steps++;
    }
    return steps;
  }

  /** Drop any partial accumulation, e.g. after unpausing. */
  reset(): void {
    this.acc = 0;
  }
}
