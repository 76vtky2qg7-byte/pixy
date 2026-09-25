import type {
  AdHooks, InterstitialResult, Platform, PlatformInfo, PurchaseProduct, RewardedResult,
} from './types';

/**
 * Development stand-in for the host platform.
 *
 * Guarded by import.meta.env.DEV at the only call site (bootstrap.ts) so it is
 * tree-shaken out of the production bundle. It deliberately does NOT pretend
 * purchases succeed: getProducts() returns an empty catalogue, which is exactly
 * what an unconfigured game sees, so the purchase UI stays hidden in dev too.
 *
 * The ad outcome can be forced with ?ad=rewarded|closed|error|unavailable|double
 * so every branch — including a duplicated reward callback — is reachable
 * without a live ad network.
 */
export type MockAdMode = 'rewarded' | 'closed' | 'error' | 'unavailable' | 'double';

export class MockPlatform implements Platform {
  readonly info: PlatformInfo;
  private adMode: MockAdMode;
  private delay: number;
  private pauseCbs = new Set<() => void>();
  private resumeCbs = new Set<() => void>();
  private cloudSlot: unknown = null;
  private adOpen = false;
  /** Counts reward grants so a test can prove a double callback pays once. */
  rewardGrants = 0;

  get adVisible(): boolean { return this.adOpen; }

  constructor(opts: { adMode?: MockAdMode; lang?: 'ru' | 'en'; delay?: number } = {}) {
    this.adMode = opts.adMode ?? 'rewarded';
    this.delay = opts.delay ?? 220;
    this.info = {
      name: 'mock',
      lang: opts.lang ?? 'ru',
      isMobile: false,
      isAuthorized: false,
      hasCloudSave: true,
      hasPurchases: false,
    };
  }

  ready(): void { /* no host to notify */ }
  gameplayStart(): void { /* no host to notify */ }
  gameplayStop(): void { /* no host to notify */ }

  async showRewarded(hooks?: AdHooks): Promise<RewardedResult> {
    if (this.adOpen) return { status: 'unavailable' };
    if (this.adMode === 'unavailable') return { status: 'unavailable' };
    this.adOpen = true;
    hooks?.onOpen?.();
    // Ads take over the screen, so the mock announces a host pause the same way.
    for (const cb of this.pauseCbs) cb();
    await new Promise((r) => setTimeout(r, this.delay));
    for (const cb of this.resumeCbs) cb();
    this.adOpen = false;
    hooks?.onClose?.();

    switch (this.adMode) {
      case 'closed': return { status: 'closed' };
      case 'error': return { status: 'error', error: new Error('mock ad error') };
      case 'double':
        // Two grants from one call: the game must still pay exactly once.
        this.rewardGrants += 2;
        return { status: 'rewarded' };
      default:
        this.rewardGrants += 1;
        return { status: 'rewarded' };
    }
  }

  async showInterstitial(hooks?: AdHooks): Promise<InterstitialResult> {
    if (this.adOpen) return { status: 'unavailable' };
    if (this.adMode === 'unavailable') return { status: 'unavailable' };
    this.adOpen = true;
    hooks?.onOpen?.();
    for (const cb of this.pauseCbs) cb();
    await new Promise((r) => setTimeout(r, this.delay));
    for (const cb of this.resumeCbs) cb();
    this.adOpen = false;
    hooks?.onClose?.();
    if (this.adMode === 'error') return { status: 'error' };
    if (this.adMode === 'closed') return { status: 'not_shown' };
    return { status: 'shown' };
  }

  async loadCloud(): Promise<unknown> { return this.cloudSlot; }
  async saveCloud(data: unknown): Promise<void> { this.cloudSlot = structuredClone(data); }

  async getProducts(): Promise<PurchaseProduct[]> { return []; }
  async purchase(): Promise<{ ok: boolean; error?: unknown }> {
    return { ok: false, error: 'no_catalog_in_dev' };
  }
  async getOwned(): Promise<string[]> { return []; }
  async consume(): Promise<void> { /* nothing to consume */ }

  onPause(cb: () => void): () => void {
    this.pauseCbs.add(cb);
    return () => this.pauseCbs.delete(cb);
  }

  onResume(cb: () => void): () => void {
    this.resumeCbs.add(cb);
    return () => this.resumeCbs.delete(cb);
  }

  /** Test hook: drive the host pause/resume events by hand. */
  emitPause(): void { for (const cb of this.pauseCbs) cb(); }
  emitResume(): void { for (const cb of this.resumeCbs) cb(); }

  destroy(): void {
    this.pauseCbs.clear();
    this.resumeCbs.clear();
  }
}

/** Last-resort platform: no host, no ads, no cloud. Everything still plays. */
export class NullPlatform implements Platform {
  readonly adVisible = false;
  readonly info: PlatformInfo = {
    name: 'none',
    // With no host to ask, the browser's own language is the only signal
    // there is. Hardcoding 'ru' here handed an English speaker a Russian
    // game whenever the SDK could not load.
    lang: NullPlatform.browserLang(),
    isMobile: false,
    isAuthorized: false, hasCloudSave: false, hasPurchases: false,
  };

  private static browserLang(): 'ru' | 'en' {
    const raw = (globalThis.navigator?.language ?? 'ru').toLowerCase();
    return raw.startsWith('en') ? 'en' : 'ru';
  }
  ready(): void {}
  gameplayStart(): void {}
  gameplayStop(): void {}
  async showRewarded(): Promise<RewardedResult> { return { status: 'unavailable' }; }
  async showInterstitial(): Promise<InterstitialResult> { return { status: 'unavailable' }; }
  async loadCloud(): Promise<unknown> { return null; }
  async saveCloud(): Promise<void> {}
  async getProducts(): Promise<PurchaseProduct[]> { return []; }
  async purchase(): Promise<{ ok: boolean }> { return { ok: false }; }
  async getOwned(): Promise<string[]> { return []; }
  async consume(): Promise<void> {}
  onPause(): () => void { return () => {}; }
  onResume(): () => void { return () => {}; }
  destroy(): void {}
}
