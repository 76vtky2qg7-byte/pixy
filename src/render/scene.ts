import Phaser from 'phaser';
import { ARENA } from '../config/balance';
import { ARENA_TILE_BASE, type ArenaId } from '../config/contracts';
import { ENEMIES, ENEMY_TELEGRAPH_FRAMES } from '../config/enemies';
import { ROBOTS, type RobotId } from '../config/robots';
import { Rng } from '../core/rng';
import type { World } from '../sim/world';
import type { SimEvent } from '../sim/types';
import { DIGIT_CHARS, PICKUP_FRAMES, PROJ_FRAMES, SHEETS } from './assets';
import { computeLayout, type Layout } from './layout';

export interface SceneOptions {
  arena: ArenaId;
  robot: RobotId;
  screenShake: boolean;
  showDamage: boolean;
  onEvent?: (e: SimEvent) => void;
}

const floorKeyFor = (arena: ArenaId): string => `floorPatch_${arena}`;

/** Hard ceiling on simultaneous effect sprites — protects frame rate. */
const FX_BUDGET = 64;
const DAMAGE_BUDGET = 24;

/**
 * Renders a World. Owns no game logic: every frame it reads the simulation's
 * arrays and syncs sprites to them, then drains the event queue for effects.
 * Because it never subscribes to anything, there is nothing to leak between
 * waves — `destroyAll` in shutdown() is belt and braces.
 */
export class ArenaScene extends Phaser.Scene {
  private world: World | null = null;
  private opts: SceneOptions;

  private floor!: Phaser.GameObjects.TileSprite;
  private propLayer!: Phaser.GameObjects.Group;
  private shadowLayer!: Phaser.GameObjects.Group;
  private groundFx!: Phaser.GameObjects.Group;
  private entityLayer!: Phaser.GameObjects.Group;
  private airFx!: Phaser.GameObjects.Group;
  private beamGfx!: Phaser.GameObjects.Graphics;
  private zapGfx!: Phaser.GameObjects.Graphics;

  private player!: Phaser.GameObjects.Sprite;
  private playerShadow!: Phaser.GameObjects.Ellipse;
  private enemySprites: Phaser.GameObjects.Sprite[] = [];
  private enemyShadows: Phaser.GameObjects.Ellipse[] = [];
  private projSprites: Phaser.GameObjects.Sprite[] = [];
  private pickupSprites: Phaser.GameObjects.Sprite[] = [];
  private orbitSprites: Phaser.GameObjects.Sprite[] = [];
  private warnSprites: Phaser.GameObjects.Sprite[] = [];

  private fxPool: Phaser.GameObjects.Sprite[] = [];
  private damagePool: Phaser.GameObjects.BitmapText[] = [];

  private zaps: { x1: number; y1: number; x2: number; y2: number; life: number }[] = [];
  private beams: { x1: number; y1: number; x2: number; y2: number }[] = [];
  private shake = 0;
  private layout: Layout = computeLayout(360, 640);
  private animTime = 0;

  /** Driven by Phaser's loop; the app hangs its fixed-step tick off this. */
  onUpdate: ((dtSeconds: number) => void) | null = null;
  /** Resolves once preload+create have finished. */
  readonly whenReady: Promise<void>;
  private markReady!: () => void;

  constructor(opts: SceneOptions) {
    super({ key: 'arena' });
    this.opts = opts;
    this.whenReady = new Promise((res) => { this.markReady = res; });
  }

  override update(_time: number, delta: number): void {
    // Phaser reports milliseconds and can hand back a huge delta after the tab
    // was backgrounded; the app's Clock clamps it.
    this.onUpdate?.(delta / 1000);
  }

