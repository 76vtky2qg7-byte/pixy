import type { App } from './app';
import { button, el } from './dom';
import { t, type StringKey } from './i18n';

/**
 * In-contract tutorial.
 *
 * Coach marks fire from real events during the first contract rather than
 * front-loading a wall of text: the player is told about heat the first time a
 * weapon overheats, about telegraph rings the first time a boss winds up. Each
 * step shows once per save and the whole thing can be skipped.
 */
export type TutorialStep =
  | 'move' | 'collect' | 'survive' | 'shop' | 'adjacency' | 'rearrange' | 'heat' | 'boss';

const ORDER: TutorialStep[] = [
  'move', 'collect', 'survive', 'shop', 'adjacency', 'rearrange', 'heat', 'boss',
];

/** Steps that pause the game while they are on screen. */
const PAUSING: ReadonlySet<TutorialStep> = new Set(['shop', 'adjacency', 'rearrange']);

export class Tutorial {
  private app: App;
  private shown = new Set<TutorialStep>();
  private node: HTMLElement | null = null;
  private scrim: HTMLElement | null = null;
  private active: TutorialStep | null = null;

  constructor(app: App) {
    this.app = app;
  }

  get enabled(): boolean {
    const d = this.app.save.get();
    // Only ever runs inside the first contract, and only until it is finished.
    return !d.progress.tutorialDone && this.app.run?.contractId === 'night_shift';
  }

  /** Fire a step if it is enabled and has not been seen. */
  trigger(step: TutorialStep): void {
    if (!this.enabled || this.shown.has(step) || this.active) return;
    this.shown.add(step);
    this.render(step);
  }

  private messageFor(step: TutorialStep): string {
    if (step === 'move') {
      const touch = matchMedia('(pointer: coarse)').matches;
      return t(touch ? 'tut_move' : 'tut_moveDesktop');
    }
    return t(`tut_${step}` as StringKey);
  }

  private render(step: TutorialStep): void {
    const root = document.getElementById('ui-root');
    if (!root) return;
    this.active = step;
    if (PAUSING.has(step)) {
      this.app.pause.set('menu');
      // A step that pauses has to actually block what is underneath it,
      // otherwise the player can start the wave out from under the hint.
      this.scrim = el('div', {
        class: 'coach-scrim',
        style: 'position:absolute;inset:0;z-index:69;background:rgba(5,8,15,.55)',
      });
      root.append(this.scrim);
    }

    const card = el('div', { class: 'coach', role: 'dialog', 'aria-live': 'polite' },
      el('p', { text: this.messageFor(step) }),
      el('div', { class: 'row' },
        button(t('tutorialSkip'), () => this.skipAll(), { class: 'ghost sm' }),
        button(t('gotIt'), () => this.dismiss(), { class: 'primary sm' }),
      ),
    );
    this.node = card;
    root.append(card);

    // Non-pausing hints time out on their own so combat is never blocked.
    if (!PAUSING.has(step)) setTimeout(() => { if (this.active === step) this.dismiss(); }, 7000);
  }

  private dismiss(): void {
    const wasPausing = this.active && PAUSING.has(this.active);
    this.node?.remove();
    this.scrim?.remove();
    this.node = this.scrim = null;
    this.active = null;
    // Only release the reason this dialog took; if a real menu is open the
    // screen router owns 'menu' and will keep it set.
    if (wasPausing && this.app.screen === 'game') this.app.pause.clear('menu');
    if (this.shown.size >= ORDER.length) this.complete();
  }

  skipAll(): void {
    for (const s of ORDER) this.shown.add(s);
    this.dismiss();
    this.complete();
  }

  private complete(): void {
    if (this.app.save.get().progress.tutorialDone) return;
    this.app.save.update((d) => { d.progress.tutorialDone = true; });
  }

  /**
   * Called on every screen change. Screens clear #ui-root wholesale, which
   * silently detaches an open coach mark; without this the tutorial would think
   * a step is still on screen and refuse to show any further hint for the rest
   * of the session.
   */
  handleScreenChange(): void {
    if (this.node && !this.node.isConnected) {
      const wasPausing = this.active && PAUSING.has(this.active);
      this.node = null;
      this.scrim = null;
      this.active = null;
      if (wasPausing) this.app.pause.clear('menu');
    }
  }

  /** Called when a contract ends, so a partial tutorial does not linger. */
  reset(): void {
    this.node?.remove();
    this.scrim?.remove();
    this.node = this.scrim = null;
    this.active = null;
    this.shown.clear();
  }

  get seenCount(): number {
    return this.shown.size;
  }
}
