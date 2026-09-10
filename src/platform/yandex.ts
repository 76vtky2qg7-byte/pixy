import type { Payments, Player, SDK } from 'ysdk';
import type {
  AdHooks, InterstitialResult, Platform, PlatformInfo, PurchaseProduct, RewardedResult,
} from './types';

/**
 * Yandex Games adapter.
 *
 * Built against the SDK surface documented in the @types/ysdk definitions:
 * YaGames.init(), features.LoadingAPI.ready(), features.GameplayAPI.start/stop,
 * adv.showFullscreenAdv / adv.showRewardedVideo (callback style),
 * getPlayer().getData/setData, getPayments(), environment.i18n.lang,
 * deviceInfo.isMobile() and the game_api_pause / game_api_resume events.
 *
 * Every call is wrapped: an SDK that is missing a method, rejects, or never
 * fires a callback must degrade to "unavailable" and let the game continue.
 * Nothing here is allowed to block the player.
 */

/**
 * Where the host SDK is loaded from.
 *
 * A build uploaded to Yandex Games as a ZIP is served by the platform, which
 * exposes the SDK at the ROOT path `/sdk.js`. This is the one absolute path in
 * the whole project, and it is deliberate: it is a platform endpoint, not a
 * game asset, so the "everything must be relative" rule that governs our own
 * files does not apply to it. `./sdk.js` would resolve inside the game's own
 * directory, where nothing is served.
 *
 * `SELF_HOSTED_SDK_URL` is the form documented for a game served from its own
 * domain instead. It is exported for completeness; this build does not use it.
 *
 * Source: the Yandex Games "connection and usage" SDK page, relayed by review.
 * That page is not reachable from this build environment (see TEST_REPORT.md),
 * so this could not be re-read first-hand.
 */
export const YANDEX_SDK_URL = '/sdk.js';
export const SELF_HOSTED_SDK_URL = 'https://sdk.games.s3.yandex.net/sdk.js';

/** Product ids. Both are optional extras; absent catalogue means hidden UI. */
export const PRODUCT_IDS = { cosmetics: 'foreman_kit', adFree: 'no_forced_ads' } as const;

// `SDK` and `Player` come from @types/ysdk; naming them directly avoids the
// signed/unsigned union that ReturnType<> would widen to.
type Ysdk = SDK<false>;

/**
 * How long to wait for an ad to appear before telling the UI none is coming.
 * This only settles the promise; it never releases the pause, because the
 * pause is only ever taken once an ad has actually opened.
 */
const OPEN_TIMEOUT_MS = 6_000;

/**
 * Last-resort release for an ad that opened and never closed.
 *
 * Deliberately far longer than any real ad. It does not mean "the ad finished"
 * — it is the point at which a permanently paused, unplayable game is the
 * worse outcome. `game_api_resume` is the real recovery path; this is the
 * backstop for a host that provides neither signal.
 */
const ORPHAN_RELEASE_MS = 180_000;

interface AdSession {
  id: number;
  kind: 'rewarded' | 'interstitial';
  hooks: AdHooks | undefined;
  opened: boolean;
  closed: boolean;
  rewarded: boolean;
  /** Whether the promise handed to the UI has already resolved. */
  settled: boolean;
  openTimer: ReturnType<typeof setTimeout> | null;
  liveTimer: ReturnType<typeof setTimeout> | null;
}

export function loadYandexSdk(timeoutMs = 12_000): Promise<Ysdk | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') return resolve(null);
    let settled = false;
    const done = (v: Ysdk | null) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    const timer = setTimeout(() => done(null), timeoutMs);

    const init = () => {
      const g = (globalThis as { YaGames?: typeof YaGames }).YaGames;
      if (!g) { clearTimeout(timer); return done(null); }
      g.init()
        .then((sdk) => { clearTimeout(timer); done(sdk); })
        .catch(() => { clearTimeout(timer); done(null); });
    };

    if ((globalThis as { YaGames?: unknown }).YaGames) return init();
    const script = document.createElement('script');
    script.src = YANDEX_SDK_URL;
    script.async = true;
    script.onload = init;
    script.onerror = () => { clearTimeout(timer); done(null); };
    document.head.appendChild(script);
  });
}