  preload(): void {
    for (const s of SHEETS) {
      this.load.spritesheet(s.key, s.url, {
        frameWidth: s.frameWidth, frameHeight: s.frameHeight,
      });
    }
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0b1018');
    this.cameras.main.setBounds(0, 0, ARENA.width, ARENA.height);
    this.cameras.main.setRoundPixels(true);

    this.buildFloorTextures();
    this.floor = this.add.tileSprite(0, 0, 64, 64, floorKeyFor(this.opts.arena))
      .setOrigin(0, 0).setDepth(-100);

    this.propLayer = this.add.group();
    this.shadowLayer = this.add.group();
    this.groundFx = this.add.group();
    this.entityLayer = this.add.group();
    this.airFx = this.add.group();

    this.beamGfx = this.add.graphics().setDepth(40);
    this.zapGfx = this.add.graphics().setDepth(45);

    this.scatterProps();
    this.buildNumberFont();

    this.playerShadow = this.add.ellipse(0, 0, 20, 8, 0x000000, 0.32).setDepth(-1);
    this.player = this.add.sprite(0, 0, 'actors', ROBOTS[this.opts.robot].frames[0]).setDepth(20);
    this.entityLayer.add(this.player);

    this.scale.on('resize', this.handleResize, this);
    this.applyLayout(this.layout);
    this.markReady();
  }

  /* ---------------- setup helpers ---------------- */

  /**
   * Compose a 4x4 patch from each arena's four tiles, so the floor has variety
   * without paying for a texture the size of the whole arena.
   *
   * These are CANVAS textures, not RenderTextures. A TileSprite has to sample
   * its source repeatedly, and a RenderTexture lives in a framebuffer that
   * cannot be sampled that way — doing so renders garbage rather than failing.
   * Drawing into a 2D canvas produces an ordinary texture that tiles correctly.
   *
   * All three arenas are built once at create(), so switching contracts between
   * waves is a texture swap rather than a rebuild.
   */
  private buildFloorTextures(): void {
    // An 8x8 patch. A 4x4 one repeats every 128px, which at any zoom reads as
    // wallpaper rather than as a floor; 8x8 pushes the repeat past the width of
    // the view and still costs only a 256x256 texture per arena.
    const cells = 8;
    const size = ARENA.tile * cells;
    const src = this.textures.get('tiles').getSourceImage() as CanvasImageSource;

    for (const arena of Object.keys(ARENA_TILE_BASE) as ArenaId[]) {
      const key = floorKeyFor(arena);
      if (this.textures.exists(key)) continue;
      const base = ARENA_TILE_BASE[arena];
      const canvasTex = this.textures.createCanvas(key, size, size);
      if (!canvasTex) continue;
      const ctx = canvasTex.getContext();
      ctx.imageSmoothingEnabled = false;
      const rng = new Rng(base * 977 + 5);
      for (let y = 0; y < cells; y++) {
        for (let x = 0; x < cells; x++) {
          // Plain concrete dominates; the detailed tiles stay occasional so the
          // floor reads as a surface rather than as a pattern.
          const roll = rng.next();
          const v = roll < 0.80 ? 0 : roll < 0.89 ? 1 : roll < 0.95 ? 2 : 3;
          const f = this.textures.getFrame('tiles', base + v);
          ctx.drawImage(
            src, f.cutX, f.cutY, f.cutWidth, f.cutHeight,
            x * ARENA.tile, y * ARENA.tile, ARENA.tile, ARENA.tile,
          );
        }
      }
      canvasTex.refresh();
    }
  }

  private scatterProps(): void {
    const rng = new Rng(4242 + ARENA_TILE_BASE[this.opts.arena]);
    for (let i = 0; i < 70; i++) {
      const s = this.add.image(
        Math.round(rng.range(80, ARENA.width - 80)),
        Math.round(rng.range(80, ARENA.height - 80)),
        'props', rng.int(0, 4),
      );
      // Props sit in the background: dimmed and desaturated so they never read
      // as something that can hurt you.
      s.setTint(0x6f7d94).setAlpha(0.7).setDepth(-50);
      this.propLayer.add(s);
    }
  }

  private rescatterProps(): void {
    this.propLayer.clear(true, true);
    this.scatterProps();
  }

  /** Register the generated 7x9 digit sheet as a Phaser retro font. */
  private buildNumberFont(): void {
    const font = Phaser.GameObjects.RetroFont.Parse(this, {
      image: 'digits',
      width: 7,
      height: 9,
      chars: DIGIT_CHARS,
      charsPerRow: DIGIT_CHARS.length,
      // The glyphs are packed edge to edge in the sheet and already carry their
      // own 1px padding, so there is no source offset or spacing to declare.
      'offset.x': 0,
      'offset.y': 0,
      'spacing.x': 0,
      'spacing.y': 0,
      lineSpacing: 0,
    });
    this.cache.bitmapFont.add('pixnum', font);
  }

