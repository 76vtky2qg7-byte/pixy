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

/** Loader for the host script. Replace only via the documented v2 endpoint. */
export const YANDEX_SDK_URL = 'https://yandex.ru/games/sdk/v2';

/** Product ids. Both are optional extras; absent catalogue means hidden UI. */
export const PRODUCT_IDS = { cosmetics: 'foreman_kit', adFree: 'no_forced_ads' } as const;

// `SDK` and `Player` come from @types/ysdk; naming them directly avoids the
// signed/unsigned union that ReturnType<> would widen to.
type Ysdk = SDK<false>;

/**
 * Two watchdogs, because "the SDK went quiet" has two distinct shapes.
 *
 * OPEN_TIMEOUT_MS: no onOpen at all means no ad is coming. Give up quickly —
 * the player is staring at a stalled button.
 * AD_TIMEOUT_MS: the ad opened but never reported a close. Wait longer, since
 * a real video is playing, but never wait forever.
 */
const OPEN_TIMEOUT_MS = 6_000;
const AD_TIMEOUT_MS = 45_000;

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
  /** Only one ad call may be in flight; a second tap must not open a second ad. */
  private adInFlight = false;

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

  /**
   * Rewarded video.
   *
   * `onRewarded` is the ONLY signal that grants the bonus. onClose alone
   * resolves as 'closed'. Both callbacks can fire, in either order, and the SDK
   * may fire a callback twice — `settle` makes every path idempotent.
   */
  showRewarded(hooks?: AdHooks): Promise<RewardedResult> {
    if (this.adInFlight) return Promise.resolve({ status: 'unavailable' });
    this.adInFlight = true;
    return new Promise<RewardedResult>((resolve) => {
      let rewarded = false;
      let opened = false;
      let done = false;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const settle = (result: RewardedResult) => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        this.adInFlight = false;
        resolve(result);
      };

      // Until the ad opens, treat silence as "no ad available" and bail early.
      timer = setTimeout(() => settle({ status: 'unavailable' }), OPEN_TIMEOUT_MS);

      try {
        this.sdk.adv.showRewardedVideo({
          callbacks: {
            onOpen: () => {
              opened = true;
              if (timer) clearTimeout(timer);
              timer = setTimeout(
                () => settle({ status: rewarded ? 'rewarded' : 'closed' }), AD_TIMEOUT_MS);
              hooks?.onOpen?.();
            },
            onRewarded: () => { rewarded = true; },
            // Close is the terminal event; the reward flag decides the outcome.
            onClose: () => settle({ status: rewarded ? 'rewarded' : 'closed' }),
            onError: (error) => settle(
              opened && rewarded ? { status: 'rewarded' } : { status: 'error', error }),
          },
        });
      } catch (error) {
        settle({ status: 'error', error });
      }
    });
  }

  showInterstitial(hooks?: AdHooks): Promise<InterstitialResult> {
    if (this.adInFlight) return Promise.resolve({ status: 'unavailable' });
    this.adInFlight = true;
    return new Promise<InterstitialResult>((resolve) => {
      let done = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const settle = (r: InterstitialResult) => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        this.adInFlight = false;
        resolve(r);
      };
      timer = setTimeout(() => settle({ status: 'not_shown' }), OPEN_TIMEOUT_MS);

      try {
        this.sdk.adv.showFullscreenAdv({
          callbacks: {
            onOpen: () => {
              if (timer) clearTimeout(timer);
              timer = setTimeout(() => settle({ status: 'shown' }), AD_TIMEOUT_MS);
              hooks?.onOpen?.();
            },
            onClose: (wasShown) => settle({ status: wasShown ? 'shown' : 'not_shown' }),
            onError: (error) => settle({ status: 'error', error }),
            // Offline is not an error the player should ever see.
            onOffline: () => settle({ status: 'not_shown' }),
          },
        });
      } catch (error) {
        settle({ status: 'error', error });
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

  destroy(): void {
    for (const off of this.offs.splice(0)) {
      try { off(); } catch { /* ignore */ }
    }
    this.gameplayStop();
  }
}
