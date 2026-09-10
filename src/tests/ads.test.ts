import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PauseManager } from '../core/pause';
import { YandexPlatform } from '../platform/yandex';

/**
 * Ad lifecycle tests.
 *
 * These drive the real adapter against a SCRIPTED SDK whose callbacks this
 * file fires by hand. They prove the adapter's own state machine — ordering,
 * duplication, lateness, overlap. They are NOT a test of live advertising:
 * fill rate, real close behaviour and ad-blocker interaction can only be
 * checked in a Yandex draft. See TEST_REPORT.md.
 */

type Cb = {
  onOpen?: () => void;
  onClose?: (wasShown?: boolean) => void;
  onError?: (e: unknown) => void;
  onRewarded?: () => void;
  onOffline?: () => void;
};

/** Captures the callbacks the adapter registers so a test can fire them. */
class ScriptedSdk {
  rewardedCalls: Cb[] = [];
  interstitialCalls: Cb[] = [];
  private resumeListeners = new Set<() => void>();
  /** Set to throw from showRewardedVideo, simulating a broken host. */
  throwOnShow = false;

  adv = {
    showRewardedVideo: (opts?: { callbacks?: Cb }) => {
      if (this.throwOnShow) throw new Error('host exploded');
      this.rewardedCalls.push(opts?.callbacks ?? {});
    },
    showFullscreenAdv: (opts?: { callbacks?: Cb }) => {
      if (this.throwOnShow) throw new Error('host exploded');
      this.interstitialCalls.push(opts?.callbacks ?? {});
    },
  };

  features = {
    LoadingAPI: { ready: () => {} },
    GameplayAPI: { start: () => {}, stop: () => {} },
  };

  environment = { i18n: { lang: 'ru' } };
  deviceInfo = { isMobile: () => false, isTablet: () => false };

  on(event: string, fn: () => void) {
    if (event === 'game_api_resume') this.resumeListeners.add(fn);
    return () => this.resumeListeners.delete(fn);
  }

  emitResume() { for (const fn of [...this.resumeListeners]) fn(); }

  async getPlayer() { throw new Error('guest'); }
  async getPayments() { throw new Error('no catalogue'); }

  get lastRewarded() { return this.rewardedCalls[this.rewardedCalls.length - 1]; }
  get lastInterstitial() { return this.interstitialCalls[this.interstitialCalls.length - 1]; }
}

/** Build the adapter over a scripted SDK, plus a pause manager wired like the game's. */
async function harness() {
  const sdk = new ScriptedSdk();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- scripted stand-in
  const platform = await YandexPlatform.create(sdk as any);
  const pause = new PauseManager();
  const hooks = {
    onOpen: () => pause.set('ad'),
    onClose: () => pause.clear('ad'),
  };
  return { sdk, platform, pause, hooks };
}

beforeEach(() => { vi.useFakeTimers(); });

