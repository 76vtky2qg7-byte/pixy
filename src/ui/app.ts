import Phaser from 'phaser';
import { audio } from '../audio/audio';
import { ADS } from '../config/balance';
import { contractById, type ArenaId } from '../config/contracts';
import { ROBOTS, type RobotId } from '../config/robots';
import { Clock } from '../core/clock';
import { PauseManager } from '../core/pause';
import { analytics } from '../platform/analytics';
import { createPlatform } from '../platform/bootstrap';
import type { Platform } from '../platform/types';
import { migrate } from '../save/migrate';
import { SaveStore } from '../save/store';
import type { SaveData } from '../save/schema';
import { workshopBonuses } from '../config/upgrades';
import {
  completeWave, contractResult, createRun, isBossWave, runContract,
  wavesTotal, type RunState,
} from '../sim/run';
import { World } from '../sim/world';
import { ArenaScene } from '../render/scene';
import { computeLayout } from '../render/layout';
import { glyphsUrl, iconsUrl } from '../render/assets';
import { clear, clearToast } from './dom';
import { detectLang, setLang, t } from './i18n';
import { InputController } from './input';
import { Tutorial } from './tutorial';

export type ScreenName =
  | 'menu' | 'contracts' | 'prep' | 'game' | 'results' | 'workshop' | 'settings';

/** Everything a screen module needs from the app. */
export interface AppContext {
  app: App;
  save: SaveStore;
  platform: Platform;
  ui: HTMLElement;
}

export class App {
  save!: SaveStore;
  platform!: Platform;
  readonly pause = new PauseManager(['boot']);
  readonly clock = new Clock();
  readonly tutorial = new Tutorial(this);

  game!: Phaser.Game;
  scene!: ArenaScene;
  input!: InputController;

  world: World | null = null;
  run: RunState | null = null;
  /** Result of the wave that just ended, consumed by the results screen. */
  lastWave: { cleared: boolean; scrap: number; kills: number; seconds: number } | null = null;
  lastResult: ReturnType<typeof contractResult> | null = null;

  private uiRoot!: HTMLElement;
  private current: ScreenName = 'menu';
  private teardown: (() => void) | null = null;
  /**
   * Screens are code-split, so mounting one is asynchronous. Two `show()` calls
   * in quick succession would otherwise both append their screen and leave two
   * live UIs stacked — the second one's clear() happens before the first one's
   * import resolves. Every mount carries a token and a superseded mount tears
   * itself down instead of attaching.
   */
  private mountToken = 0;
  private waveSeconds = 0;
  private bootStart = performance.now();
  private hudUpdate: ((dt: number) => void) | null = null;
  private pendingCloudConflict: SaveData | null = null;

  /* ------------------------------------------------------------------ */
  /* boot                                                                */
  /* ------------------------------------------------------------------ */