export class YandexPlatform implements Platform {
  readonly info: PlatformInfo;
  private sdk: Ysdk;
  private player: Player | null = null;
  private payments: Payments<false> | null = null;
  private readyCalled = false;
  private gameplayOn = false;
  private offs: Array<() => void> = [];
  /**
   * Every request that has not finished yet. A request whose open window
   * lapsed stays here — it may still open late — but it no longer blocks a
   * retry, because otherwise a silent host would disable the ad button for
   * the rest of the session.
   */
  private sessions = new Set<AdSession>();
  private sessionCounter = 0;
  /** How many ads are on screen. The pause tracks 0 -> 1 and 1 -> 0. */
  private openCount = 0;
  /** Ads that opened and never reported a close; surfaced for diagnostics. */
  abandoned = 0;

  private constructor(sdk: Ysdk, info: PlatformInfo) {
    this.sdk = sdk;
    this.info = info;
  }

  static async create(sdk: Ysdk): Promise<YandexPlatform> {
    let lang: 'ru' | 'en' = 'ru';
    let isMobile = false;
    try {
      lang = sdk.environment.i18n.lang === 'ru' ? 'ru' : 'en';
    } catch { /* environment is optional in some hosts */ }
    try {
      isMobile = sdk.deviceInfo.isMobile() || sdk.deviceInfo.isTablet();
    } catch { /* fall back to feature detection in the caller */ }

    const info: PlatformInfo = {
      name: 'yandex', lang, isMobile,
      isAuthorized: false, hasCloudSave: false, hasPurchases: false,
    };
    const p = new YandexPlatform(sdk, info);

    // getPlayer resolves for guests too; cloud save works either way, but the
    // guest slot is local to the device, so we surface authorisation state.
    try {
      p.player = await sdk.getPlayer({ signed: false });
      info.isAuthorized = p.player.isAuthorized();
      info.hasCloudSave = true;
    } catch {
      info.hasCloudSave = false;
    }

    // Purchases require a configured catalogue. No catalogue, no buttons.
    try {
      p.payments = await sdk.getPayments({ signed: false });
      const catalog = await p.payments.getCatalog();
      info.hasPurchases = Array.isArray(catalog) && catalog.length > 0;
    } catch {
      p.payments = null;
      info.hasPurchases = false;
    }

    p.watchHostResume();
    return p;
  }

  ready(): void {
    if (this.readyCalled) return;
    this.readyCalled = true;
    try { this.sdk.features.LoadingAPI.ready(); } catch { /* older host */ }
  }

  gameplayStart(): void {
    if (this.gameplayOn) return;
    this.gameplayOn = true;
    try { this.sdk.features.GameplayAPI.start(); } catch { /* optional */ }
  }

  gameplayStop(): void {
    if (!this.gameplayOn) return;
    this.gameplayOn = false;
    try { this.sdk.features.GameplayAPI.stop(); } catch { /* optional */ }
  }

  /* ------------------------------------------------------------------ *
   * ads
   *
   * One request creates one AdSession. The session — not the promise — owns
   * the on-screen state, because those two genuinely differ:
   *
   *   - the promise must settle so the button stops spinning, even when the
   *     host says nothing;
   *   - the pause must last exactly as long as the ad is visible, which can
   *     start after the promise settled and end long after that.
   *
   * Nothing here assumes callbacks arrive in a particular order, arrive at
   * all, or arrive only once, and there is no attempt to cancel a request:
   * the SDK offers no cancellation and none is invented.
   * ------------------------------------------------------------------ */

