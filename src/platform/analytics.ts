import { BALANCE_VERSION } from '../config/balance';

/**
 * Analytics event interface.
 *
 * No collector is wired up: events are validated, stamped and buffered locally,
 * and a sink can be attached later. Nothing is transmitted anywhere by this
 * build, and no personal data is accepted — `attempt` is a random per-run id
 * generated on device.
 */
export type AnalyticsEvent =
  | { name: 'game_ready'; loadMs: number }
  | { name: 'tutorial_complete'; seconds: number }
  | { name: 'run_start'; contract: string; robot: string }
  | { name: 'wave_complete'; contract: string; wave: number; seconds: number; kills: number; scrap: number }
  | { name: 'run_end'; contract: string; won: boolean; wave: number; seconds: number; credits: number }
  | { name: 'upgrade_purchased'; upgrade: string; level: number; cost: number }
  | { name: 'gear_purchased'; gear: string; cell: number; cost: number }
  | { name: 'rewarded_offer'; placement: string }
  | { name: 'rewarded_complete'; placement: string; result: string };

export interface StampedEvent {
  name: string;
  attempt: string;
  balance: number;
  t: number;
  props: Record<string, string | number | boolean>;
}

export type AnalyticsSink = (event: StampedEvent) => void;

const MAX_BUFFER = 300;

export class Analytics {
  private attempt = randomAttemptId();
  private sink: AnalyticsSink | null = null;
  private buffer: StampedEvent[] = [];

  /** New attempt id per run, so waves can be grouped without identifying anyone. */
  newAttempt(): string {
    this.attempt = randomAttemptId();
    return this.attempt;
  }

  attach(sink: AnalyticsSink): void {
    this.sink = sink;
    for (const e of this.buffer.splice(0)) sink(e);
  }

  track(event: AnalyticsEvent): StampedEvent {
    const { name, ...rest } = event;
    const stamped: StampedEvent = {
      name,
      attempt: this.attempt,
      balance: BALANCE_VERSION,
      t: Date.now(),
      props: rest as Record<string, string | number | boolean>,
    };
    if (this.sink) this.sink(stamped);
    else {
      this.buffer.push(stamped);
      if (this.buffer.length > MAX_BUFFER) this.buffer.shift();
    }
    return stamped;
  }

  /** Everything recorded so far; used by the dev overlay and by tests. */
  drain(): StampedEvent[] {
    return this.buffer.slice();
  }
}

function randomAttemptId(): string {
  const buf = new Uint8Array(8);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(buf);
  else for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

export const analytics = new Analytics();