describe('rewarded video — outcomes', () => {
  it('grants only on onRewarded', async () => {
    const { sdk, platform, hooks } = await harness();
    const p = platform.showRewarded(hooks);
    sdk.lastRewarded.onOpen!();
    sdk.lastRewarded.onRewarded!();
    sdk.lastRewarded.onClose!();
    await expect(p).resolves.toEqual({ status: 'rewarded' });
  });

  it('closing without a reward does not grant', async () => {
    const { sdk, platform, hooks } = await harness();
    const p = platform.showRewarded(hooks);
    sdk.lastRewarded.onOpen!();
    sdk.lastRewarded.onClose!();
    await expect(p).resolves.toEqual({ status: 'closed' });
  });

  it('repeated onRewarded, onClose and onError resolve exactly once', async () => {
    const { sdk, platform, hooks } = await harness();
    const p = platform.showRewarded(hooks);
    const cb = sdk.lastRewarded;
    cb.onOpen!();
    cb.onOpen!();
    cb.onRewarded!();
    cb.onRewarded!();
    cb.onRewarded!();
    cb.onClose!();
    cb.onClose!();
    cb.onError!(new Error('late'));
    await expect(p).resolves.toEqual({ status: 'rewarded' });
  });

  it('a duplicated onOpen pauses only once', async () => {
    const { sdk, platform, pause } = await harness();
    let opens = 0, closes = 0;
    const p = platform.showRewarded({ onOpen: () => { opens++; pause.set('ad'); }, onClose: () => { closes++; pause.clear('ad'); } });
    sdk.lastRewarded.onOpen!();
    sdk.lastRewarded.onOpen!();
    sdk.lastRewarded.onOpen!();
    expect(opens).toBe(1);
    sdk.lastRewarded.onClose!();
    expect(closes).toBe(1);
    expect(pause.paused).toBe(false);
    await p;
  });

  it('an error before any open reports an error and pauses nothing', async () => {
    const { sdk, platform, pause, hooks } = await harness();
    const p = platform.showRewarded(hooks);
    sdk.lastRewarded.onError!(new Error('no fill'));
    const res = await p;
    expect(res.status).toBe('error');
    expect(pause.paused).toBe(false);
  });

  it('a host that throws synchronously does not leave a stuck button', async () => {
    const { sdk, platform, pause, hooks } = await harness();
    sdk.throwOnShow = true;
    const res = await platform.showRewarded(hooks);
    expect(res.status).toBe('error');
    expect(pause.paused).toBe(false);
    expect(platform.adVisible).toBe(false);
  });
});

describe('rewarded video — pause follows visibility, not the promise', () => {
  /** The defect this whole redesign exists to prevent. */
  it('an ad open for longer than any watchdog keeps the game paused', async () => {
    const { sdk, platform, pause, hooks } = await harness();
    const p = platform.showRewarded(hooks);
    sdk.lastRewarded.onOpen!();
    expect(pause.paused).toBe(true);

    // Far past the old 45s ad watchdog.
    await vi.advanceTimersByTimeAsync(120_000);
    expect(pause.paused).toBe(true);
    expect(platform.adVisible).toBe(true);

    sdk.lastRewarded.onRewarded!();
    sdk.lastRewarded.onClose!();
    expect(pause.paused).toBe(false);
    await expect(p).resolves.toEqual({ status: 'rewarded' });
  });

  it('no ad within the open window settles the promise but pauses nothing', async () => {
    const { platform, pause, hooks } = await harness();
    const p = platform.showRewarded(hooks);
    await vi.advanceTimersByTimeAsync(6_500);
    await expect(p).resolves.toEqual({ status: 'unavailable' });
    expect(pause.paused).toBe(false);
  });

  /** Requirement: a late open still has to pause, because an ad really is up. */
  it('an ad that opens AFTER the open timeout still pauses and later resumes', async () => {
    const { sdk, platform, pause, hooks } = await harness();
    const p = platform.showRewarded(hooks);
    await vi.advanceTimersByTimeAsync(6_500);
    await expect(p).resolves.toEqual({ status: 'unavailable' });
    expect(pause.paused).toBe(false);

    // The host finally opens the ad.
    sdk.lastRewarded.onOpen!();
    expect(pause.paused).toBe(true);
    expect(platform.adVisible).toBe(true);

    sdk.lastRewarded.onClose!();
    expect(pause.paused).toBe(false);
    expect(platform.adVisible).toBe(false);
  });

  it('a host resume event recovers the pause when onClose is lost', async () => {
    const { sdk, platform, pause, hooks } = await harness();
    void platform.showRewarded(hooks);
    sdk.lastRewarded.onOpen!();
    expect(pause.paused).toBe(true);
    sdk.emitResume();
    expect(pause.paused).toBe(false);
    expect(platform.adVisible).toBe(false);
  });

  it('an orphaned ad is eventually released rather than freezing the game', async () => {
    const { sdk, platform, pause, hooks } = await harness();
    void platform.showRewarded(hooks);
    sdk.lastRewarded.onOpen!();
    expect(pause.paused).toBe(true);
    await vi.advanceTimersByTimeAsync(181_000);
    expect(pause.paused).toBe(false);
    expect(platform.abandoned).toBe(1);
  });

  /** Independent pause reasons must survive an ad closing. */
  it('closing an ad does not resume a hidden tab', async () => {
    const { sdk, platform, pause, hooks } = await harness();
    pause.set('hidden');
    void platform.showRewarded(hooks);
    sdk.lastRewarded.onOpen!();
    expect(pause.active).toEqual(['ad', 'hidden']);
    sdk.lastRewarded.onClose!();
    expect(pause.paused).toBe(true);
    expect(pause.active).toEqual(['hidden']);
  });

  it('closing an ad does not resume an open menu', async () => {
    const { sdk, platform, pause, hooks } = await harness();
    pause.set('menu');
    void platform.showRewarded(hooks);
    sdk.lastRewarded.onOpen!();
    sdk.lastRewarded.onClose!();
    expect(pause.has('menu')).toBe(true);
    expect(pause.paused).toBe(true);
  });
});