  async boot(): Promise<void> {
    this.uiRoot = document.getElementById('ui-root')!;
    setBootProgress(0.05, 'Загрузка…');

    // Icons are referenced from CSS via custom properties so the sprite sheet
    // stays a hashed Vite asset rather than a hard-coded path.
    document.documentElement.style.setProperty('--icons', `url(${iconsUrl})`);
    document.documentElement.style.setProperty('--glyphs', `url(${glyphsUrl})`);

    this.platform = await createPlatform();
    setBootProgress(0.25);

    const lang = detectLang(this.platform.info.lang);
    const loaded = SaveStore.loadLocal(lang);
    this.save = new SaveStore(loaded.data);
    // A first run has no stored language, so follow the host; afterwards the
    // player's own choice wins.
    if (loaded.data.revision === 0) {
      this.save.update((d) => { d.settings.lang = lang; }, { cloud: false });
    }
    setLang(this.save.get().settings.lang);
    setBootProgress(0.35);

    this.save.attachCloud({
      available: () => this.platform.info.hasCloudSave,
      load: () => this.platform.loadCloud(),
      save: (data) => this.platform.saveCloud(data),
    });
    this.save.events.on('conflict', ({ cloud }) => { this.pendingCloudConflict = cloud; });

    await this.startPhaser();
    setBootProgress(0.8);

    audio.init();
    const s = this.save.get().settings;
    audio.setVolumes(s.music, s.sfx);

    this.pause.events.on('changed', ({ paused }) => {
      audio.setMuted(paused);
      this.input?.setEnabled(!paused);
      if (!paused) this.clock.reset();
    });

    this.installLifecycleHooks();
    this.save.update((d) => { d.sessions += 1; }, { cloud: false });

    // Tell the host we are done loading. From here the player controls pacing.
    this.platform.ready();
    setBootProgress(1);
    analytics.track({ name: 'game_ready', loadMs: Math.round(performance.now() - this.bootStart) });

    // Cloud reconciliation is deliberately after ready(): it must never hold up
    // the first frame the player sees.
    void this.save.syncFromCloud().then((r) => {
      if (r === 'cloud') setLang(this.save.get().settings.lang);
    });

    hideBoot();
    this.pause.clear('boot');
    this.show('menu');

    // Screens are code-split, so each one is fetched the first time it opens.
    // On a flaky connection that turns a button press into a dead screen, and
    // it makes the game unplayable offline. Pulling every chunk in once the
    // menu is up costs about 30 KB and removes the whole failure mode.
    void this.preloadScreens();
  }

  /** Warm every screen chunk. Failures are ignored; mounting retries anyway. */
  private async preloadScreens(): Promise<void> {
    await Promise.allSettled([
      import('./screens/menu'),
      import('./screens/contracts'),
      import('./screens/prep'),
      import('./screens/hud'),
      import('./screens/results'),
      import('./screens/workshop'),
      import('./screens/settings'),
      import('./screens/purchases'),
      import('./screens/conflict'),
    ]);
    this.screensPreloaded = true;
  }

  /** True once every screen chunk is cached; surfaced for diagnostics. */
  screensPreloaded = false;

