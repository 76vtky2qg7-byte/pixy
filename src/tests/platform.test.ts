import { afterEach, describe, expect, it } from 'vitest';
import { NullPlatform } from '../platform/mock';
import type { Platform } from '../platform/types';

/**
 * What the game reports about itself when no host is there to ask.
 *
 * The null adapter runs whenever the Yandex SDK cannot load — a blocked
 * network, an ad blocker, or the build opened outside the platform. It used
 * to hardcode Russian, which handed an English speaker a Russian game and
 * went unnoticed because nothing rendered a screen in a test.
 */

const setLanguage = (value: string | undefined) => {
  if (value === undefined) {
    Reflect.deleteProperty(globalThis, 'navigator');
    return;
  }
  Object.defineProperty(globalThis, 'navigator', {
    value: { language: value },
    configurable: true,
    writable: true,
  });
};

const original = Reflect.has(globalThis, 'navigator')
  ? (globalThis.navigator as Navigator)
  : undefined;

afterEach(() => {
  if (original) setLanguage(original.language);
  else setLanguage(undefined);
});

describe('NullPlatform — language without a host', () => {
  it('follows an English browser', () => {
    setLanguage('en-US');
    expect(new NullPlatform().info.lang).toBe('en');
  });

  it('follows a Russian browser', () => {
    setLanguage('ru-RU');
    expect(new NullPlatform().info.lang).toBe('ru');
  });

  it('treats any English variant as English', () => {
    for (const tag of ['en', 'en-GB', 'EN-AU', 'en-x-whatever']) {
      setLanguage(tag);
      expect(new NullPlatform().info.lang, tag).toBe('en');
    }
  });

  it('falls back to Russian for a language it does not ship', () => {
    setLanguage('de-DE');
    expect(new NullPlatform().info.lang).toBe('ru');
  });

  it('survives having no navigator at all', () => {
    setLanguage(undefined);
    expect(() => new NullPlatform().info.lang).not.toThrow();
    expect(new NullPlatform().info.lang).toBe('ru');
  });
});

describe('NullPlatform — it promises nothing it cannot do', () => {
  it('offers no cloud save, no purchases, no authorisation', () => {
    const info = new NullPlatform().info;
    expect(info.name).toBe('none');
    expect(info.hasCloudSave).toBe(false);
    expect(info.hasPurchases).toBe(false);
    expect(info.isAuthorized).toBe(false);
  });

  it('reports ads as unavailable rather than failing', async () => {
    const p = new NullPlatform();
    expect((await p.showRewarded()).status).toBe('unavailable');
    expect((await p.showInterstitial()).status).toBe('unavailable');
    expect(p.adVisible).toBe(false);
  });

  it('loads nothing from the cloud and saving is a no-op', async () => {
    // Through the interface, because that is how the game holds it: the
    // adapter ignores the argument, but callers still pass one.
    const p: Platform = new NullPlatform();
    expect(await p.loadCloud()).toBeNull();
    await expect(p.saveCloud({} as never)).resolves.toBeUndefined();
  });
});
