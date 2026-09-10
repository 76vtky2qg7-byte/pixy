/** Outcome of a rewarded video, from the game's point of view. */
export type RewardedResult =
  | { status: 'rewarded' }
  | { status: 'closed' }      // watched or dismissed, no reward fired
  | { status: 'error'; error?: unknown }
  | { status: 'unavailable' }; // no SDK, or the method is not offered here

export type InterstitialResult =
  | { status: 'shown' }
  | { status: 'not_shown' }
  | { status: 'error'; error?: unknown }
  | { status: 'unavailable' };

export interface PurchaseProduct {
  id: string;
  title: string;
  description: string;
  price: string;         // already formatted by the SDK, with its own currency
  priceValue: string;
  imageURI: string;
}

/**
 * Lifecycle hooks for one ad request.
 *
 * These — not the returned promise — own the pause. `onOpen` fires when the ad
 * is actually on screen and `onClose` fires exactly once for each `onOpen`,
 * even if that happens long after the promise has already resolved. Tying the
 * pause to the promise instead would unpause the game underneath a still
 * visible ad, or leave it paused forever after a late open.
 */
export interface AdHooks {
  onOpen?: () => void;
  onClose?: () => void;
}

export interface PlatformInfo {
  name: 'yandex' | 'mock' | 'none';
  lang: 'ru' | 'en';
  isMobile: boolean;
  isAuthorized: boolean;
  /** Cloud saves and purchases can each be absent independently. */
  hasCloudSave: boolean;
  hasPurchases: boolean;
}

/**
 * Everything the game needs from a host platform. The game imports only this
 * interface; nothing outside src/platform references YaGames.
 */
export interface Platform {
  readonly info: PlatformInfo;
  /** Tell the host the loading screen is done. Safe to call more than once. */
  ready(): void;
  /** Mark the boundaries of active gameplay, for host-side ad pacing. */
  gameplayStart(): void;
  gameplayStop(): void;

  /**
   * The promise reports the OUTCOME the UI should act on; `hooks` report the
   * ad's VISIBILITY. They are deliberately separate, because the promise has to
   * settle so the button un-sticks, while the ad may still be on screen.
   */
  showRewarded(hooks?: AdHooks): Promise<RewardedResult>;
  showInterstitial(hooks?: AdHooks): Promise<InterstitialResult>;
  /** True while an ad is actually displayed. Used by tests and diagnostics. */
  readonly adVisible: boolean;

  loadCloud(): Promise<unknown>;
  saveCloud(data: unknown): Promise<void>;

  /** Empty when the catalogue is not configured; the UI hides the section. */
  getProducts(): Promise<PurchaseProduct[]>;
  purchase(id: string): Promise<{ ok: boolean; token?: string; error?: unknown }>;
  getOwned(): Promise<string[]>;
  consume(token: string): Promise<void>;

  /** Host-driven pause (a call arrives, the app backgrounds, an ad opens). */
  onPause(cb: () => void): () => void;
  onResume(cb: () => void): () => void;

  destroy(): void;
}