  private async startPhaser(): Promise<void> {
    const parent = document.getElementById('game-canvas')!;
    const layout = computeLayout(window.innerWidth, window.innerHeight);

    this.scene = new ArenaScene({
      arena: 'sorting',
      robot: 'scrap14',
      screenShake: this.save.get().settings.screenShake,
      showDamage: this.save.get().settings.showDamage,
      onEvent: (e) => this.onSimEvent(e),
    });

    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      width: layout.width,
      height: layout.height,
      backgroundColor: '#0b1018',
      pixelArt: true,
      roundPixels: true,
      antialias: false,
      scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.NO_CENTER },
      // The simulation runs on its own fixed clock, so Phaser's physics and
      // its variable-step maths are not used at all.
      fps: { target: 60, forceSetTimeOut: false },
      audio: { noAudio: true },   // all sound goes through our own WebAudio graph
      scene: [this.scene],
    });

    this.scene.onUpdate = (dt) => this.tick(dt);
    this.input = new InputController(document.getElementById('game-surface')!);
    this.input.setStickSide(this.save.get().settings.stickSide);

    this.applyLayout();
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);

    await this.scene.whenReady;
  }

  private onResize = (): void => {
    // Debounced by rAF: iOS fires resize many times during a rotation.
    requestAnimationFrame(() => this.applyLayout());
  };

  applyLayout(): void {
    const surface = document.getElementById('game-surface')!;
    const rect = surface.getBoundingClientRect();
    const layout = computeLayout(rect.width, rect.height);
    this.game.scale.resize(layout.width, layout.height);
    const canvas = this.game.canvas;
    if (canvas) {
      canvas.style.width = `${layout.cssWidth}px`;
      canvas.style.height = `${layout.cssHeight}px`;
    }
    this.scene.applyLayout(layout);
    if (this.world) this.world.viewRadius = layout.viewRadius;
    document.documentElement.dataset.orientation = layout.portrait ? 'portrait' : 'landscape';
  }

  /**
   * Wire every source that should pause the game. Each sets its own reason, so
   * clearing one never resumes past another — closing an ad while the tab is
   * hidden leaves the game paused for `hidden`.
   */
  private installLifecycleHooks(): void {
    document.addEventListener('visibilitychange', () => {
      this.pause.toggle('hidden', document.visibilityState !== 'visible');
    });
    window.addEventListener('blur', () => this.input?.releaseAll());
    this.platform.onPause(() => this.pause.set('system'));
    this.platform.onResume(() => this.pause.clear('system'));
    window.addEventListener('pagehide', () => { void this.save.flushCloud(); });
  }

  /* ------------------------------------------------------------------ */
  /* frame                                                               */
  /* ------------------------------------------------------------------ */

  private tick(dt: number): void {
    if (this.pause.paused) return;

    if (this.world && this.current === 'game') {
      this.world.moveX = this.input.x;
      this.world.moveY = this.input.y;
      const steps = this.clock.advance(dt);
      for (let i = 0; i < steps && this.world.outcome === 'running'; i++) {
        this.world.step();
        this.waveSeconds += 1 / 60;
      }
      this.scene.render(dt);
      this.hudUpdate?.(dt);
      if (this.world.outcome !== 'running') this.finishWave();
    } else {
      // No live wave: still paint, so menus have the factory floor behind them.
      this.scene.render(dt);
      this.hudUpdate?.(dt);
    }
  }

  private onSimEvent(e: import('../sim/types').SimEvent): void {
    switch (e.t) {
      case 'hit': audio.play('hit'); break;
      case 'kill': audio.play('kill'); break;
      case 'boom': audio.play('explode'); break;
      case 'slam': audio.play('explode'); break;
      case 'zap': audio.play('zap'); break;
      case 'hurt': audio.play('hurt'); break;
      case 'warn': audio.play('warn'); break;
      case 'overheat': audio.play('overheat'); this.tutorial.trigger('heat'); break;
      case 'overdriveStart': audio.play('overdrive'); break;
      case 'bossSpawn': audio.play('boss'); audio.setMood('boss'); this.tutorial.trigger('boss'); break;
      case 'pickup':
        audio.play(e.kind === 'scrap' ? 'scrap' : 'pickup');
        if (e.kind === 'scrap') this.tutorial.trigger('collect');
        break;
      default: break;
    }
  }

  /* ------------------------------------------------------------------ */
  /* run flow                                                            */
  /* ------------------------------------------------------------------ */

  startRun(contractId: string, robotId: RobotId): void {
    const progress = this.save.get().progress;
    this.run = createRun(contractId, robotId, progress.upgrades);
    analytics.newAttempt();
    analytics.track({ name: 'run_start', contract: contractId, robot: robotId });
    this.save.update((d) => {
      d.activeRun = this.run;
      d.progress.totalRuns += 1;
    });
    this.show('prep');
  }

  /** Resume an interrupted contract from the start of its unfinished wave. */
  resumeRun(run: RunState): void {
    this.run = run;
    analytics.newAttempt();
    this.show('prep');
  }

  abandonRun(): void {
    this.run = null;
    this.disposeWorld();
    this.save.update((d) => { d.activeRun = null; });
  }

  startWave(): void {
    const run = this.run;
    if (!run) return;
    const contract = runContract(run);
    const robot = ROBOTS[run.robotId];

    this.disposeWorld();
    this.world = new World({
      contract,
      waveIndex: run.waveIndex,
      slots: run.slots,
      robot: { maxHp: robot.maxHp, speed: robot.speed },
      workshop: workshopBonuses(this.save.get().progress.upgrades),
      // Seeded per wave so a reload replays the same wave, not a new one.
      seed: run.seed + run.waveIndex * 1013,
    });
    this.waveSeconds = 0;

    this.scene.setOptions({
      arena: contract.arena as ArenaId,
      robot: run.robotId,
      screenShake: this.save.get().settings.screenShake,
      showDamage: this.save.get().settings.showDamage,
    });
    this.scene.setWorld(this.world);
    this.applyLayout();
    this.clock.reset();

    audio.setMood(isBossWave(run) ? 'boss' : 'combat');
    audio.play('waveStart');
    this.platform.gameplayStart();
    this.show('game');
  }

  private finishWave(): void {
    const w = this.world, run = this.run;
    if (!w || !run) return;
    const cleared = w.outcome === 'cleared';
    w.sweepRemainingPickups();

    this.lastWave = {
      cleared,
      scrap: w.scrapEarned,
      kills: w.kills,
      seconds: Math.round(this.waveSeconds),
    };
    this.platform.gameplayStop();
    audio.setMood('none');
    audio.play(cleared ? 'waveEnd' : 'lose');

    if (cleared) {
      analytics.track({
        name: 'wave_complete', contract: run.contractId, wave: run.waveIndex + 1,
        seconds: this.lastWave.seconds, kills: w.kills, scrap: w.scrapEarned,
      });
      const { run: next } = completeWave(run, w.scrapEarned, w.kills);
      this.run = next;
      const done = next.waveIndex >= wavesTotal(next);
      this.save.update((d) => {
        d.activeRun = done ? null : next;
        const best = d.progress.bestWave[next.contractId] ?? 0;
        d.progress.bestWave[next.contractId] = Math.max(best, next.wavesCleared);
      });
      if (done) this.endRun(true);
      else {
        this.disposeWorld();
        this.show('prep');
      }
    } else {
      this.endRun(false);
    }
  }

  private endRun(won: boolean): void {
    const run = this.run;
    if (!run) return;
    const result = contractResult(run, won);
    this.lastResult = result;
    this.run = { ...run, finished: true, won };

    this.save.update((d) => {
      d.progress.credits += result.baseCredits;
      d.progress.totalKills += run.totalKills;
      d.activeRun = null;
      d.finishedContracts += 1;
      if (won && !d.progress.wonContracts.includes(run.contractId)) {
        d.progress.wonContracts.push(run.contractId);
      }
    });

    analytics.track({
      name: 'run_end', contract: run.contractId, won,
      wave: run.wavesCleared, seconds: result.durationSeconds, credits: result.baseCredits,
    });
    audio.play(won ? 'win' : 'lose');
    this.disposeWorld();
    this.show('results');
  }

  /** Quit mid-wave: the contract is banked as a loss, nothing is lost silently. */
  quitToMenu(): void {
    if (this.world && this.run) {
      this.platform.gameplayStop();
      this.endRun(false);
      return;
    }
    this.disposeWorld();
    this.show('menu');
  }

  private disposeWorld(): void {
    if (this.world) {
      this.world.destroy();
      this.world = null;
    }
    this.scene.setWorld(null);
    this.clock.reset();
  }

  /* ------------------------------------------------------------------ */
  /* ads                                                                 */
  /* ------------------------------------------------------------------ */

  /**
   * Interstitials only ever run from the results screen, never on the first
   * session, never within the cooldown, and never for a player who bought the
   * ad-free extra. A failure at any step is silent.
   */
  async maybeShowInterstitial(): Promise<void> {
    const d = this.save.get();
    if (d.progress.adFree) return;
    if (ADS.skipFirstSession && d.sessions <= 1) return;
    if (d.finishedContracts % ADS.interstitialEveryNContracts !== 0) return;
    const since = (Date.now() - d.lastInterstitialAt) / 1000;
    if (since < ADS.interstitialCooldownSeconds) return;

    // The pause is taken when the ad opens and released when it closes, so it
    // matches how long the ad is actually on screen rather than how long this
    // call happens to take. Clearing 'ad' does NOT resume a hidden tab or an
    // open menu: those hold their own reasons.
    const res = await this.platform.showInterstitial({
      onOpen: () => this.pause.set('ad'),
      onClose: () => this.pause.clear('ad'),
    });
    if (res.status === 'shown') {
      this.save.update((s) => { s.lastInterstitialAt = Date.now(); });
    }
  }

  /* ------------------------------------------------------------------ */
  /* screens                                                             */
  /* ------------------------------------------------------------------ */

  show(name: ScreenName): void {
    const token = ++this.mountToken;
    this.teardown?.();
    this.teardown = null;
    this.hudUpdate = null;
    clearToast();
    clear(this.uiRoot);
    this.tutorial.handleScreenChange();
    this.current = name;

    // A menu is a pause reason of its own, so the wave behind it is frozen and
    // stays frozen until the player leaves the menu.
    this.pause.toggle('menu', name !== 'game');
    this.input.setEnabled(name === 'game');
    if (name !== 'game') audio.setMood(name === 'menu' || name === 'contracts' ? 'menu' : 'none');

    const ctx: AppContext = { app: this, save: this.save, platform: this.platform, ui: this.uiRoot };
    void mountScreen(name, ctx).then(
      (teardownFn) => {
        if (token !== this.mountToken) {
          // A newer show() already won; drop this screen's DOM and listeners.
          teardownFn();
          return;
        }
        this.teardown = teardownFn;
      },
      (error) => {
        // The screen's chunk could not be fetched. Never leave the player on a
        // blank screen with nothing to press.
        if (token !== this.mountToken) return;
        console.error('[sparkscrapper] screen failed to load', name, error);
        this.showScreenLoadFailure(name);
      },
    );
  }

  /** Recovery UI for a screen whose code could not be fetched. */
  private showScreenLoadFailure(name: ScreenName): void {
    clear(this.uiRoot);
    const wrap = document.createElement('div');
    wrap.className = 'screen';
    wrap.style.cssText = 'justify-content:center;align-items:center;text-align:center;gap:14px';
    const msg = document.createElement('p');
    msg.className = 'muted';
    msg.style.cssText = 'max-width:min(420px,88vw);line-height:1.45';
    msg.textContent = t('screenLoadFailed');
    const retry = document.createElement('button');
    retry.className = 'btn primary';
    retry.type = 'button';
    retry.textContent = t('retry');
    retry.addEventListener('click', () => this.show(name));
    const home = document.createElement('button');
    home.className = 'btn ghost';
    home.type = 'button';
    home.textContent = t('toMenu');
    home.addEventListener('click', () => this.show('menu'));
    wrap.append(msg, retry, home);
    this.uiRoot.append(wrap);
  }

  /** Screens register a per-frame updater (the HUD is the only user). */
  setHudUpdater(fn: ((dt: number) => void) | null): void {
    this.hudUpdate = fn;
  }

  get screen(): ScreenName {
    return this.current;
  }

  takeCloudConflict(): SaveData | null {
    const c = this.pendingCloudConflict;
    this.pendingCloudConflict = null;
    return c;
  }

  /** Contract the player is currently inside, if any. */
  get activeContract() {
    return this.run ? contractById(this.run.contractId) ?? null : null;
  }
}

