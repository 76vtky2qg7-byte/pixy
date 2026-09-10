/**
 * Screen layout policy.
 *
 * Pixel art only stays crisp at whole-number scales, so the game renders into a
 * small internal canvas and the browser scales that canvas up with nearest
 * neighbour. `zoom` is the integer scale; the internal canvas is the CSS size
 * divided by it.
 *
 * The zoom is picked from the SHORTER screen axis, so a phone in portrait and a
 * desktop in landscape both see the same amount of world across that axis. The
 * longer axis simply shows more. Spawns are placed on a ring derived from the
 * view's half-diagonal, so "enemies arrive from just off screen" holds in every
 * aspect ratio rather than favouring one.
 */

/** World pixels we want to fit across the shorter axis, at minimum. */
export const TARGET_MIN_EXTENT = 340;
export const MAX_ZOOM = 4;

export interface Layout {
  cssWidth: number;
  cssHeight: number;
  zoom: number;
  /** Internal render size, in world pixels. */
  width: number;
  height: number;
  portrait: boolean;
  /** Half-diagonal of the visible world area. */
  viewRadius: number;
}

export function computeLayout(cssWidth: number, cssHeight: number): Layout {
  const w = Math.max(240, Math.floor(cssWidth));
  const h = Math.max(240, Math.floor(cssHeight));
  const zoom = Math.max(1, Math.min(MAX_ZOOM, Math.floor(Math.min(w, h) / TARGET_MIN_EXTENT)));
  const width = Math.ceil(w / zoom);
  const height = Math.ceil(h / zoom);
  return {
    cssWidth: w,
    cssHeight: h,
    zoom,
    width,
    height,
    portrait: h >= w,
    viewRadius: Math.hypot(width, height) / 2,
  };
}