describe('rewarded video — overlapping requests', () => {
  it('refuses a second request while an ad is on screen', async () => {
    const { sdk, platform, hooks } = await harness();
    void platform.showRewarded(hooks);
    sdk.lastRewarded.onOpen!();
    const second = await platform.showRewarded(hooks);
    expect(second).toEqual({ status: 'unavailable' });
    expect(sdk.rewardedCalls).toHaveLength(1);
  });

  it('refuses a second request while the first is still inside its open window', async () => {
    const { platform, hooks } = await harness();
    void platform.showRewarded(hooks);
    const second = await platform.showRewarded(hooks);
    expect(second).toEqual({ status: 'unavailable' });
  });

  /** After a timeout the player presses the button again; it must work. */
  it('allows a new request after the previous one timed out and never opened', async () => {
    const { sdk, platform, hooks } = await harness();
    const first = platform.showRewarded(hooks);
    await vi.advanceTimersByTimeAsync(6_500);
    await expect(first).resolves.toEqual({ status: 'unavailable' });

    const second = platform.showRewarded(hooks);
    sdk.lastRewarded.onOpen!();
    sdk.lastRewarded.onRewarded!();
    sdk.lastRewarded.onClose!();
    await expect(second).resolves.toEqual({ status: 'rewarded' });
    expect(sdk.rewardedCalls).toHaveLength(2);
  });

  /** The cross-talk case: an old request's callbacks arriving during a new one. */
  it('a stale request cannot grant a reward to a newer one', async () => {
    const { sdk, platform, hooks } = await harness();
    const first = platform.showRewarded(hooks);
    const staleCb = sdk.lastRewarded;
    staleCb.onOpen!();
    staleCb.onClose!();
    await expect(first).resolves.toEqual({ status: 'closed' });

    const second = platform.showRewarded(hooks);
    const freshCb = sdk.lastRewarded;
    expect(freshCb).not.toBe(staleCb);

    // The old request now reports a reward, late.
    staleCb.onRewarded!();
    staleCb.onClose!();

    freshCb.onOpen!();
    freshCb.onClose!();
    // The new request must resolve on its OWN outcome: no reward.
    await expect(second).resolves.toEqual({ status: 'closed' });
  });

  it('a stale close cannot unpause an ad that is currently on screen', async () => {
    const { sdk, platform, pause, hooks } = await harness();
    const first = platform.showRewarded(hooks);
    const staleCb = sdk.lastRewarded;
    staleCb.onOpen!();
    staleCb.onClose!();
    await first;
    expect(pause.paused).toBe(false);

    void platform.showRewarded(hooks);
    sdk.lastRewarded.onOpen!();
    expect(pause.paused).toBe(true);

    staleCb.onClose!();          // late, from the finished request
    expect(pause.paused).toBe(true);
    expect(platform.adVisible).toBe(true);
  });
});