  /* ---------------- lifecycle ---------------- */

  setWorld(world: World | null): void {
    this.world = world;
    if (world) {
      world.viewRadius = this.layout.viewRadius;
      this.cameras.main.centerOn(world.px, world.py);
    }
    this.clearTransient();
  }

  setOptions(patch: Partial<SceneOptions>): void {
    const prevArena = this.opts.arena;
    this.opts = { ...this.opts, ...patch };
    if (this.opts.arena !== prevArena && this.floor) {
      this.floor.setTexture(floorKeyFor(this.opts.arena));
      this.rescatterProps();
    }
  }

  private handleResize(): void {
    this.applyLayout(computeLayout(this.scale.width, this.scale.height));
  }

  applyLayout(layout: Layout): void {
    this.layout = layout;
    this.floor?.setSize(layout.width + ARENA.tile * 2, layout.height + ARENA.tile * 2);
    if (this.world) this.world.viewRadius = layout.viewRadius;
  }

  private clearTransient(): void {
    this.zaps.length = 0;
    this.beams.length = 0;
    this.shake = 0;
    for (const s of this.fxPool) s.setVisible(false).setActive(false);
    for (const d of this.damagePool) d.setVisible(false).setActive(false);
    for (const s of this.warnSprites) s.setVisible(false);
    this.beamGfx?.clear();
    this.zapGfx?.clear();
  }

  /* ---------------- frame ---------------- */

  /**
   * Called once per rendered frame with the real frame delta. The simulation is
   * stepped elsewhere on a fixed clock; this only paints the current state.
   */
  render(dt: number): void {
    const w = this.world;
    if (!w) return;
    this.animTime += dt;

    this.drainEvents(w);
    this.syncCamera(dt);
    this.syncFloor();
    this.syncPlayer(w);
    this.syncEnemies(w);
    this.syncOrbiters(w);
    this.syncProjectiles(w);
    this.syncPickups(w);
    this.syncBeamsAndZaps(dt);
    this.tickFx(dt);
  }

