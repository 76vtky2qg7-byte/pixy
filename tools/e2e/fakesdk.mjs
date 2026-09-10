/**
 * A controllable stand-in for the Yandex Games SDK, injected into the page
 * before any application code runs.
 *
 * This drives the REAL production adapter (src/platform/yandex.ts) rather than
 * the dev-only mock, so the ad, cloud-save and purchase code paths that ship to
 * players are the ones under test. Behaviour is chosen per test via a config
 * object placed on window.__SDK_CFG.
 */
export function fakeSdkScript(cfg = {}) {
  return `(() => {
    const cfg = ${JSON.stringify(cfg)};
    window.__SDK_CFG = cfg;
    window.__SDK_CALLS = { ready: 0, gameplayStart: 0, gameplayStop: 0, rewarded: 0, interstitial: 0, setData: 0 };
    window.__CLOUD = cfg.cloud !== undefined ? cfg.cloud : null;
    const listeners = { game_api_pause: new Set(), game_api_resume: new Set() };

    const later = (fn, ms) => setTimeout(fn, ms === undefined ? (cfg.adDelay ?? 60) : ms);

    const sdk = {
      EVENTS: { EXIT: 'EXIT', HISTORY_BACK: 'HISTORY_BACK',
        ACCOUNT_SELECTION_DIALOG_OPENED: 'ACCOUNT_SELECTION_DIALOG_OPENED',
        ACCOUNT_SELECTION_DIALOG_CLOSED: 'ACCOUNT_SELECTION_DIALOG_CLOSED' },
      environment: { i18n: { lang: cfg.lang || 'ru', tld: 'ru' }, app: { id: 'test' },
        browser: { lang: cfg.lang || 'ru' }, payload: null },
      deviceInfo: {
        isMobile: () => !!cfg.mobile, isDesktop: () => !cfg.mobile,
        isTablet: () => false, isTV: () => false, type: cfg.mobile ? 'mobile' : 'desktop',
      },
      features: {
        LoadingAPI: { ready: () => { window.__SDK_CALLS.ready++; } },
        GameplayAPI: {
          start: () => { window.__SDK_CALLS.gameplayStart++; },
          stop: () => { window.__SDK_CALLS.gameplayStop++; },
        },
      },
      adv: {
        showRewardedVideo: (opts) => {
          window.__SDK_CALLS.rewarded++;
          const cb = (opts && opts.callbacks) || {};
          const mode = cfg.rewarded || 'rewarded';
          if (mode === 'never') return;                 // callback never fires
          if (mode === 'unavailable') { later(() => cb.onError && cb.onError(new Error('no fill')), 10); return; }
          later(() => {
            cb.onOpen && cb.onOpen();
            for (const l of listeners.game_api_pause) l();
            later(() => {
              if (mode === 'error') { cb.onError && cb.onError(new Error('ad error')); return; }
              if (mode === 'rewarded' || mode === 'double') {
                cb.onRewarded && cb.onRewarded();
                if (mode === 'double') cb.onRewarded && cb.onRewarded();
              }
              for (const l of listeners.game_api_resume) l();
              cb.onClose && cb.onClose();
              // A host that fires onClose twice must not pay twice.
              if (mode === 'double') later(() => cb.onClose && cb.onClose(), 30);
            }, cfg.adDelay ?? 60);
          }, 10);
        },
        showFullscreenAdv: (opts) => {
          window.__SDK_CALLS.interstitial++;
          const cb = (opts && opts.callbacks) || {};
          const mode = cfg.interstitial || 'shown';
          if (mode === 'never') return;
          later(() => {
            if (mode === 'error') { cb.onError && cb.onError(new Error('adv error')); return; }
            if (mode === 'offline') { cb.onOffline && cb.onOffline(); return; }
            cb.onOpen && cb.onOpen();
            later(() => cb.onClose && cb.onClose(mode === 'shown'), cfg.adDelay ?? 60);
          }, 10);
        },
        showBannerAdv: async () => ({}),
        hideBannerAdv: async () => ({ stickyAdvIsShowing: false }),
        getBannerAdvStatus: async () => ({ stickyAdvIsShowing: false }),
      },
      getPlayer: async () => {
        if (cfg.noPlayer) throw new Error('no player');
        return {
          isAuthorized: () => !!cfg.authorized,
          getUniqueID: () => 'test-user',
          getName: () => 'Tester',
          getPhoto: () => '',
          getMode: () => '',
          getPayingStatus: () => 'unknown',
          getData: async () => ({ save: window.__CLOUD }),
          setData: async (d) => { window.__SDK_CALLS.setData++; window.__CLOUD = d.save; },
          getStats: async () => ({}), setStats: async () => {},
          incrementStats: async () => ({ newKeys: [], stats: {} }),
          getIDsPerGame: async () => [],
        };
      },
      getPayments: async () => {
        if (!cfg.catalog) throw new Error('payments not configured');
        return {
          getCatalog: async () => cfg.catalog,
          getPurchases: async () => (cfg.owned || []).map((id) => ({ productID: id, purchaseToken: 't-' + id })),
          purchase: async ({ id }) => {
            if (cfg.purchaseFails) throw new Error('declined');
            cfg.owned = [...(cfg.owned || []), id];
            return { productID: id, purchaseToken: 't-' + id };
          },
          consumePurchase: async () => {},
        };
      },
      getStorage: async () => window.localStorage,
      getFlags: async () => ({}),
      isAvailableMethod: async () => true,
      serverTime: () => Date.now(),
      on: (evt, fn) => { listeners[evt] && listeners[evt].add(fn); return () => listeners[evt] && listeners[evt].delete(fn); },
      off: (evt, fn) => { listeners[evt] && listeners[evt].delete(fn); },
      onEvent: () => () => {},
      dispatchEvent: async () => {},
      screen: { fullscreen: { status: 'off', STATUS_ON: 'on', STATUS_OFF: 'off', request: async () => {}, exit: async () => {} } },
      shortcut: { canShowPrompt: async () => ({ canShow: false }), showPrompt: async () => ({ outcome: 'rejected' }) },
      feedback: { canReview: async () => ({ value: false }), requestReview: async () => ({ feedbackSent: false }) },
      leaderboards: {}, multiplayer: { sessions: {} }, auth: { openAuthDialog: async () => {} },
      clipboard: { writeText: () => {} },
    };

    // Test hooks for driving host pause/resume from outside the page.
    window.__hostPause = () => { for (const l of listeners.game_api_pause) l(); };
    window.__hostResume = () => { for (const l of listeners.game_api_resume) l(); };

    window.YaGames = { init: async () => { if (cfg.initFails) throw new Error('init failed'); return sdk; } };
  })();`;
}
