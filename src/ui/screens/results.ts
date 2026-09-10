import { audio } from '../../audio/audio';
import { CREDITS } from '../../config/balance';
import { CONTRACTS } from '../../config/contracts';
import { analytics } from '../../platform/analytics';
import type { AppContext } from '../app';
import { button, currency, el, screen, toast } from '../dom';
import { t, tk, type StringKey } from '../i18n';

/**
 * Contract results.
 *
 * The credit breakdown states what each line was paid for. Base credits are
 * already banked before this screen renders, so the rewarded video is purely
 * additive: refusing it, or an ad failing, costs the player nothing.
 */
export function mountResults(ctx: AppContext): () => void {
  const { app, save, ui } = ctx;
  const result = app.lastResult;
  const run = app.run;
  if (!result || !run) { app.show('menu'); return () => {}; }

  const won = result.won;
  const contract = CONTRACTS.find((c) => c.id === run.contractId)!;
  const nextContract = CONTRACTS.find((c) => c.requires === contract.id);

  const s = screen({ overlay: false });
  s.head.remove();

  const title = el('div', {
    class: `result-title ${won ? 'win' : 'lose'}`,
    text: won ? t('contractComplete') : t('contractFailed'),
  });

  const summary = el('div', { class: 'card' },
    row(t('wavesSurvived'), `${result.wavesCleared} / ${result.wavesTotal}`),
    row(t('machinesScrapped'), String(result.kills)),
    row(t('scrapCollected'), String(run.scrap)),
  );

  const creditsBox = el('div', { class: 'card' });
  const creditTotal = el('span');

  function renderCredits(total: number, doubled: boolean): void {
    creditsBox.replaceChildren();
    creditsBox.append(el('h3', { text: t('creditsEarned') }));
    for (const b of result!.breakdown) {
      creditsBox.append(row(t(`reward_${b.key}` as StringKey), String(b.amount)));
    }
    if (doubled) {
      creditsBox.append(row(t('doubleCredits'), `+${total - result!.baseCredits}`));
    }
    creditTotal.replaceChildren(currency('credit'), document.createTextNode(String(total)));
    creditsBox.append(el('div', { class: 'tally total' },
      el('span', { text: t('creditsEarned') }), creditTotal));
  }
  renderCredits(result.baseCredits, false);

  /* ---- rewarded video ---- */
  // One claim per finished contract, guarded by the run's own flag so a reload
  // cannot re-open the offer, and by a local flag so a double tap cannot
  // start two ads.
  let claiming = false;
  const adBtn = button(t('doubleCredits'), async () => {
    if (claiming || run.rewardedClaimed) return;
    claiming = true;
    adBtn.dataset.keepDisabled = '1';
    adBtn.disabled = true;
    adBtn.textContent = t('adLoading');

    analytics.track({ name: 'rewarded_offer', placement: 'results' });
    let outcome = 'unavailable';
    try {
      // The pause is bound to the ad being VISIBLE, not to this await. An ad
      // can open after the promise resolves, and can stay up long after it —
      // clearing the pause here in a `finally` would unpause the game
      // underneath a still-visible ad.
      const res = await app.platform.showRewarded({
        onOpen: () => app.pause.set('ad'),
        onClose: () => app.pause.clear('ad'),
      });
      outcome = res.status;

      if (res.status === 'rewarded') {
        const bonus = result.baseCredits * (CREDITS.rewardedMultiplier - 1);
        // Mark claimed and grant in a single save write, so an interrupted
        // session can never come back and grant it again.
        run.rewardedClaimed = true;
        save.update((d) => { d.progress.credits += bonus; });
        renderCredits(result.baseCredits + bonus, true);
        audio.play('win');
        toast(t('doubled'));
        adBtn.textContent = t('doubled');
      } else if (res.status === 'closed') {
        toast(t('adNoReward'));
        adBtn.textContent = t('doubleCredits');
        adBtn.dataset.keepDisabled = '';
        adBtn.disabled = false;
      } else {
        toast(t('adNotAvailable'));
        adBtn.textContent = t('adNotAvailable');
      }
    } catch {
      toast(t('adNotAvailable'));
      adBtn.textContent = t('adNotAvailable');
    } finally {
      claiming = false;
      analytics.track({ name: 'rewarded_complete', placement: 'results', result: outcome });
    }
  }, { class: 'wide' });

  if (run.rewardedClaimed) {
    adBtn.disabled = true;
    adBtn.dataset.keepDisabled = '1';
    adBtn.textContent = t('alreadyClaimed');
  }
  const adNote = el('div', { class: 'muted tiny', style: 'text-align:center;margin-top:4px', text: t('doubleCreditsHint') });
  // Doubling zero is not an offer. If the attempt earned nothing, the ad
  // prompt is not shown at all rather than shown and useless.
  const offerAd = result.baseCredits > 0;
  if (!offerAd) { adBtn.style.display = 'none'; adNote.style.display = 'none'; }

  /* ---- navigation ---- */
  const goMenu = async () => {
    app.tutorial.reset();
    app.abandonRun();
    // The one place an interstitial may appear: after results, on the way out.
    await app.maybeShowInterstitial();
    app.show('menu');
  };

  const foot = el('div', { class: 'col', style: 'gap:8px;width:100%' });
  if (won && nextContract) {
    foot.append(button(t('nextContract'), async () => {
      app.tutorial.reset();
      app.abandonRun();
      await app.maybeShowInterstitial();
      app.show('contracts');
    }, { class: 'primary wide' }));
  } else if (!won) {
    foot.append(button(t('retry'), async () => {
      const robot = run.robotId;
      const cid = run.contractId;
      app.tutorial.reset();
      app.abandonRun();
      await app.maybeShowInterstitial();
      // Straight back into the same contract: a loss should cost seconds,
      // not a trip through three menus.
      app.startRun(cid, robot);
    }, { class: 'primary wide' }));
  }
  foot.append(button(t('toMenu'), goMenu, { class: won && nextContract ? 'wide' : 'ghost wide' }));

  s.body.append(
    el('div', { style: 'height:8px' }),
    title,
    el('div', { class: 'muted tiny', style: 'text-align:center;margin-bottom:10px', text: tk('contract', contract.id) }),
    summary,
    creditsBox,
    adBtn,
    adNote,
  );
  s.foot.append(foot);
  ui.append(s.root);

  return () => s.root.remove();
}

function row(label: string, value: string): HTMLElement {
  return el('div', { class: 'tally' }, el('span', { text: label }), el('span', { text: value }));
}
