/**
 * Uniform-grid spatial hash.
 *
 * Weapons query "everything near this point" every frame, and with ~90 enemies
 * plus projectiles a naive all-pairs scan is the single hottest thing in the
 * loop. Buckets are reused between rebuilds so the hash allocates nothing after
 * warm-up.
 */
export class SpatialHash<T extends { x: number; y: number; active: boolean }> {
  private cell: number;
  private buckets = new Map<number, T[]>();
  private used: T[][] = [];

  constructor(cellSize = 64) {
    this.cell = cellSize;
  }

  private key(cx: number, cy: number): number {
    // Pack two 16-bit signed cell coordinates into one number.
    return ((cx + 32768) << 16) | (cy + 32768);
  }

  rebuild(items: readonly T[]): void {
    for (const list of this.used) list.length = 0;
    this.used.length = 0;
    this.buckets.clear();
    for (const it of items) {
      if (!it.active) continue;
      const k = this.key(Math.floor(it.x / this.cell), Math.floor(it.y / this.cell));
      let b = this.buckets.get(k);
      if (!b) {
        b = [];
        this.buckets.set(k, b);
        this.used.push(b);
      }
      b.push(it);
    }
  }

  /** Append every item whose cell overlaps the circle to `out`. */
  query(x: number, y: number, radius: number, out: T[]): T[] {
    out.length = 0;
    const c = this.cell;
    const x0 = Math.floor((x - radius) / c), x1 = Math.floor((x + radius) / c);
    const y0 = Math.floor((y - radius) / c), y1 = Math.floor((y + radius) / c);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const b = this.buckets.get(this.key(cx, cy));
        if (b) for (const it of b) out.push(it);
      }
    }
    return out;
  }

  /** Items overlapping an axis-aligned box — used by the beam's broad phase. */
  queryBox(minX: number, minY: number, maxX: number, maxY: number, out: T[]): T[] {
    out.length = 0;
    const c = this.cell;
    for (let cy = Math.floor(minY / c); cy <= Math.floor(maxY / c); cy++) {
      for (let cx = Math.floor(minX / c); cx <= Math.floor(maxX / c); cx++) {
        const b = this.buckets.get(this.key(cx, cy));
        if (b) for (const it of b) out.push(it);
      }
    }
    return out;
  }
}
