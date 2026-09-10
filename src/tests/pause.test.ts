import { describe, expect, it, vi } from 'vitest';
import { Clock, SIM_STEP } from '../core/clock';
import { Emitter, Subscriptions } from '../core/emitter';
import { PauseManager } from '../core/pause';

describe('PauseManager', () => {
  it('starts unpaused with no reasons', () => {
    const p = new PauseManager();
    expect(p.paused).toBe(false);
    expect(p.active).toEqual([]);
  });

  it('pauses while any reason is held', () => {
    const p = new PauseManager();
    p.set('menu');
    expect(p.paused).toBe(true);
    p.clear('menu');
    expect(p.paused).toBe(false);
  });

  /**
   * The rule this class exists for: reasons are independent flags, so closing
   * an ad must not resume a game that is also paused for a hidden tab.
   */
  it('closing an ad does not resume a hidden tab', () => {
    const p = new PauseManager();
    p.set('hidden');
    p.set('ad');
    expect(p.active).toEqual(['ad', 'hidden']);
    p.clear('ad');
    expect(p.paused).toBe(true);
    expect(p.active).toEqual(['hidden']);
    p.clear('hidden');
    expect(p.paused).toBe(false);
  });

  it('closing an ad does not resume a closed menu', () => {
    const p = new PauseManager();
    p.set('menu');
    p.set('ad');
    p.clear('ad');
    expect(p.paused).toBe(true);
    expect(p.has('menu')).toBe(true);
  });

  it('is idempotent: setting twice still needs only one clear', () => {
    const p = new PauseManager();
    p.set('ad');
    p.set('ad');
    p.clear('ad');
    expect(p.paused).toBe(false);
  });

  it('clearing a reason that was never set does nothing', () => {
    const p = new PauseManager();
    p.set('menu');
    p.clear('ad');
    expect(p.paused).toBe(true);
  });

  it('announces only when the paused state actually flips', () => {
    const p = new PauseManager();
    const seen: boolean[] = [];
    p.events.on('changed', ({ paused }) => seen.push(paused));

    p.set('menu');      // false -> true : announce
    p.set('hidden');    // already paused : silent
    p.set('ad');        // already paused : silent
    p.clear('ad');      // still paused   : silent
    p.clear('hidden');  // still paused   : silent
    p.clear('menu');    // true -> false  : announce

    expect(seen).toEqual([true, false]);
  });

  it('survives every ordering of set and clear', () => {
    const reasons = ['menu', 'ad', 'hidden', 'system'] as const;
    const p = new PauseManager();
    for (const r of reasons) p.set(r);
    // Clear in a different order than they were set.
    for (const r of [...reasons].reverse()) {
      expect(p.paused).toBe(true);
      p.clear(r);
    }
    expect(p.paused).toBe(false);
    expect(p.active).toEqual([]);
  });

  it('reset() drops every reason at once', () => {
    const p = new PauseManager(['boot', 'menu']);
    expect(p.paused).toBe(true);
    p.reset();
    expect(p.paused).toBe(false);
  });
});

describe('Clock', () => {
  it('accumulates partial frames into whole simulation steps', () => {
    const c = new Clock();
    expect(c.advance(SIM_STEP / 2)).toBe(0);
    expect(c.advance(SIM_STEP / 2)).toBe(1);
  });

  it('runs several steps for a long frame', () => {
    expect(new Clock().advance(SIM_STEP * 4)).toBe(4);
  });

  /** Returning from the background must not fast-forward the fight. */
  it('clamps a huge delta instead of simulating minutes at once', () => {
    const c = new Clock();
    const steps = c.advance(60);
    expect(steps).toBeLessThanOrEqual(Math.ceil(0.25 / SIM_STEP));
    expect(c.dropped).toBeGreaterThan(0);
  });

  it('ignores nonsense deltas', () => {
    const c = new Clock();
    expect(c.advance(0)).toBe(0);
    expect(c.advance(-1)).toBe(0);
    expect(c.advance(NaN)).toBe(0);
    expect(c.advance(Infinity)).toBeLessThanOrEqual(Math.ceil(0.25 / SIM_STEP));
  });

  it('reset drops the partial accumulation', () => {
    const c = new Clock();
    c.advance(SIM_STEP * 0.9);
    c.reset();
    expect(c.advance(SIM_STEP * 0.5)).toBe(0);
  });
});

describe('Emitter and Subscriptions', () => {
  it('delivers to every listener and stops after unsubscribe', () => {
    const e = new Emitter<{ ping: number }>();
    const a = vi.fn(), b = vi.fn();
    const offA = e.on('ping', a);
    e.on('ping', b);
    e.emit('ping', 1);
    offA();
    e.emit('ping', 2);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it('lets a handler unsubscribe itself during dispatch', () => {
    const e = new Emitter<{ ping: number }>();
    const calls: number[] = [];
    const off = e.on('ping', (v) => { calls.push(v); off(); });
    e.emit('ping', 1);
    e.emit('ping', 2);
    expect(calls).toEqual([1]);
  });

  it('once fires a single time', () => {
    const e = new Emitter<{ ping: number }>();
    const fn = vi.fn();
    e.once('ping', fn);
    e.emit('ping', 1);
    e.emit('ping', 2);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  /** A scene that re-subscribes each wave would otherwise double-handle events. */
  it('disposeAll releases every registration in one call', () => {
    const e = new Emitter<{ ping: number }>();
    const subs = new Subscriptions();
    const fns = Array.from({ length: 5 }, () => vi.fn());
    for (const fn of fns) subs.add(e.on('ping', fn));
    expect(e.count()).toBe(5);
    subs.disposeAll();
    e.emit('ping', 1);
    expect(e.count()).toBe(0);
    for (const fn of fns) expect(fn).not.toHaveBeenCalled();
  });

  /**
   * Listeners live in a Set, so registering the identical function reference
   * twice stores it once. Every call site passes a fresh closure, so this never
   * bites in practice — the test pins the behaviour so a future change to the
   * backing collection is a deliberate decision rather than an accident.
   */
  it('deduplicates an identical handler reference', () => {
    const e = new Emitter<{ ping: number }>();
    const fn = vi.fn();
    e.on('ping', fn);
    e.on('ping', fn);
    expect(e.count()).toBe(1);
    e.emit('ping', 1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('disposeAll also removes DOM listeners it registered', () => {
    const target = new EventTarget();
    const subs = new Subscriptions();
    const fn = vi.fn();
    subs.dom(target, 'tick', fn);
    target.dispatchEvent(new Event('tick'));
    subs.disposeAll();
    target.dispatchEvent(new Event('tick'));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('repeated dispose is safe', () => {
    const subs = new Subscriptions();
    const fn = vi.fn();
    subs.add(fn);
    subs.disposeAll();
    subs.disposeAll();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
