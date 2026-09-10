import type { World } from '../../src/sim/world';

/**
 * A scripted stand-in for a competent player, used to measure balance without
 * a human in the loop. It does the three things a real player does: keep away
 * from bodies, step out of telegraphed rings, and drift toward loot.
 *
 * It is a measuring instrument, not a claim about how the game feels.
 */
export function driveBot(w: World): void {
  let ax = 0, ay = 0;

  // 1. Repulsion from nearby enemies, weighted by how close they are.
  for (const e of w.enemies.items) {
    if (!e.active) continue;
    const dx = w.px - e.x, dy = w.py - e.y;
    const d = Math.hypot(dx, dy);
    const danger = e.boss ? 210 : 130;
    if (d < danger && d > 0.1) {
      const push = (1 - d / danger) * (e.boss ? 3.2 : 1.6);
      ax += (dx / d) * push;
      ay += (dy / d) * push;
    }
  }

  // 2. Step out of any telegraphed ring that has not resolved yet.
  for (const h of w.hazards.items) {
    if (!h.active || h.fired) continue;
    const dx = w.px - h.x, dy = w.py - h.y;
    const d = Math.hypot(dx, dy);
    if (d < h.radius + 34) {
      const push = (1 - d / (h.radius + 34)) * 5.5;
      ax += (dx / (d || 1)) * push;
      ay += (dy / (d || 1)) * push;
    }
  }

  // 3. Dodge incoming hostile shots that are actually heading at us.
  for (const p of w.projectiles.items) {
    if (!p.active || !p.hostile) continue;
    const dx = w.px - p.x, dy = w.py - p.y;
    const d = Math.hypot(dx, dy);
    if (d > 150 || d < 0.1) continue;
    const closing = (p.vx * -dx + p.vy * -dy) / d;
    if (closing <= 0) continue;
    ax += (-p.vy / (Math.hypot(p.vx, p.vy) || 1)) * 1.4;
    ay += (p.vx / (Math.hypot(p.vx, p.vy) || 1)) * 1.4;
  }

  // 4. Otherwise go pick things up.
  let bx = 0, by = 0, bestD = 1e9;
  for (const p of w.pickups.items) {
    if (!p.active) continue;
    const d = Math.hypot(p.x - w.px, p.y - w.py);
    if (d < bestD) { bestD = d; bx = p.x - w.px; by = p.y - w.py; }
  }
  if (bestD < 1e9) {
    const d = Math.hypot(bx, by) || 1;
    ax += (bx / d) * 0.85;
    ay += (by / d) * 0.85;
  }

  // 5. Keep off the arena walls — being cornered is a losing position.
  const inset = 150;
  if (w.px < inset) ax += 2.5;
  if (w.px > 1800 - inset) ax -= 2.5;
  if (w.py < inset) ay += 2.5;
  if (w.py > 1800 - inset) ay -= 2.5;

  const m = Math.hypot(ax, ay);
  if (m > 0.01) { w.moveX = ax / m; w.moveY = ay / m; }
  else { w.moveX = 0; w.moveY = 0; }
}
