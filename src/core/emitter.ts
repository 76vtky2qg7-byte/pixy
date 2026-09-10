type Handler = (payload: unknown) => void;

/**
 * Minimal typed event bus. `on` returns a disposer, and `disposeAll` lets a
 * scene drop every listener it registered in one call — that is what keeps
 * wave 2 from running with wave 1's handlers still attached.
 */
export class Emitter<E extends Record<string, unknown>> {
  private map = new Map<string, Set<Handler>>();

  on<K extends keyof E & string>(event: K, fn: (payload: E[K]) => void): () => void {
    let set = this.map.get(event);
    if (!set) {
      set = new Set();
      this.map.set(event, set);
    }
    const h = fn as Handler;
    set.add(h);
    return () => set!.delete(h);
  }

  once<K extends keyof E & string>(event: K, fn: (payload: E[K]) => void): () => void {
    const off = this.on(event, (p) => {
      off();
      fn(p);
    });
    return off;
  }

  emit<K extends keyof E & string>(event: K, payload: E[K]): void {
    const set = this.map.get(event);
    if (!set) return;
    // Copy first: a handler may unsubscribe itself or others while we iterate.
    for (const fn of [...set]) fn(payload as unknown);
  }

  off<K extends keyof E & string>(event: K, fn: (payload: E[K]) => void): void {
    this.map.get(event)?.delete(fn as Handler);
  }

  clear(): void {
    this.map.clear();
  }

  /** Number of live listeners; used by tests to prove nothing leaks. */
  count(): number {
    let n = 0;
    for (const set of this.map.values()) n += set.size;
    return n;
  }
}

/** Collects disposers so a scene can release every subscription at once. */
export class Subscriptions {
  private list: Array<() => void> = [];

  add(off: () => void): void {
    this.list.push(off);
  }

  /** Wraps addEventListener so DOM listeners are released the same way. */
  dom<T extends EventTarget>(
    target: T,
    type: string,
    fn: EventListenerOrEventListenerObject,
    opts?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, fn, opts);
    this.list.push(() => target.removeEventListener(type, fn, opts));
  }

  disposeAll(): void {
    for (const off of this.list.splice(0)) off();
  }

  get size(): number {
    return this.list.length;
  }
}
