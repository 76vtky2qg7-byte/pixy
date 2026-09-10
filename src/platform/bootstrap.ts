import { MockPlatform, NullPlatform, type MockAdMode } from './mock';
import type { Platform } from './types';
import { loadYandexSdk, YandexPlatform } from './yandex';

/**
 * Choose a platform.
 *
 * Production only ever gets the real Yandex adapter or the null adapter. The
 * mock is reachable exclusively in a dev build, and only when explicitly asked
 * for, so a release can never ship simulated ad revenue or fake entitlements.
 */
export async function createPlatform(): Promise<Platform> {
  const params = new URLSearchParams(globalThis.location?.search ?? '');

  if (import.meta.env.DEV && params.get('platform') === 'mock') {
    return new MockPlatform({
      adMode: (params.get('ad') as MockAdMode | null) ?? 'rewarded',
      lang: params.get('lang') === 'en' ? 'en' : 'ru',
    });
  }

  const sdk = await loadYandexSdk();
  if (!sdk) return new NullPlatform();
  try {
    return await YandexPlatform.create(sdk);
  } catch {
    return new NullPlatform();
  }
}
