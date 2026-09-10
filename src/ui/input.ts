import { Subscriptions } from '../core/emitter';
import { clamp } from '../core/math';

/**
 * Movement input.
 *
 * Keyboard uses `event.code` (physical key position), so WASD works on a
 * Cyrillic layout where those keys produce ЦФЫВ.
 *
 * Touch uses a floating stick: the stick appears wherever the thumb lands
 * inside its half of the screen, so there is nothing to reach for and no need
 * for a second finger. pointercancel, pointerleave, losing the pointer capture,
 * a hidden tab and window blur all release the stick — every one of those is a
 * way to end up walking into a crowd with no finger on the screen.
 */
export class InputController {
  private subs = new Subscriptions();
  private keys = new Set<string>();
  private pointerId: number | null = null;
  private originX = 0;
  private originY = 0;
  private curX = 0;
  private curY = 0;
  private active = false;
  private enabled = true;
  private side: 'left' | 'right' = 'left';
  private surface: HTMLElement;

  /** Radius in CSS px at which the stick reads as fully deflected. */
  private readonly maxRadius = 52;
  /** Movement under this is ignored, so a tap does not twitch the robot. */
  private readonly deadZone = 6;

  x = 0;
  y = 0;

  constructor(surface: HTMLElement) {
    this.surface = surface;
    this.attach();
  }

  setStickSide(side: 'left' | 'right'): void {
    this.side = side;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.release();
  }

  /** Visual state for the on-screen stick, in CSS pixels. */
  get stick(): { active: boolean; ox: number; oy: number; dx: number; dy: number } {
    return {
      active: this.active,
      ox: this.originX,
      oy: this.originY,
      dx: this.curX - this.originX,
      dy: this.curY - this.originY,
    };
  }

  private attach(): void {
    const s = this.subs;

    s.dom(window, 'keydown', (e) => this.onKey(e as KeyboardEvent, true));
    s.dom(window, 'keyup', (e) => this.onKey(e as KeyboardEvent, false));

    s.dom(this.surface, 'pointerdown', (e) => this.onDown(e as PointerEvent));
    s.dom(this.surface, 'pointermove', (e) => this.onMove(e as PointerEvent));
    s.dom(this.surface, 'pointerup', (e) => this.onUp(e as PointerEvent));
    // A cancelled pointer never sends pointerup. Without this the robot keeps
    // walking after a notification shade or a system gesture steals the touch.
    s.dom(this.surface, 'pointercancel', (e) => this.onUp(e as PointerEvent));
    s.dom(this.surface, 'lostpointercapture', (e) => this.onUp(e as PointerEvent));
    s.dom(this.surface, 'pointerleave', (e) => this.onUp(e as PointerEvent));

    // Losing the window, or the tab going to the background, must clear
    // everything — held keys included.
    s.dom(window, 'blur', () => this.releaseAll());
    s.dom(document, 'visibilitychange', () => {
      if (document.visibilityState !== 'visible') this.releaseAll();
    });
    // Stop the page from scrolling or long-press-selecting under the stick.
    s.dom(this.surface, 'contextmenu', (e) => e.preventDefault());
    s.dom(this.surface, 'touchstart', (e) => e.preventDefault(), { passive: false });
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (!this.enabled) return;
    const code = e.code;
    if (!MOVEMENT_CODES.has(code)) return;
    // Arrow keys scroll the page inside the Yandex frame otherwise.
    e.preventDefault();
    if (down) this.keys.add(code);
    else this.keys.delete(code);
    this.recompute();
  }

  private inMyHalf(clientX: number): boolean {
    const rect = this.surface.getBoundingClientRect();
    const mid = rect.left + rect.width / 2;
    return this.side === 'left' ? clientX < mid : clientX >= mid;
  }

  private onDown(e: PointerEvent): void {
    if (!this.enabled || this.pointerId !== null) return;
    if (e.pointerType !== 'touch' && e.button !== 0) return;
    if (e.pointerType === 'touch' && !this.inMyHalf(e.clientX)) return;

    this.pointerId = e.pointerId;
    const rect = this.surface.getBoundingClientRect();
    this.originX = e.clientX - rect.left;
    this.originY = e.clientY - rect.top;
    this.curX = this.originX;
    this.curY = this.originY;
    this.active = true;
    try { this.surface.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    this.recompute();
  }

  private onMove(e: PointerEvent): void {
    if (this.pointerId !== e.pointerId) return;
    const rect = this.surface.getBoundingClientRect();
    this.curX = e.clientX - rect.left;
    this.curY = e.clientY - rect.top;
    this.recompute();
  }

  private onUp(e: PointerEvent): void {
    if (this.pointerId !== e.pointerId) return;
    this.release();
  }

  private release(): void {
    if (this.pointerId !== null) {
      try { this.surface.releasePointerCapture(this.pointerId); } catch { /* already gone */ }
    }
    this.pointerId = null;
    this.active = false;
    this.recompute();
  }

  /** Drop touch and keyboard state together. */
  releaseAll(): void {
    this.keys.clear();
    this.release();
  }

  private recompute(): void {
    let kx = 0, ky = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) kx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) kx += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) ky -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) ky += 1;

    let tx = 0, ty = 0;
    if (this.active) {
      const dx = this.curX - this.originX;
      const dy = this.curY - this.originY;
      const d = Math.hypot(dx, dy);
      if (d > this.deadZone) {
        const scaled = Math.min(1, (d - this.deadZone) / (this.maxRadius - this.deadZone));
        tx = (dx / d) * scaled;
        ty = (dy / d) * scaled;
      }
    }

    // Whichever input is being used wins; they add, then clamp to a unit disc.
    let x = kx + tx, y = ky + ty;
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    this.x = clamp(x, -1, 1);
    this.y = clamp(y, -1, 1);
  }

  destroy(): void {
    this.releaseAll();
    this.subs.disposeAll();
  }
}

/** Physical key codes, so the layout the player types in does not matter. */
const MOVEMENT_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);