  /**
   * Start a session, refusing to overlap with one that is still live.
   * Returns null when a request must not be made right now.
   */
  private beginSession(kind: 'rewarded' | 'interstitial', hooks?: AdHooks): AdSession | null {
    for (const live of this.sessions) {
      if (live.closed) continue;
      // An ad is on screen: a second request would stack two ads.
      if (live.opened) return null;
      // Still inside its open window: the host may be about to show it.
      if (live.openTimer) return null;
      // Otherwise the window lapsed with nothing shown. Allow the retry, and
      // leave the stale session tracked so a late open still pauses properly.
    }
    const session: AdSession = {
      id: ++this.sessionCounter,
      kind,
      hooks,
      opened: false,
      closed: false,
      rewarded: false,
      settled: false,
      openTimer: null,
      liveTimer: null,
    };
    this.sessions.add(session);
    return session;
  }

  /** The ad is on screen. Idempotent: a repeated onOpen pauses only once. */
  private markOpen(session: AdSession): void {
    if (session.opened || session.closed) return;
    session.opened = true;
    if (session.openTimer) { clearTimeout(session.openTimer); session.openTimer = null; }

    // A late open — after the promise already resolved 'unavailable' — still
    // has to pause, because an ad really is covering the screen now. Counting
    // opens rather than tracking one slot also means that if a host somehow
    // shows two, the pause survives the first close.
    this.openCount++;
    if (this.openCount === 1) session.hooks?.onOpen?.();

    // Last-resort recovery from a host that opens an ad and then stops
    // talking. This is NOT "the ad probably finished": it is the point past
    // which staying paused forever is worse for the player than resuming.
    session.liveTimer = setTimeout(() => {
      this.abandoned++;
      this.endSession(session);
    }, ORPHAN_RELEASE_MS);
  }

  /** The ad is gone. Idempotent, and the only thing that releases the pause. */
  private endSession(session: AdSession): void {
    if (session.closed) return;
    session.closed = true;
    if (session.openTimer) { clearTimeout(session.openTimer); session.openTimer = null; }
    if (session.liveTimer) { clearTimeout(session.liveTimer); session.liveTimer = null; }
    if (session.opened) {
      this.openCount = Math.max(0, this.openCount - 1);
      if (this.openCount === 0) session.hooks?.onClose?.();
    }
    this.sessions.delete(session);
  }

  /** True while an ad is actually displayed. */
  get adVisible(): boolean {
    return this.openCount > 0;
  }

  /**
   * A host `game_api_resume` means the game regained the foreground, which is
   * what happens when an ad overlay goes away. Treating it as a close signal
   * recovers the pause when onClose itself is lost — a real signal rather than
   * another timer.
   */
  private handleHostResume = (): void => {
    for (const s of [...this.sessions]) {
      if (s.opened && !s.closed) this.endSession(s);
    }
  };

  /**
   * Rewarded video.
   *
   * `onRewarded` is the ONLY thing that grants the bonus, and the flag makes
   * repeats harmless. `onClose` without it resolves as 'closed'.
   */
  showRewarded(hooks?: AdHooks): Promise<RewardedResult> {
    const session = this.beginSession('rewarded', hooks);
    if (!session) return Promise.resolve({ status: 'unavailable' });

    return new Promise<RewardedResult>((resolve) => {
      const settle = (result: RewardedResult) => {
        if (session.settled) return;
        session.settled = true;
        resolve(result);
      };

      // Silence before any open means no ad is coming. Settle so the button
      // recovers — but do NOT end the session: a late open must still pause.
      session.openTimer = setTimeout(() => {
        session.openTimer = null;
        if (!session.opened) settle({ status: 'unavailable' });
      }, OPEN_TIMEOUT_MS);

      try {
        this.sdk.adv.showRewardedVideo({
          callbacks: {
            onOpen: () => this.markOpen(session),
            onRewarded: () => { session.rewarded = true; },
            onClose: () => {
              // Terminal for this session only; a stale session's callback
              // cannot touch a newer one, because it holds its own object.
              settle({ status: session.rewarded ? 'rewarded' : 'closed' });
              this.endSession(session);
            },
            onError: (error) => {
              settle(session.rewarded ? { status: 'rewarded' } : { status: 'error', error });
              this.endSession(session);
            },
          },
        });
      } catch (error) {
        settle({ status: 'error', error });
        this.endSession(session);
      }
    });
  }

