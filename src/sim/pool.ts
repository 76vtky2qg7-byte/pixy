/**
 * Fixed-capacity object pool.
 *
 * Entities are never allocated or garbage-collected mid-wave: `spawn` hands
 * back a recycled object with `active` set, and `compact` sweeps dead ones at a
 * frame boundary. Keeping the array dense matters more than it looks — the
 * renderer walks it every frame.
 */
export interface Poolable {
  active: boolean;
}

export class Pool<T extends Poolable> {
  readonly items: T[] = [];
  private free: T[] = [];
  private readonly make: () => T;
  private readonly reset: (item: T) => void;
  readonly capacity: number;
  /** Spawns refused because the pool was full; surfaced in diagnostics. */
  overflow = 0;

  constructor(make: () => T, reset: (item: T) => void, capacity: number, prealloc = 0) {
    this.make = make;
    this.reset = reset;
    this.capacity = capacity;
    for (let i = 0; i < prealloc; i++) {
      const it = make();
      it.active = false;
      this.items.push(it);
      this.free.push(it);
    }
  }

  get activeCount(): number {
    let n = 0;
    for (const it of this.items) if (it.active) n++;
    return n;
  }

  spawn(): T | null {
    let it = this.free.pop();
    if (!it) {
      if (this.items.length >= this.capacity) {
        this.overflow++;
        return null;
      }
      it = this.make();
      this.items.push(it);
    }
    this.reset(it);
    it.active = true;
    return it;
  }

  release(item: T): void {
    if (!item.active) return;
    item.active = false;
    this.free.push(item);
  }

  /** Return every dead item to the free list. Call once per frame. */
  compact(): void {
    this.free.length = 0;
    for (const it of this.items) if (!it.active) this.free.push(it);
  }

  clear(): void {
    for (const it of this.items) it.active = false;
    this.compact();
    this.overflow = 0;
  }
}
