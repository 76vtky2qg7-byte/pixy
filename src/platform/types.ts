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

export interface AdHooks {
  onOpen?: () => void;
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
   * `hooks.onOpen` fires only when the ad actually appears on screen. The game
   * uses it to decide when to pause: an ad that never opens must not freeze
   * anything, so the pause is taken on open rather than on request.
   */
  showRewarded(hooks?: AdHooks): Promise<RewardedResult>;
  showInterstitial(hooks?: AdHooks): Promise<InterstitialResult>;

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