describe('rewarded video — the retry path stays usable', () => {
  it('a silent host does not disable the ad button for the rest of the session', async () => {
    const { sdk, platform, hooks } = await harness();
    // Three requests that the host simply never answers.
    for (let i = 0; i < 3; i++) {
      const p = platform.showRewarded(hooks);
      await vi.advanceTimersByTimeAsync(6_500);
      await expect(p).resolves.toEqual({ status: 'unavailable' });
    }
    // The fourth finally gets an ad, and it must work normally.
    const p = platform.showRewarded(hooks);
    sdk.lastRewarded.onOpen!();
    sdk.lastRewarded.onRewarded!();
    sdk.lastRewarded.onClose!();
    await expect(p).resolves.toEqual({ status: 'rewarded' });
    expect(sdk.rewardedCalls).toHaveLength(4);
  });

  it('a stale request that opens late while a fresh ad is up keeps the pause', async () => {
    const { sdk, platform, pause, hooks } = await harness();
    const stalePromise = platform.showRewarded(hooks);
    const staleCb = sdk.lastRewarded;
    await vi.advanceTimersByTimeAsync(6_500);
    await stalePromise;

    void platform.showRewarded(hooks);
    const freshCb = sdk.lastRewarded;
    freshCb.onOpen!();
    expect(pause.paused).toBe(true);

    // The abandoned request opens too — two ads on screen.
    staleCb.onOpen!();
    expect(platform.adVisible).toBe(true);

    // Closing only one must NOT resume the game.
    freshCb.onClose!();
    expect(pause.paused).toBe(true);
    staleCb.onClose!();
    expect(pause.paused).toBe(false);
  });
});

describe('interstitial', () => {
  it('reports shown and pauses for the display', async () => {
    const { sdk, platform, pause, hooks } = await harness();
    const p = platform.showInterstitial(hooks);
    sdk.lastInterstitial.onOpen!();
    expect(pause.paused).toBe(true);
    sdk.lastInterstitial.onClose!(true);
    expect(pause.paused).toBe(false);
    await expect(p).resolves.toEqual({ status: 'shown' });
  });

  it('treats offline as "not shown" rather than an error', async () => {
    const { sdk, platform, pause, hooks } = await harness();
    const p = platform.showInterstitial(hooks);
    sdk.lastInterstitial.onOffline!();
    await expect(p).resolves.toEqual({ status: 'not_shown' });
    expect(pause.paused).toBe(false);
  });

  it('a close with wasShown=false after no open reports not_shown', async () => {
    const { sdk, platform, hooks } = await harness();
    const p = platform.showInterstitial(hooks);
    sdk.lastInterstitial.onClose!(false);
    await expect(p).resolves.toEqual({ status: 'not_shown' });
  });

  it('does not overlap a rewarded video that is on screen', async () => {
    const { sdk, platform, hooks } = await harness();
    void platform.showRewarded(hooks);
    sdk.lastRewarded.onOpen!();
    await expect(platform.showInterstitial(hooks)).resolves.toEqual({ status: 'unavailable' });
    expect(sdk.interstitialCalls).toHaveLength(0);
  });
});

describe('SDK endpoint', () => {
  it('loads the SDK from the platform root path', async () => {
    const { YANDEX_SDK_URL, SELF_HOSTED_SDK_URL } = await import('../platform/yandex');
    // A ZIP served by Yandex exposes the SDK at the site root. './sdk.js' would
    // resolve inside the game's own directory, where nothing is served.
    expect(YANDEX_SDK_URL).toBe('/sdk.js');
    expect(YANDEX_SDK_URL.startsWith('./')).toBe(false);
    expect(SELF_HOSTED_SDK_URL).toBe('https://sdk.games.s3.yandex.net/sdk.js');
  });
});
