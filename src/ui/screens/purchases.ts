import { PRODUCT_IDS } from '../../platform/yandex';
import type { PurchaseProduct } from '../../platform/types';
import type { AppContext } from '../app';
import { button, el, toast } from '../dom';
import { t, type StringKey } from '../i18n';

/**
 * Optional real-money extras.
 *
 * Both items are non-consumable entitlements. When the host has no configured
 * catalogue — which is the case until the developer sets one up in the console
 * — getProducts() returns nothing and this renders nothing at all: no "coming
 * soon", no dead button. Prices and titles always come from the SDK, never from
 * a hard-coded table.
 */
export function mountPurchases(ctx: AppContext, host: HTMLElement): void {
  const { app, save } = ctx;
  if (!app.platform.info.hasPurchases) return;

  const box = el('div', { class: 'col' }, el('h3', { text: t('purchases') }));
  host.append(box);

  void (async () => {
    const [products, owned] = await Promise.all([
      app.platform.getProducts(),
      app.platform.getOwned(),
    ]);
    if (!products.length) { box.remove(); return; }

    // Reconcile entitlements on every visit; this is also the restore path.
    applyEntitlements(owned);

    for (const p of products) {
      box.append(productCard(p, owned.includes(p.id)));
    }
    box.append(button(t('restorePurchases'), async () => {
      const list = await app.platform.getOwned();
      applyEntitlements(list);
      toast(t('owned'));
    }, { class: 'ghost sm' }));
  })();

  function applyEntitlements(owned: string[]): void {
    const cosmetics = owned.includes(PRODUCT_IDS.cosmetics);
    const adFree = owned.includes(PRODUCT_IDS.adFree);
    const cur = save.get().progress;
    if (cur.ownsCosmetics === cosmetics && cur.adFree === adFree) return;
    save.update((d) => {
      // Entitlements are only ever granted from the SDK's answer, and never
      // revoked locally on a failed lookup.
      d.progress.ownsCosmetics = cur.ownsCosmetics || cosmetics;
      d.progress.adFree = cur.adFree || adFree;
    });
  }

  function productCard(p: PurchaseProduct, isOwned: boolean): HTMLElement {
    const key = p.id === PRODUCT_IDS.adFree ? 'purchase_no_forced_ads' : 'purchase_foreman_kit';
    return el('div', { class: 'card' },
      el('div', { class: 'row' },
        el('div', { style: 'flex:1;min-width:0' },
          // The SDK's own title wins; ours is the fallback for an unknown id.
          el('div', { text: p.title || t(key as StringKey) }),
          el('div', { class: 'muted tiny', text: p.description || t(`${key}_desc` as StringKey) }),
        ),
        isOwned
          ? el('span', { class: 'pill tiny', text: t('owned') })
          : button(p.price, async () => {
              const res = await app.platform.purchase(p.id);
              if (!res.ok) { toast(t('adNotAvailable')); return; }
              applyEntitlements(await app.platform.getOwned());
              toast(t('owned'));
            }, { class: 'primary sm' }),
      ),
    );
  }
}