  private syncCamera(dt: number): void {
    const w = this.world!;
    const cam = this.cameras.main;
    // Lead the camera slightly toward travel so the player sees where they go.
    const leadX = w.pvx * 0.14, leadY = w.pvy * 0.14;
    const tx = w.px + leadX, ty = w.py + leadY;
    const k = 1 - Math.exp(-dt * 9);
    cam.scrollX += (tx - cam.width / 2 - cam.scrollX) * k;
    cam.scrollY += (ty - cam.height / 2 - cam.scrollY) * k;

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 3.2);
      if (this.opts.screenShake) {
        const m = this.shake * 5;
        cam.scrollX += (Math.random() - 0.5) * m;
        cam.scrollY += (Math.random() - 0.5) * m;
      }
    }
  }

  private syncFloor(): void {
    const cam = this.cameras.main;
    this.floor.setPosition(cam.scrollX - ARENA.tile, cam.scrollY - ARENA.tile);
    this.floor.tilePositionX = cam.scrollX - ARENA.tile;
    this.floor.tilePositionY = cam.scrollY - ARENA.tile;
  }

  private syncPlayer(w: World): void {
    const frames = ROBOTS[this.opts.robot].frames;
    const moving = Math.abs(w.pvx) + Math.abs(w.pvy) > 6;
    const f = moving && Math.floor(this.animTime * 7) % 2 ? frames[1] : frames[0];
    this.player.setFrame(f);
    this.player.setPosition(Math.round(w.px), Math.round(w.py - 6));
    this.player.setFlipX(w.facing < 0);
    // Invulnerability blinks the frame rather than tinting, so the hit still
    // reads on a dark background.
    this.player.setAlpha(w.iframe > 0 && Math.floor(this.animTime * 18) % 2 ? 0.35 : 1);
    this.player.setTint(w.overdriveTimer > 0 ? 0xffe08a : 0xffffff);
    this.playerShadow.setPosition(Math.round(w.px), Math.round(w.py + 9));
  }

  private syncEnemies(w: World): void {
    const items = w.enemies.items;
    for (let i = 0; i < items.length; i++) {
      const e = items[i];
      let s = this.enemySprites[i];
      let sh = this.enemyShadows[i];
      if (!s) {
        s = this.add.sprite(0, 0, 'actors', 4).setDepth(15);
        sh = this.add.ellipse(0, 0, 18, 7, 0x000000, 0.3).setDepth(-1);
        this.enemySprites[i] = s;
        this.enemyShadows[i] = sh;
        this.entityLayer.add(s);
        this.shadowLayer.add(sh);
      }
      if (!e.active) {
        if (s.visible) { s.setVisible(false); sh.setVisible(false); }
        continue;
      }

      if (e.boss) {
        const base = e.boss === 'press' ? 0 : 5;
        // Frames 2..4 of each boss show the wind-up; pick by telegraph progress.
        const winding = e.state === 'telegraph';
        const f = winding
          ? base + 2 + Math.min(2, Math.floor((1 - e.timer) * 3))
          : base + (Math.floor(this.animTime * 3) % 2);
        s.setTexture('bosses', f);
        sh.setSize(48, 16);
      } else {
        const def = ENEMIES[e.type];
        const tel = ENEMY_TELEGRAPH_FRAMES[e.type];
        const winding = tel && (e.state === 'telegraph' || e.state === 'armed');
        const pair = winding ? tel : def.frames;
        const f = pair[Math.floor((this.animTime + e.animT) * 6) % 2];
        s.setTexture('actors', f);
        sh.setSize(e.radius * 1.6, e.radius * 0.6);
      }

      s.setVisible(true).setPosition(Math.round(e.x), Math.round(e.y - 5));
      s.setFlipX(e.facing < 0);
      // A solid white fill for a couple of frames is the clearest "that hit"
      // signal on a dark floor; a multiply tint would barely show.
      if (e.flash > 0) s.setTintFill(0xffe6e6);
      else s.clearTint();
      sh.setVisible(true).setPosition(Math.round(e.x), Math.round(e.y + (e.boss ? 24 : 8)));
    }
  }

  private syncOrbiters(w: World): void {
    for (let i = 0; i < Math.max(this.orbitSprites.length, w.orbiters.length); i++) {
      const o = w.orbiters[i];
      let s = this.orbitSprites[i];
      if (!s && o) {
        s = this.add.sprite(0, 0, 'proj', PROJ_FRAMES.saw[0]).setDepth(22);
        this.orbitSprites[i] = s;
        this.entityLayer.add(s);
      }
      if (!s) continue;
      if (!o) { s.setVisible(false); continue; }
      const frame = PROJ_FRAMES.saw[Math.floor(this.animTime * 22) % 4];
      s.setVisible(true).setFrame(frame);
      s.setPosition(
        Math.round(w.px + Math.cos(o.angle) * o.radius),
        Math.round(w.py + Math.sin(o.angle) * o.radius),
      );
    }
  }

  private syncProjectiles(w: World): void {
    const items = w.projectiles.items;
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      let s = this.projSprites[i];
      if (!s) {
        s = this.add.sprite(0, 0, 'proj', 0).setDepth(25);
        this.projSprites[i] = s;
        this.entityLayer.add(s);
      }
      if (!p.active) { if (s.visible) s.setVisible(false); continue; }

      let frame: number;
      switch (p.kind) {
        case 'rivet': frame = PROJ_FRAMES.rivet; break;
        case 'shell': frame = PROJ_FRAMES.shell; break;
        case 'shard': frame = PROJ_FRAMES.shard; break;
        case 'plasma': frame = PROJ_FRAMES.plasma[Math.floor(this.animTime * 14) % 2]; break;
        default: frame = PROJ_FRAMES.arc[Math.floor(this.animTime * 18) % 2];
      }
      s.setVisible(true).setFrame(frame);
      s.setPosition(Math.round(p.x), Math.round(p.y));
      // Rivets and shells point where they fly; shrapnel tumbles.
      s.setRotation(p.kind === 'shard' ? p.angle : p.angle + Math.PI / 2);
    }
  }

  private syncPickups(w: World): void {
    const items = w.pickups.items;
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      let s = this.pickupSprites[i];
      if (!s) {
        s = this.add.sprite(0, 0, 'pickups', 0).setDepth(10);
        this.pickupSprites[i] = s;
        this.entityLayer.add(s);
      }
      if (!p.active) { if (s.visible) s.setVisible(false); continue; }
      const pair = PICKUP_FRAMES[p.kind];
      s.setVisible(true).setFrame(pair[Math.floor((this.animTime + p.animT) * 4) % 2]);
      s.setPosition(Math.round(p.x), Math.round(p.y));
      // Blink out over the last two seconds so a vanishing pickup is not a surprise.
      s.setAlpha(p.life < 2 ? (Math.floor(p.life * 8) % 2 ? 0.25 : 1) : 1);
    }
  }

  private syncBeamsAndZaps(dt: number): void {
    this.beamGfx.clear();
    for (const b of this.beams) {
      this.beamGfx.lineStyle(5, 0x5c1622, 0.55).lineBetween(b.x1, b.y1, b.x2, b.y2);
      this.beamGfx.lineStyle(3, 0xe04a3c, 0.9).lineBetween(b.x1, b.y1, b.x2, b.y2);
      this.beamGfx.lineStyle(1, 0xffd0a0, 1).lineBetween(b.x1, b.y1, b.x2, b.y2);
    }
    this.beams.length = 0;

    this.zapGfx.clear();
    for (let i = this.zaps.length - 1; i >= 0; i--) {
      const z = this.zaps[i];
      z.life -= dt;
      if (z.life <= 0) { this.zaps.splice(i, 1); continue; }
      const a = Math.min(1, z.life * 8);
      // Jagged path: two offset midpoints make it read as an arc, not a line.
      const mx = (z.x1 + z.x2) / 2, my = (z.y1 + z.y2) / 2;
      const nx = -(z.y2 - z.y1), ny = z.x2 - z.x1;
      const len = Math.hypot(nx, ny) || 1;
      const j = (Math.random() - 0.5) * 14;
      this.zapGfx.lineStyle(3, 0x18a5c9, a * 0.55);
      this.zapGfx.beginPath();
      this.zapGfx.moveTo(z.x1, z.y1);
      this.zapGfx.lineTo(mx + (nx / len) * j, my + (ny / len) * j);
      this.zapGfx.lineTo(z.x2, z.y2);
      this.zapGfx.strokePath();
      this.zapGfx.lineStyle(1, 0xa9f2ff, a);
      this.zapGfx.beginPath();
      this.zapGfx.moveTo(z.x1, z.y1);
      this.zapGfx.lineTo(mx + (nx / len) * j, my + (ny / len) * j);
      this.zapGfx.lineTo(z.x2, z.y2);
      this.zapGfx.strokePath();
    }
  }

  /* ---------------- effects ---------------- */

  private drainEvents(w: World): void {
    for (const e of w.events) {
      this.opts.onEvent?.(e);
      switch (e.t) {
        case 'hit':
          this.spawnFx('fx_hit', e.x, e.y, 4, 0.055, 1);
          if (this.opts.showDamage) this.spawnDamage(e.x, e.y, Math.round(e.amount));
          break;
        case 'boom':
          this.spawnFx('fx_boom', e.x, e.y, 6, 0.055, e.radius / 20);
          this.shake = Math.min(1, this.shake + 0.35);
          break;
        case 'slam':
          this.spawnFx('fx_upgrade', e.x, e.y, 5, 0.05, e.radius / 24);
          this.shake = Math.min(1, this.shake + 0.25);
          break;
        case 'pickup':
          this.spawnFx('fx_pop', e.x, e.y, 4, 0.045, 1);
          break;
        case 'zap':
          this.zaps.push({ x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, life: 0.13 });
          break;
        case 'beam':
          this.beams.push({ x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2 });
          break;
        case 'warn':
          this.spawnWarn(e.x, e.y, e.radius, e.duration);
          break;
        case 'hurt':
          this.shake = Math.min(1, this.shake + 0.5);
          this.cameras.main.flash(90, 90, 20, 20, false);
          break;
        case 'overdriveStart':
          this.spawnFx('fx_upgrade', w.px, w.py, 5, 0.07, 2);
          break;
        case 'bossSpawn':
        case 'bossPhase':
          this.shake = Math.min(1, this.shake + 0.6);
          break;
        default:
          break;
      }
    }
    w.events.length = 0;
  }

  private spawnFx(key: string, x: number, y: number, frames: number, frameTime: number, scale: number): void {
    let s = this.fxPool.find((f) => !f.active);
    if (!s) {
      if (this.fxPool.length >= FX_BUDGET) return;   // budget reached: drop it
      s = this.add.sprite(0, 0, key, 0).setDepth(50);
      this.fxPool.push(s);
      this.airFx.add(s);
    }
    s.setTexture(key, 0);
    s.setActive(true).setVisible(true);
    s.setPosition(Math.round(x), Math.round(y));
    s.setScale(scale);
    s.setAlpha(1);
    s.setData('t', 0);
    s.setData('frames', frames);
    s.setData('ft', frameTime);
  }

  private spawnWarn(x: number, y: number, radius: number, duration: number): void {
    let s = this.warnSprites.find((f) => !f.visible);
    if (!s) {
      if (this.warnSprites.length >= 20) return;
      s = this.add.sprite(0, 0, 'fx_warn', 0).setDepth(-5);
      this.warnSprites.push(s);
      this.groundFx.add(s);
    }
    s.setVisible(true).setPosition(Math.round(x), Math.round(y));
    // The art is a 64px ring drawn at radius 28, so scale to the real radius.
    s.setScale(radius / 28);
    s.setData('t', 0);
    s.setData('dur', Math.max(0.15, duration));
  }

  private spawnDamage(x: number, y: number, value: number): void {
    if (value <= 0) return;
    let d = this.damagePool.find((n) => !n.active);
    if (!d) {
      if (this.damagePool.length >= DAMAGE_BUDGET) return;
      d = this.add.bitmapText(0, 0, 'pixnum', '0').setDepth(60);
      this.damagePool.push(d);
      this.airFx.add(d);
    }
    d.setText(String(value));
    d.setActive(true).setVisible(true).setAlpha(1);
    d.setPosition(Math.round(x - d.width / 2), Math.round(y - 16));
    d.setData('t', 0);
    d.setData('vy', -26 - Math.random() * 14);
  }

  private tickFx(dt: number): void {
    for (const s of this.fxPool) {
      if (!s.active) continue;
      const t = (s.getData('t') as number) + dt;
      s.setData('t', t);
      const frames = s.getData('frames') as number;
      const ft = s.getData('ft') as number;
      const idx = Math.floor(t / ft);
      if (idx >= frames) { s.setActive(false).setVisible(false); continue; }
      s.setFrame(idx);
      s.setAlpha(1 - (t / (frames * ft)) * 0.35);
    }

    for (const s of this.warnSprites) {
      if (!s.visible) continue;
      const t = (s.getData('t') as number) + dt;
      s.setData('t', t);
      const dur = s.getData('dur') as number;
      if (t >= dur) { s.setVisible(false); continue; }
      // Ramps up as the strike approaches, and pulses so it reads as urgent.
      const p = t / dur;
      s.setFrame(Math.min(3, Math.floor(p * 4)));
      s.setAlpha(0.55 + 0.45 * Math.abs(Math.sin(t * 9)));
    }

    for (const d of this.damagePool) {
      if (!d.active) continue;
      const t = (d.getData('t') as number) + dt;
      d.setData('t', t);
      if (t >= 0.62) { d.setActive(false).setVisible(false); continue; }
      d.y += (d.getData('vy') as number) * dt;
      d.setAlpha(1 - t / 0.62);
    }
  }

  /** Screen-space position of a world point, in CSS pixels. Used to anchor
   *  DOM markers such as the off-screen boss arrow. */
  worldToScreen(x: number, y: number): { x: number; y: number } {
    const cam = this.cameras.main;
    return {
      x: (x - cam.scrollX) * this.layout.zoom,
      y: (y - cam.scrollY) * this.layout.zoom,
    };
  }

  /** Phaser lifecycle hook, invoked when the scene stops. */
  shutdown(): void {
    this.scale.off('resize', this.handleResize, this);
    this.clearTransient();
  }
}