/* -------------------------------------------------------------------- */
/* screen mounting                                                       */
/* -------------------------------------------------------------------- */

async function mountScreen(name: ScreenName, ctx: AppContext): Promise<() => void> {
  switch (name) {
    case 'menu': return (await import('./screens/menu')).mountMenu(ctx);
    case 'contracts': return (await import('./screens/contracts')).mountContracts(ctx);
    case 'prep': return (await import('./screens/prep')).mountPrep(ctx);
    case 'game': return (await import('./screens/hud')).mountHud(ctx);
    case 'results': return (await import('./screens/results')).mountResults(ctx);
    case 'workshop': return (await import('./screens/workshop')).mountWorkshop(ctx);
    case 'settings': return (await import('./screens/settings')).mountSettings(ctx);
  }
}

/* -------------------------------------------------------------------- */
/* boot screen                                                           */
/* -------------------------------------------------------------------- */

function setBootProgress(v: number, label?: string): void {
  const fill = document.getElementById('boot-fill');
  if (fill) fill.style.width = `${Math.round(v * 100)}%`;
  const text = document.getElementById('boot-text');
  if (text && label) text.textContent = label;
}

function hideBoot(): void {
  const boot = document.getElementById('boot');
  if (!boot) return;
  boot.classList.add('hidden');
  setTimeout(() => boot.remove(), 420);
}

/** Re-export so screens can label things without importing i18n twice. */
export { t, migrate };