  showInterstitial(hooks?: AdHooks): Promise<InterstitialResult> {
    const session = this.beginSession('interstitial', hooks);
    if (!session) return Promise.resolve({ status: 'unavailable' });

    return new Promise<InterstitialResult>((resolve) => {
      const settle = (r: InterstitialResult) => {
        if (session.settled) return;
        session.settled = true;
        resolve(r);
      };

      session.openTimer = setTimeout(() => {
        session.openTimer = null;
        if (!session.opened) settle({ status: 'not_shown' });
      }, OPEN_TIMEOUT_MS);

      try {
        this.sdk.adv.showFullscreenAdv({
          callbacks: {
            onOpen: () => this.markOpen(session),
            onClose: (wasShown) => {
              settle({ status: wasShown || session.opened ? 'shown' : 'not_shown' });
              this.endSession(session);
            },
            onError: (error) => {
              settle({ status: 'error', error });
              this.endSession(session);
            },
            // Offline is not an error the player should ever be shown.
            onOffline: () => {
              settle({ status: 'not_shown' });
              this.endSession(session);
            },
          },
        });
      } catch (error) {
        settle({ status: 'error', error });
        this.endSession(session);
      }
    });
  }

  async loadCloud(): Promise<unknown> {
    if (!this.player) return null;
    const data = await this.player.getData(['save']);
    return (data as { save?: unknown }).save ?? null;
  }

  async saveCloud(data: unknown): Promise<void> {
    if (!this.player) return;
    await this.player.setData({ save: data }, true);
  }

  async getProducts(): Promise<PurchaseProduct[]> {
    if (!this.payments) return [];
    try {
      const catalog = await this.payments.getCatalog();
      return catalog.map((p) => ({
        id: p.id, title: p.title, description: p.description,
        price: p.price, priceValue: p.priceValue, imageURI: p.imageURI,
      }));
    } catch {
      return [];
    }
  }

  async purchase(id: string): Promise<{ ok: boolean; token?: string; error?: unknown }> {
    if (!this.payments) return { ok: false, error: 'no_payments' };
    try {
      const res = await this.payments.purchase({ id });
      return { ok: true, token: (res as { purchaseToken?: string }).purchaseToken };
    } catch (error) {
      return { ok: false, error };
    }
  }

  async getOwned(): Promise<string[]> {
    if (!this.payments) return [];
    try {
      const purchases = await this.payments.getPurchases();
      return Array.isArray(purchases) ? purchases.map((p) => p.productID) : [];
    } catch {
      return [];
    }
  }

  async consume(token: string): Promise<void> {
    // The release ships only non-consumable entitlements, so this is a no-op
    // path kept for completeness rather than something the game calls.
    if (!this.payments) return;
    try { await this.payments.consumePurchase(token); } catch { /* ignore */ }
  }

  onPause(cb: () => void): () => void {
    try {
      const off = this.sdk.on('game_api_pause', cb);
      this.offs.push(off);
      return off;
    } catch {
      return () => {};
    }
  }

  onResume(cb: () => void): () => void {
    try {
      const off = this.sdk.on('game_api_resume', cb);
      this.offs.push(off);
      return off;
    } catch {
      return () => {};
    }
  }

  /** Subscribe our own ad-recovery listener. Called once during create(). */
  private watchHostResume(): void {
    try {
      this.offs.push(this.sdk.on('game_api_resume', this.handleHostResume));
    } catch { /* host does not emit these */ }
  }

  destroy(): void {
    for (const off of this.offs.splice(0)) {
      try { off(); } catch { /* ignore */ }
    }
    for (const s of [...this.sessions]) this.endSession(s);
    this.gameplayStop();
  }
}
