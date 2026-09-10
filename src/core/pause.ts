import { Emitter } from './emitter';

/**
 * Pause reasons are independent flags, not a counter and not a stack.
 * Closing an ad clears only `ad`; if the tab is still hidden or a menu is
 * still open the game stays paused. That is the single rule this class exists
 * to enforce.
 */
export type PauseReason = 'menu' | 'ad' | 'hidden' | 'system' | 'boot';

export interface PauseEvents extends Record<string, unknown> {
  changed: { paused: boolean; reasons: PauseReason[] };
}

export class PauseManager {
  readonly events = new Emitter<PauseEvents>();
  private reasons = new Set<PauseReason>();

  constructor(initial: PauseReason[] = []) {
    for (const r of initial) this.reasons.add(r);
  }

  get paused(): boolean {
    return this.reasons.size > 0;
  }

  get active(): PauseReason[] {
    return [...this.reasons].sort();
  }

  has(reason: PauseReason): boolean {
    return this.reasons.has(reason);
  }

  /** Idempotent: setting the same reason twice still requires one clear. */
  set(reason: PauseReason): void {
    if (this.reasons.has(reason)) return;
    const was = this.paused;
    this.reasons.add(reason);
    if (was !== this.paused) this.announce();
  }

  clear(reason: PauseReason): void {
    if (!this.reasons.delete(reason)) return;
    if (!this.paused) this.announce();
  }

  toggle(reason: PauseReason, on: boolean): void {
    if (on) this.set(reason);
    else this.clear(reason);
  }

  /** Only for teardown between scenes. */
  reset(initial: PauseReason[] = []): void {
    const was = this.paused;
    this.reasons.clear();
    for (const r of initial) this.reasons.add(r);
    if (was !== this.paused) this.announce();
  }

  private announce(): void {
    this.events.emit('changed', { paused: this.paused, reasons: this.active });
  }
}
