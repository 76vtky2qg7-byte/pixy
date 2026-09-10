import { ARENA, HEAT, PLAYER, SCALING, WAVE } from '../config/balance';
import { BOSSES, ENEMIES, type BossId, type EnemyId } from '../config/enemies';
import type { ContractDef, WaveDef } from '../config/contracts';
import { contractEffects } from '../config/contracts';
import { WEAPONS } from '../config/gear';
import type { WorkshopBonuses } from '../config/upgrades';
import { clamp, dist, dist2, TAU } from '../core/math';
import { Rng } from '../core/rng';
import { SIM_STEP } from '../core/clock';
import { resolveGrid, weaponRuntime, type Slots, type WeaponRuntime } from './grid';
import { Pool } from './pool';
import { SpatialHash } from './spatial';
import type {
  Enemy, Hazard, Orbiter, Pickup, Projectile, SimEvent, WeaponState,
} from './types';

export interface WorldConfig {
  contract: ContractDef;
  waveIndex: number;
  slots: Slots;
  robot: { maxHp: number; speed: number };
  workshop: WorkshopBonuses;
  seed: number;
}

export type WaveOutcome = 'running' | 'cleared' | 'failed';

let uidCounter = 1;
const nextUid = () => uidCounter++;

/** Reset between tests so uids are reproducible. */
export const __resetUids = () => { uidCounter = 1; };

export class World {
  readonly cfg: WorldConfig;
  readonly rng: Rng;
  readonly events: SimEvent[] = [];

  // ---- player ----
  px = 0; py = 0;
  pvx = 0; pvy = 0;
  facing = 1;
  hp = 0;
  maxHp = 0;
  speed = 0;
  pickupRadius = 0;
  regen = 0;
  iframe = 0;
  revives = 0;
  moveX = 0; moveY = 0;   // input, -1..1

  overdrive = 0;
  overdriveTimer = 0;

  // ---- wave ----
  readonly wave: WaveDef;
  readonly waveNumber: number;   // 1-based across the contract
  timeLeft = 0;
  elapsed = 0;
  outcome: WaveOutcome = 'running';
  scrapEarned = 0;
  kills = 0;
  private spawnBudget = 0;
  private spawnAccumulator = 0;
  private sweeping = 0;
  private bossUid = -1;

  // ---- entities ----
  readonly enemies = new Pool<Enemy>(makeEnemy, resetEnemy, 220, 64);
  readonly projectiles = new Pool<Projectile>(makeProjectile, resetProjectile, 420, 96);
  readonly pickups = new Pool<Pickup>(makePickup, resetPickup, 320, 64);
  readonly hazards = new Pool<Hazard>(makeHazard, resetHazard, 48, 12);
  readonly orbiters: Orbiter[] = [];
  readonly weapons: WeaponState[] = [];
  private runtimes = new Map<number, WeaponRuntime>();

  private enemyHash = new SpatialHash<Enemy>(72);
  private scratch: Enemy[] = [];
  private scratch2: Enemy[] = [];

  /** Half-diagonal of the visible area; spawns sit just outside it. */
  viewRadius = 420;

  private effects: ReturnType<typeof contractEffects>;
  private hpScale = 1;
  private dmgScale = 1;
  private speedScale = 1;
  private scrapScale = 1;
  /** Bosses are hand-tuned per contract, so they skip the per-wave curve. */
  private bossDmgScale = 1;

  constructor(cfg: WorldConfig) {
    this.cfg = cfg;
    this.rng = new Rng(cfg.seed);
    this.wave = cfg.contract.waves[cfg.waveIndex];
    this.waveNumber = cfg.waveIndex + 1;
    this.effects = contractEffects(cfg.contract);

    const w = cfg.waveIndex;      // 0-based
    const tier = cfg.contract.tier;
    this.hpScale = (1 + SCALING.hpPerWave * w) * (1 + SCALING.hpPerTier * tier) * this.effects.enemyHp;
    this.dmgScale = (1 + SCALING.damagePerWave * w) * (1 + SCALING.damagePerTier * tier);
    this.speedScale = (1 + SCALING.speedPerWave * w) * this.effects.enemySpeed;
    this.bossDmgScale = 1 + SCALING.damagePerTier * tier;
    this.scrapScale = this.effects.scrapGain * cfg.workshop.scrapGain;

    this.px = ARENA.width / 2;
    this.py = ARENA.height / 2;
    this.applyLoadout();

    this.timeLeft = this.wave.duration;
    this.spawnBudget = this.wave.budget;

    if (this.wave.boss) this.spawnBoss(this.wave.boss);
    for (let i = 0; i < (this.wave.opener ?? 0); i++) this.spawnFromMix();
  }

  /* ------------------------------------------------------------------ */
  /* setup                                                               */
  /* ------------------------------------------------------------------ */

  /** Rebuild derived player stats and weapon runtimes from the panel. */
  applyLoadout(): void {
    const res = resolveGrid(this.cfg.slots);
    const wb = this.cfg.workshop;

    const prevMax = this.maxHp;
    this.maxHp = Math.round(this.cfg.robot.maxHp + wb.maxHp + res.player.maxHp);
    // First build: start at full. Later rebuilds keep current HP but honour a
    // raised ceiling, so re-equipping mid-contract never silently heals.
    this.hp = prevMax === 0 ? this.maxHp : Math.min(this.hp + Math.max(0, this.maxHp - prevMax), this.maxHp);
    this.speed = this.cfg.robot.speed * wb.moveSpeed * (1 + res.player.moveSpeed);
    this.pickupRadius = (PLAYER.pickupRadius + res.player.pickupRadius) * wb.pickupRadius;
    this.regen = wb.regen + res.player.regen;
    this.revives = wb.revives;

    this.weapons.length = 0;
    this.orbiters.length = 0;
    this.runtimes.clear();

    for (const rw of res.weapons) {
      const rt = weaponRuntime(rw, wb.damage);
      this.runtimes.set(rw.cell, rt);
      this.weapons.push({
        cell: rw.cell, id: rw.weapon, cooldown: 0, heat: 0,
        overheated: false, angle: this.rng.angle(), tick: 0, kills: 0,
      });
      if (WEAPONS[rw.weapon].behaviour === 'orbit') {
        for (let i = 0; i < rt.projectiles; i++) {
          this.orbiters.push({
            cell: rw.cell,
            angle: (i / rt.projectiles) * TAU,
            radius: rt.range,
            damage: rt.damage,
            knockback: rt.knockback,
            armorPierce: rt.armorPierce,
            scrapBonus: rt.scrapBonus,
            cooldowns: new Map(),
            hitCooldown: rt.hitCooldown,
          });
        }
      }
    }
  }

  runtime(cell: number): WeaponRuntime | undefined {
    return this.runtimes.get(cell);
  }

  /* ------------------------------------------------------------------ */
  /* main step                                                           */
  /* ------------------------------------------------------------------ */

  step(): void {
    if (this.outcome !== 'running') return;
    const dt = SIM_STEP;
    this.elapsed += dt;

    this.stepPlayer(dt);
    this.enemyHash.rebuild(this.enemies.items);
    this.stepSpawning(dt);
    this.stepEnemies(dt);
    this.stepWeapons(dt);
    this.stepProjectiles(dt);
    this.stepHazards(dt);
    this.stepPickups(dt);
    this.stepWaveClock(dt);

    this.enemies.compact();
    this.projectiles.compact();
    this.pickups.compact();
    this.hazards.compact();
  }

  /* ------------------------------------------------------------------ */
  /* player                                                              */
  /* ------------------------------------------------------------------ */

  private stepPlayer(dt: number): void {
    let mx = this.moveX, my = this.moveY;
    const mag = Math.hypot(mx, my);
    if (mag > 1) { mx /= mag; my /= mag; }

    const boost = this.overdriveTimer > 0 ? 1.08 : 1;
    this.pvx = mx * this.speed * boost;
    this.pvy = my * this.speed * boost;
    this.px = clamp(this.px + this.pvx * dt, ARENA.wallInset, ARENA.width - ARENA.wallInset);
    this.py = clamp(this.py + this.pvy * dt, ARENA.wallInset, ARENA.height - ARENA.wallInset);
    if (Math.abs(mx) > 0.05) this.facing = mx > 0 ? 1 : -1;

    if (this.iframe > 0) this.iframe -= dt;
    if (this.regen > 0 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + this.regen * dt);
    }

    if (this.overdriveTimer > 0) {
      this.overdriveTimer -= dt;
      if (this.overdriveTimer <= 0) {
        this.overdriveTimer = 0;
        this.events.push({ t: 'overdriveEnd' });
      }
    }
  }

  hurtPlayer(amount: number, sourceX: number, sourceY: number): void {
    if (this.iframe > 0 || this.outcome !== 'running') return;
    this.hp -= amount;
    this.iframe = PLAYER.iframes;
    this.events.push({ t: 'hurt', x: this.px, y: this.py, amount });
    // small shove away from the source, so a hit reads physically
    const d = Math.hypot(this.px - sourceX, this.py - sourceY) || 1;
    this.px = clamp(this.px + ((this.px - sourceX) / d) * 9, ARENA.wallInset, ARENA.width - ARENA.wallInset);
    this.py = clamp(this.py + ((this.py - sourceY) / d) * 9, ARENA.wallInset, ARENA.height - ARENA.wallInset);

    if (this.hp <= 0) {
      if (this.revives > 0) {
        this.revives--;
        this.hp = this.maxHp * 0.4;
        this.iframe = 2.2;
        this.events.push({ t: 'revived' });
        // clear the immediate area so the revive is not instantly wasted
        this.enemyHash.query(this.px, this.py, 150, this.scratch);
        for (const e of this.scratch) {
          if (e.active && !e.boss) this.damageEnemy(e, 9999, 99, 0, 0, 0);
        }
      } else {
        this.hp = 0;
        this.outcome = 'failed';
        this.events.push({ t: 'playerDown' });
      }
    }
  }

  private addOverdrive(amount: number): void {
    if (this.overdriveTimer > 0) return;
    this.overdrive = Math.min(PLAYER.overdriveMax, this.overdrive + amount);
    if (this.overdrive >= PLAYER.overdriveMax) {
      this.overdrive = 0;
      this.overdriveTimer = PLAYER.overdriveDuration;
      this.events.push({ t: 'overdriveStart' });
    }
  }

  /* ------------------------------------------------------------------ */
  /* spawning                                                            */
  /* ------------------------------------------------------------------ */

  private spawnPoint(): { x: number; y: number } {
    const r = this.viewRadius + ARENA.spawnMargin;
    const a = this.rng.angle();
    // Clamp into the arena; near a wall this pulls spawns along the border
    // rather than dropping them, so a cornered player still gets pressure.
    return {
      x: clamp(this.px + Math.cos(a) * r, ARENA.wallInset, ARENA.width - ARENA.wallInset),
      y: clamp(this.py + Math.sin(a) * r, ARENA.wallInset, ARENA.height - ARENA.wallInset),
    };
  }

  private pickType(): EnemyId | null {
    const mix = this.wave.mix;
    let total = 0;
    for (const v of Object.values(mix)) total += v ?? 0;
    if (total <= 0) return null;
    let roll = this.rng.next() * total;
    for (const [id, w] of Object.entries(mix)) {
      roll -= w ?? 0;
      if (roll <= 0) return id as EnemyId;
    }
    return Object.keys(mix)[0] as EnemyId;
  }

  private stepSpawning(dt: number): void {
    if (this.spawnBudget <= 0) return;
    if (this.enemies.activeCount >= WAVE.maxAlive) return;
    // Boss waves trickle adds; timed waves release the budget across the wave.
    const span = this.wave.boss ? 26 : Math.max(4, this.wave.duration - 6);
    this.spawnAccumulator += (this.wave.budget / span) * dt;
    while (this.spawnAccumulator >= 1 && this.spawnBudget > 0) {
      this.spawnAccumulator -= 1;
      this.spawnFromMix();
    }
  }

  private spawnFromMix(): Enemy | null {
    if (this.spawnBudget <= 0) return null;
    const type = this.pickType();
    if (!type) return null;
    this.spawnBudget--;
    return this.spawnEnemy(type);
  }

  spawnEnemy(type: EnemyId, at?: { x: number; y: number }): Enemy | null {
    const e = this.enemies.spawn();
    if (!e) return null;
    const def = ENEMIES[type];
    const p = at ?? this.spawnPoint();
    e.uid = nextUid();
    e.type = type;
    e.boss = null;
    e.x = p.x; e.y = p.y;
    e.vx = 0; e.vy = 0;
    e.maxHp = Math.round(def.hp * this.hpScale);
    e.hp = e.maxHp;
    e.speed = def.speed * this.speedScale;
    e.radius = def.radius;
    e.armor = def.armor;
    e.poise = def.poise;
    e.scrap = def.scrap;
    e.contactDamage = def.contactDamage * this.dmgScale;
    e.contactCooldown = def.contactCooldown;
    e.contactTimer = 0;
    e.state = 'approach';
    e.timer = 0;
    e.jitter = this.rng.range(-0.5, 0.5);
    e.animT = this.rng.next() * 2;
    return e;
  }

  private spawnBoss(id: BossId): void {
    const def = BOSSES[id];
    const e = this.enemies.spawn();
    if (!e) return;
    e.uid = nextUid();
    this.bossUid = e.uid;
    e.type = 'crusher';           // unused for bosses; renderer keys off `boss`
    e.boss = id;
    e.x = this.px;
    e.y = clamp(this.py - this.viewRadius * 0.72, ARENA.wallInset, ARENA.height - ARENA.wallInset);
    e.maxHp = Math.round(def.hp * (1 + SCALING.hpPerTier * this.cfg.contract.tier) * this.effects.enemyHp);
    e.hp = e.maxHp;
    e.speed = def.phases[0].speed;
    e.radius = def.radius;
    e.armor = def.armor;
    e.poise = 1;
    e.scrap = def.scrap;
    e.contactDamage = def.contactDamage * this.bossDmgScale;
    e.contactCooldown = 1;
    e.phase = 0;
    e.attackTimer = def.phases[0].attackCooldown;
    e.summonTimer = def.phases[0].summonEvery;
    e.state = 'approach';
    this.events.push({ t: 'bossSpawn', boss: id });
  }

  get boss(): Enemy | null {
    if (this.bossUid < 0) return null;
    for (const e of this.enemies.items) {
      if (e.active && e.uid === this.bossUid) return e;
    }
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* enemies                                                             */
  /* ------------------------------------------------------------------ */

  private stepEnemies(dt: number): void {
    for (const e of this.enemies.items) {
      if (!e.active) continue;
      e.animT += dt;
      if (e.flash > 0) e.flash -= dt;
      if (e.contactTimer > 0) e.contactTimer -= dt;

      if (e.boss) this.stepBoss(e, dt);
      else this.stepEnemyAi(e, dt);

      // integrate with a light separation shove so bodies do not stack
      e.x = clamp(e.x + e.vx * dt, 8, ARENA.width - 8);
      e.y = clamp(e.y + e.vy * dt, 8, ARENA.height - 8);
      // knockback decay
      e.vx *= 0.86; e.vy *= 0.86;

      // contact damage
      if (e.contactDamage > 0 && e.contactTimer <= 0) {
        const rr = (e.radius + PLAYER.radius) ** 2;
        if (dist2(e.x, e.y, this.px, this.py) <= rr) {
          e.contactTimer = e.contactCooldown;
          this.hurtPlayer(e.contactDamage, e.x, e.y);
        }
      }
    }
    this.separate();
  }

  /** Cheap pairwise push-apart within the spatial hash, one pass per frame. */
  private separate(): void {
    for (const e of this.enemies.items) {
      if (!e.active || e.boss) continue;
      this.enemyHash.query(e.x, e.y, e.radius * 2, this.scratch);
      for (const o of this.scratch) {
        if (o === e || !o.active) continue;
        const dx = o.x - e.x, dy = o.y - e.y;
        const need = e.radius + o.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 > need * need || d2 < 1e-4) continue;
        const d = Math.sqrt(d2);
        const push = (need - d) * 0.28;
        const nx = dx / d, ny = dy / d;
        e.x -= nx * push; e.y -= ny * push;
        if (!o.boss) { o.x += nx * push; o.y += ny * push; }
      }
    }
  }

  private moveToward(e: Enemy, tx: number, ty: number, dt: number, scale = 1): void {
    const dx = tx - e.x, dy = ty - e.y;
    // Jitter fans a crowd out into an arc instead of a single-file queue.
    const a = Math.atan2(dy, dx) + e.jitter * 0.35;
    e.x += Math.cos(a) * e.speed * scale * dt;
    e.y += Math.sin(a) * e.speed * scale * dt;
    e.facing = dx > 0 ? 1 : -1;
  }

  private stepEnemyAi(e: Enemy, dt: number): void {
    const def = ENEMIES[e.type];
    const d = dist(e.x, e.y, this.px, this.py);

    switch (def.behaviour) {
      case 'chase':
        this.moveToward(e, this.px, this.py, dt);
        break;

      case 'dart': {
        // Darts in bursts and pauses — it overshoots, then re-acquires.
        e.timer -= dt;
        if (e.timer <= 0) {
          e.state = e.state === 'approach' ? 'recover' : 'approach';
          e.timer = e.state === 'approach' ? this.rng.range(0.8, 1.3) : this.rng.range(0.18, 0.35);
        }
        this.moveToward(e, this.px, this.py, dt, e.state === 'approach' ? 1 : 0.25);
        break;
      }

      case 'shield':
        // Never staggers, always closes. Poise is applied in damageEnemy.
        this.moveToward(e, this.px, this.py, dt);
        break;

      case 'shooter': {
        const stand = def.standoff ?? 200;
        if (e.state === 'telegraph') {
          e.timer -= dt;
          if (e.timer <= 0) {
            this.fireEnemyShot(e, def.shotDamage ?? 10, def.shotSpeed ?? 200);
            e.state = 'recover';
            e.timer = 1.1;
          }
        } else if (e.state === 'recover') {
          e.timer -= dt;
          if (e.timer <= 0) e.state = 'approach';
          this.moveToward(e, this.px, this.py, dt, d < stand * 0.8 ? -0.7 : 0.3);
        } else {
          if (d > stand * 1.15) this.moveToward(e, this.px, this.py, dt);
          else if (d < stand * 0.75) this.moveToward(e, this.px, this.py, dt, -0.8);
          else {
            e.state = 'telegraph';
            e.timer = def.telegraph ?? 0.8;
            // The warning is a real, visible ring aimed where the shot goes.
            this.events.push({
              t: 'warn', x: this.px, y: this.py, radius: 34, duration: e.timer,
            });
          }
        }
        break;
      }

      case 'bomber': {
        if (e.state === 'armed') {
          e.timer -= dt;
          if (e.timer <= 0) {
            this.detonate(e, def.blastDamage ?? 25, def.blastRadius ?? 80);
            return;
          }
          this.moveToward(e, this.px, this.py, dt, 0.35);
        } else {
          this.moveToward(e, this.px, this.py, dt);
          if (d < (def.blastRadius ?? 80) * 0.7) {
            e.state = 'armed';
            e.timer = def.fuse ?? 1.2;
            this.events.push({
              t: 'warn', x: e.x, y: e.y, radius: def.blastRadius ?? 80, duration: e.timer,
            });
          }
        }
        break;
      }

      case 'support': {
        const stand = def.standoff ?? 170;
        // Hang back behind the pack, and top up whoever is hurt nearby.
        if (d < stand) this.moveToward(e, this.px, this.py, dt, -0.75);
        else if (d > stand * 1.5) this.moveToward(e, this.px, this.py, dt, 0.7);

        e.healTimer -= dt;
        if (e.healTimer <= 0) {
          e.healTimer = def.healInterval ?? 1.7;
          const r = def.healRadius ?? 130;
          this.enemyHash.query(e.x, e.y, r, this.scratch);
          for (const o of this.scratch) {
            if (!o.active || o === e || o.hp >= o.maxHp) continue;
            o.hp = Math.min(o.maxHp, o.hp + (def.healAmount ?? 6));
            this.events.push({ t: 'zap', x1: e.x, y1: e.y, x2: o.x, y2: o.y });
          }
        }
        break;
      }
    }
  }

  private fireEnemyShot(e: Enemy, damage: number, speed: number): void {
    const p = this.projectiles.spawn();
    if (!p) return;
    const a = Math.atan2(this.py - e.y, this.px - e.x);
    p.uid = nextUid();
    p.kind = 'plasma';
    p.x = e.x; p.y = e.y;
    p.vx = Math.cos(a) * speed;
    p.vy = Math.sin(a) * speed;
    p.life = 4;
    p.damage = damage * this.dmgScale;
    p.radius = 6;
    p.hostile = true;
    p.angle = a;
  }

  private detonate(e: Enemy, damage: number, radius: number): void {
    this.events.push({ t: 'boom', x: e.x, y: e.y, radius });
    if (dist2(e.x, e.y, this.px, this.py) <= radius * radius) {
      this.hurtPlayer(damage * this.dmgScale, e.x, e.y);
    }
    // A kegger's blast also hurts its own side — a real crowd-control tool.
    this.enemyHash.query(e.x, e.y, radius, this.scratch);
    for (const o of this.scratch) {
      if (!o.active || o === e) continue;
      this.damageEnemy(o, damage * 0.6, 2, 0, 0, 0);
    }
    this.killEnemy(e, false);
  }

  /* ------------------------------------------------------------------ */
  /* boss                                                                */
  /* ------------------------------------------------------------------ */

  private stepBoss(e: Enemy, dt: number): void {
    const def = BOSSES[e.boss!];
    const frac = e.hp / e.maxHp;
    // advance phase when HP crosses the next threshold
    while (e.phase + 1 < def.phases.length && frac <= def.phases[e.phase + 1].atHpFraction) {
      e.phase++;
      e.speed = def.phases[e.phase].speed;
      this.events.push({ t: 'bossPhase', phase: e.phase });
    }
    const ph = def.phases[e.phase];

    this.moveToward(e, this.px, this.py, dt, e.state === 'telegraph' ? 0.15 : 0.75);

    e.summonTimer -= dt;
    if (e.summonTimer <= 0) {
      e.summonTimer = ph.summonEvery;
      for (let i = 0; i < ph.summonCount; i++) this.spawnEnemy(ph.summonType);
    }

    e.attackTimer -= dt;
    if (e.state === 'telegraph') {
      e.timer -= dt;
      if (e.timer <= 0) {
        e.state = 'approach';
        this.resolveBossAttack(e, def, ph);
      }
    } else if (e.attackTimer <= 0) {
      e.state = 'telegraph';
      e.timer = ph.telegraph;
      e.attackTimer = ph.attackCooldown + ph.telegraph;
      this.telegraphBossAttack(e, def, ph);
    }
  }

  private telegraphBossAttack(
    e: Enemy, def: typeof BOSSES[BossId], ph: typeof BOSSES[BossId]['phases'][number],
  ): void {
    if (def.attack === 'slam') {
      // One ring under the player, plus extra rings in later phases.
      for (let i = 0; i < ph.volleys; i++) {
        const a = this.rng.angle();
        const off = i === 0 ? 0 : this.rng.range(70, 190);
        const h = this.hazards.spawn();
        if (!h) continue;
        h.uid = nextUid();
        h.x = clamp(this.px + Math.cos(a) * off, 30, ARENA.width - 30);
        h.y = clamp(this.py + Math.sin(a) * off, 30, ARENA.height - 30);
        h.radius = def.attackRadius;
        h.damage = def.attackDamage * this.bossDmgScale;
        h.delay = ph.telegraph;
        h.linger = 0.22;
        h.hostile = true;
        this.events.push({ t: 'warn', x: h.x, y: h.y, radius: h.radius, duration: ph.telegraph });
      }
    } else {
      this.events.push({ t: 'warn', x: e.x, y: e.y, radius: 130, duration: ph.telegraph });
    }
  }

  private resolveBossAttack(
    e: Enemy, def: typeof BOSSES[BossId], ph: typeof BOSSES[BossId]['phases'][number],
  ): void {
    if (def.attack === 'slam') return;  // hazards resolve themselves
    // Radial burst with a safe corridor to walk through. The gap widens with
    // the volley count so a denser ring stays as findable as a sparse one —
    // a single missing bullet out of fourteen is not a gap a player can see.
    const base = this.rng.angle();
    const gapWidth = Math.max(2, Math.round(ph.volleys / 5));
    const gapStart = this.rng.int(0, ph.volleys);
    for (let i = 0; i < ph.volleys; i++) {
      const rel = (i - gapStart + ph.volleys) % ph.volleys;
      if (rel < gapWidth) continue;
      const p = this.projectiles.spawn();
      if (!p) break;
      const a = base + (i / ph.volleys) * TAU;
      p.uid = nextUid();
      p.kind = 'plasma';
      p.x = e.x; p.y = e.y;
      p.vx = Math.cos(a) * 175;
      p.vy = Math.sin(a) * 175;
      p.life = 5;
      p.damage = def.attackDamage * this.bossDmgScale;
      p.radius = 7;
      p.hostile = true;
      p.angle = a;
    }
  }

  /* ------------------------------------------------------------------ */
  /* damage                                                              */
  /* ------------------------------------------------------------------ */

  damageEnemy(
    e: Enemy, amount: number, armorPierce: number,
    kbx: number, kby: number, knockback: number, scrapBonus = 0,
  ): boolean {
    if (!e.active) return false;
    const armor = Math.max(0, e.armor - armorPierce);
    // Armour subtracts flat damage, but never below a quarter of the raw hit.
    // Without this floor a fast, low-damage weapon (the Beam ticks for ~2.6)
    // is reduced to literally 1 damage by a 4-armour Bulwark, which reads as
    // the weapon being broken rather than as a reason to fit a Piston.
    const dealt = Math.max(1, Math.max(amount * 0.25, amount - armor));
    e.hp -= dealt;
    e.flash = 0.11;
    if (knockback > 0 && e.poise < 1) {
      const m = knockback * (1 - e.poise);
      e.vx += kbx * m;
      e.vy += kby * m;
    }
    const killed = e.hp <= 0;
    this.events.push({ t: 'hit', x: e.x, y: e.y, amount: dealt, killed });
    if (killed) this.killEnemy(e, true, scrapBonus);
    return killed;
  }

  private killEnemy(e: Enemy, drop: boolean, scrapBonus = 0): void {
    const wasBoss = !!e.boss;
    this.events.push({
      t: 'kill', x: e.x, y: e.y, enemy: e.type, boss: wasBoss,
    });
    this.kills++;

    if (drop) {
      const value = Math.max(1, Math.round(e.scrap * (1 + scrapBonus) * this.scrapScale));
      this.dropPickup('scrap', e.x, e.y, value);
      if (this.rng.next() < WAVE.sparkChance) this.dropPickup('spark', e.x, e.y, 1);
      if (this.rng.next() < WAVE.cellDropChance) this.dropPickup('cell', e.x, e.y, 12);
      if (wasBoss) {
        for (let i = 0; i < 8; i++) this.dropPickup('scrap', e.x, e.y, Math.round(e.scrap / 4));
        this.dropPickup('cell', e.x, e.y, 30);
      }
    }

    this.enemies.release(e);
    if (wasBoss) {
      this.bossUid = -1;
      this.sweepRemainingPickups();
      this.outcome = 'cleared';
      this.events.push({ t: 'waveCleared' });
    }
  }

  private dropPickup(kind: Pickup['kind'], x: number, y: number, value: number): void {
    const p = this.pickups.spawn();
    if (!p) return;
    const a = this.rng.angle();
    const s = this.rng.range(20, 70);
    p.uid = nextUid();
    p.kind = kind;
    p.x = x; p.y = y;
    p.vx = Math.cos(a) * s;
    p.vy = Math.sin(a) * s;
    p.value = value;
    p.life = 26;
    p.homing = false;
    p.animT = this.rng.next() * 2;
  }

  /* ------------------------------------------------------------------ */
  /* weapons                                                             */
  /* ------------------------------------------------------------------ */

  private stepWeapons(dt: number): void {
    const odFire = this.overdriveTimer > 0 ? PLAYER.overdriveFireRate : 1;
    const odDmg = this.overdriveTimer > 0 ? PLAYER.overdriveDamage : 1;

    for (const w of this.weapons) {
      const rt = this.runtimes.get(w.cell);
      if (!rt) continue;
      const def = WEAPONS[w.id];

      // heat dissipation
      const cool = HEAT.cooling * rt.cooling * (w.overheated ? HEAT.overheatedCooling : 1);
      w.heat = Math.max(0, w.heat - cool * dt);
      if (w.overheated && w.heat <= HEAT.capacity * HEAT.clearAt) {
        w.overheated = false;
        this.events.push({ t: 'cooled', cell: w.cell });
      }
      const ratePenalty = w.overheated ? HEAT.overheatedPenalty : 1;

      if (def.behaviour === 'orbit') { this.stepOrbit(w, rt, dt, odDmg); continue; }
      if (def.behaviour === 'beam') { this.stepBeam(w, rt, dt, odDmg, ratePenalty); continue; }

      w.cooldown -= dt;
      if (w.cooldown > 0) continue;
      const target = this.nearestEnemy(this.px, this.py, rt.range);
      if (def.behaviour !== 'slam' && !target) continue;
      if (def.behaviour === 'slam' && !this.anyEnemyWithin(rt.area)) continue;

      w.cooldown = rt.cooldown * odFire * ratePenalty;
      this.addHeat(w, rt.heatGain);

      switch (def.behaviour) {
        case 'bolt':  this.fireBolt(rt, target!, odDmg); break;
        case 'chain': this.fireChain(rt, target!, odDmg); break;
        case 'mortar': this.fireMortar(rt, odDmg); break;
        case 'slam':  this.fireSlam(rt, odDmg); break;
      }
    }
  }

  private addHeat(w: WeaponState, amount: number): void {
    w.heat += amount;
    if (!w.overheated && w.heat >= HEAT.capacity) {
      w.overheated = true;
      this.events.push({ t: 'overheat', cell: w.cell });
    }
  }

  private nearestEnemy(x: number, y: number, range: number, exclude?: Set<number>): Enemy | null {
    this.enemyHash.query(x, y, range, this.scratch);
    let best: Enemy | null = null;
    let bestD = range * range;
    for (const e of this.scratch) {
      if (!e.active || exclude?.has(e.uid)) continue;
      const d2 = dist2(x, y, e.x, e.y);
      if (d2 <= bestD) { bestD = d2; best = e; }
    }
    return best;
  }

  private anyEnemyWithin(radius: number): boolean {
    this.enemyHash.query(this.px, this.py, radius, this.scratch);
    for (const e of this.scratch) {
      if (e.active && dist2(e.x, e.y, this.px, this.py) <= radius * radius) return true;
    }
    return false;
  }

  // --- bolt: fast projectile at the nearest target, fanned when multi-shot ---
  private fireBolt(rt: WeaponRuntime, target: Enemy, odDmg: number): void {
    const baseA = Math.atan2(target.y - this.py, target.x - this.px);
    const n = rt.projectiles;
    const spread = n > 1 ? 0.16 : 0;
    for (let i = 0; i < n; i++) {
      const p = this.projectiles.spawn();
      if (!p) return;
      const a = baseA + (i - (n - 1) / 2) * spread;
      p.uid = nextUid();
      p.kind = 'rivet';
      p.x = this.px; p.y = this.py;
      p.vx = Math.cos(a) * rt.projectileSpeed;
      p.vy = Math.sin(a) * rt.projectileSpeed;
      p.life = rt.range / rt.projectileSpeed + 0.1;
      p.damage = rt.damage * odDmg;
      p.radius = 5;
      p.hostile = false;
      p.armorPierce = rt.armorPierce;
      p.knockback = rt.knockback;
      p.chain = rt.chain;
      p.scrapBonus = rt.scrapBonus;
      p.angle = a;
      p.pierce = 0;
    }
  }

  // --- chain: instant hitscan that jumps to further targets ---
  private fireChain(rt: WeaponRuntime, target: Enemy, odDmg: number): void {
    const hit = new Set<number>();
    let from = { x: this.px, y: this.py };
    let cur: Enemy | null = target;
    let dmg = rt.damage * odDmg;
    const jumps = 1 + rt.chain;
    for (let i = 0; i < jumps && cur; i++) {
      hit.add(cur.uid);
      this.events.push({ t: 'zap', x1: from.x, y1: from.y, x2: cur.x, y2: cur.y });
      const dx = cur.x - from.x, dy = cur.y - from.y;
      const d = Math.hypot(dx, dy) || 1;
      from = { x: cur.x, y: cur.y };
      const next: Enemy | null = this.nearestEnemy(cur.x, cur.y, rt.range * 0.75, hit);
      this.damageEnemy(cur, dmg, rt.armorPierce, dx / d, dy / d, rt.knockback, rt.scrapBonus);
      dmg *= 0.62;   // each jump is weaker, so chains cannot spiral
      cur = next;
    }
  }

  // --- mortar: lobbed shell at the densest nearby cluster ---
  private fireMortar(rt: WeaponRuntime, odDmg: number): void {
    const target = this.densestCluster(rt.range, rt.area);
    if (!target) return;
    for (let i = 0; i < rt.projectiles; i++) {
      const p = this.projectiles.spawn();
      if (!p) return;
      const jitter = i === 0 ? 0 : this.rng.range(-rt.area * 0.6, rt.area * 0.6);
      const tx = target.x + jitter, ty = target.y + jitter * 0.5;
      const a = Math.atan2(ty - this.py, tx - this.px);
      const travel = dist(this.px, this.py, tx, ty) / rt.projectileSpeed;
      p.uid = nextUid();
      p.kind = 'shell';
      p.x = this.px; p.y = this.py;
      p.vx = Math.cos(a) * rt.projectileSpeed;
      p.vy = Math.sin(a) * rt.projectileSpeed;
      p.life = travel + 0.02;
      p.fuse = travel;
      p.damage = rt.damage * odDmg;
      p.area = rt.area;
      p.shards = rt.shards;
      p.radius = 6;
      p.hostile = false;
      p.armorPierce = rt.armorPierce;
      p.knockback = rt.knockback;
      p.scrapBonus = rt.scrapBonus;
      p.angle = a;
    }
  }

  /** Centre of the tightest knot of enemies inside `range`. */
  private densestCluster(range: number, area: number): { x: number; y: number } | null {
    this.enemyHash.query(this.px, this.py, range, this.scratch);
    let best: Enemy | null = null;
    let bestScore = -1;
    for (const e of this.scratch) {
      if (!e.active) continue;
      if (dist2(e.x, e.y, this.px, this.py) > range * range) continue;
      this.enemyHash.query(e.x, e.y, area, this.scratch2);
      let n = 0;
      for (const o of this.scratch2) {
        if (o.active && dist2(o.x, o.y, e.x, e.y) <= area * area) n++;
      }
      // prefer big knots, break ties toward bosses and tanks
      const score = n * 10 + (e.boss ? 25 : 0) + e.maxHp / 40;
      if (score > bestScore) { bestScore = score; best = e; }
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  // --- slam: instant ring of damage centred on the robot ---
  private fireSlam(rt: WeaponRuntime, odDmg: number): void {
    this.events.push({ t: 'slam', x: this.px, y: this.py, radius: rt.area });
    this.enemyHash.query(this.px, this.py, rt.area, this.scratch);
    for (const e of [...this.scratch]) {
      if (!e.active) continue;
      const dx = e.x - this.px, dy = e.y - this.py;
      const d = Math.hypot(dx, dy) || 1;
      if (d > rt.area) continue;
      this.damageEnemy(e, rt.damage * odDmg, rt.armorPierce, dx / d, dy / d, rt.knockback, rt.scrapBonus);
    }
  }

  // --- orbit: blades that circle the robot and re-hit on a timer ---
  private stepOrbit(w: WeaponState, rt: WeaponRuntime, dt: number, odDmg: number): void {
    const speedMul = this.overdriveTimer > 0 ? 1.35 : 1;
    for (const o of this.orbiters) {
      if (o.cell !== w.cell) continue;
      o.angle += rt.projectileSpeed * speedMul * dt;
      const ox = this.px + Math.cos(o.angle) * o.radius;
      const oy = this.py + Math.sin(o.angle) * o.radius;

      for (const [uid, t] of o.cooldowns) {
        const nt = t - dt;
        if (nt <= 0) o.cooldowns.delete(uid);
        else o.cooldowns.set(uid, nt);
      }

      this.enemyHash.query(ox, oy, 16, this.scratch);
      for (const e of [...this.scratch]) {
        if (!e.active || o.cooldowns.has(e.uid)) continue;
        if (dist2(ox, oy, e.x, e.y) > (e.radius + 11) ** 2) continue;
        o.cooldowns.set(e.uid, o.hitCooldown);
        const dx = e.x - this.px, dy = e.y - this.py;
        const d = Math.hypot(dx, dy) || 1;
        const killed = this.damageEnemy(
          e, o.damage * odDmg, o.armorPierce, dx / d, dy / d, o.knockback, o.scrapBonus,
        );
        if (!killed && rt.chain > 0) this.chainFrom(e, o.damage * 0.5 * odDmg, rt, 1);
      }
    }
    // Sustained weapon: heat accrues per second, not per shot.
    this.addHeat(w, rt.heatGain * dt);
  }

  /** Shared "hit jumps onward" helper used by the Coil module. */
  private chainFrom(from: Enemy, damage: number, rt: WeaponRuntime, jumps: number): void {
    const seen = new Set<number>([from.uid]);
    let cur = from;
    for (let i = 0; i < jumps; i++) {
      const next = this.nearestEnemy(cur.x, cur.y, 130, seen);
      if (!next) return;
      seen.add(next.uid);
      this.events.push({ t: 'zap', x1: cur.x, y1: cur.y, x2: next.x, y2: next.y });
      this.damageEnemy(next, damage, rt.armorPierce, 0, 0, 0, rt.scrapBonus);
      cur = next;
    }
  }

  // --- beam: a sweeping line that ticks damage along its length ---
  private stepBeam(w: WeaponState, rt: WeaponRuntime, dt: number, odDmg: number, ratePenalty: number): void {
    w.angle += rt.sweep * dt / ratePenalty;
    const x2 = this.px + Math.cos(w.angle) * rt.range;
    const y2 = this.py + Math.sin(w.angle) * rt.range;
    this.events.push({ t: 'beam', x1: this.px, y1: this.py, x2, y2, cell: w.cell });

    if (w.overheated) return;  // an overheated beam still sweeps but does nothing
    this.addHeat(w, rt.heatGain * dt);

    w.tick -= dt;
    if (w.tick > 0) return;
    w.tick = rt.cooldown;

    const minX = Math.min(this.px, x2) - 20, maxX = Math.max(this.px, x2) + 20;
    const minY = Math.min(this.py, y2) - 20, maxY = Math.max(this.py, y2) + 20;
    this.enemyHash.queryBox(minX, minY, maxX, maxY, this.scratch);
    const dx = x2 - this.px, dy = y2 - this.py;
    const len2 = dx * dx + dy * dy || 1;
    for (const e of [...this.scratch]) {
      if (!e.active) continue;
      // distance from the enemy centre to the beam segment
      let t = ((e.x - this.px) * dx + (e.y - this.py) * dy) / len2;
      t = clamp(t, 0, 1);
      const cx = this.px + dx * t, cy = this.py + dy * t;
      if (dist2(cx, cy, e.x, e.y) > (e.radius + 7) ** 2) continue;
      this.damageEnemy(
        e, rt.damage * odDmg, rt.armorPierce,
        dx / Math.sqrt(len2), dy / Math.sqrt(len2), rt.knockback, rt.scrapBonus,
      );
    }
  }

  /* ------------------------------------------------------------------ */
  /* projectiles, hazards, pickups                                       */
  /* ------------------------------------------------------------------ */

  private stepProjectiles(dt: number): void {
    for (const p of this.projectiles.items) {
      if (!p.active) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt;
      p.life -= dt;

      if (p.fuse > 0) {
        p.fuse -= dt;
        if (p.fuse <= 0) { this.explodeShell(p); continue; }
      }

      if (p.life <= 0 ||
          p.x < 0 || p.y < 0 || p.x > ARENA.width || p.y > ARENA.height) {
        if (p.area > 0) this.explodeShell(p);
        else this.projectiles.release(p);
        continue;
      }

      if (p.hostile) {
        if (dist2(p.x, p.y, this.px, this.py) <= (p.radius + PLAYER.radius) ** 2) {
          this.hurtPlayer(p.damage, p.x, p.y);
          this.projectiles.release(p);
        }
        continue;
      }

      this.enemyHash.query(p.x, p.y, p.radius + 20, this.scratch);
      for (const e of [...this.scratch]) {
        if (!e.active || p.hitUids.has(e.uid)) continue;
        if (dist2(p.x, p.y, e.x, e.y) > (p.radius + e.radius) ** 2) continue;

        if (p.area > 0) { this.explodeShell(p); break; }

        p.hitUids.add(e.uid);
        const d = Math.hypot(p.vx, p.vy) || 1;
        const killed = this.damageEnemy(
          e, p.damage, p.armorPierce, p.vx / d, p.vy / d, p.knockback, p.scrapBonus,
        );
        if (p.chain > 0 && !killed) {
          this.chainFrom(e, p.damage * 0.5, {
            armorPierce: p.armorPierce, scrapBonus: p.scrapBonus,
          } as WeaponRuntime, p.chain);
        }
        if (p.pierce > 0) p.pierce--;
        else { this.projectiles.release(p); break; }
      }
    }
  }

  private explodeShell(p: Projectile): void {
    const radius = p.area || 40;
    this.events.push({ t: 'boom', x: p.x, y: p.y, radius });
    this.enemyHash.query(p.x, p.y, radius, this.scratch);
    for (const e of [...this.scratch]) {
      if (!e.active) continue;
      const dx = e.x - p.x, dy = e.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > radius) continue;
      // full damage at the centre, 45% at the rim
      const falloff = 1 - 0.55 * (d / radius);
      this.damageEnemy(
        e, p.damage * falloff, p.armorPierce,
        dx / (d || 1), dy / (d || 1), p.knockback, p.scrapBonus,
      );
    }
    for (let i = 0; i < p.shards; i++) {
      const s = this.projectiles.spawn();
      if (!s) break;
      const a = this.rng.angle();
      s.uid = nextUid();
      s.kind = 'shard';
      s.x = p.x; s.y = p.y;
      s.vx = Math.cos(a) * 260;
      s.vy = Math.sin(a) * 260;
      s.life = 0.45;
      s.damage = p.damage * 0.28;
      s.radius = 4;
      s.hostile = false;
      s.armorPierce = p.armorPierce;
      s.knockback = 20;
      s.scrapBonus = p.scrapBonus;
      s.angle = a;
      s.spin = 12;
    }
    this.projectiles.release(p);
  }

  private stepHazards(dt: number): void {
    for (const h of this.hazards.items) {
      if (!h.active) continue;
      if (h.delay > 0) {
        h.delay -= dt;
        continue;
      }
      if (!h.fired) {
        h.fired = true;
        this.events.push({ t: 'boom', x: h.x, y: h.y, radius: h.radius });
        if (h.hostile && dist2(h.x, h.y, this.px, this.py) <= h.radius * h.radius) {
          this.hurtPlayer(h.damage, h.x, h.y);
        }
      }
      h.linger -= dt;
      if (h.linger <= 0) this.hazards.release(h);
    }
  }

  private stepPickups(dt: number): void {
    const grab = this.pickupRadius;
    for (const p of this.pickups.items) {
      if (!p.active) continue;
      p.animT += dt;
      p.life -= dt;
      if (p.life <= 0) { this.pickups.release(p); continue; }

      const d = dist(p.x, p.y, this.px, this.py);
      if (!p.homing && d <= grab) p.homing = true;

      if (p.homing) {
        // accelerate toward the robot, faster the closer it gets
        const s = 220 + (grab - Math.min(d, grab)) * 3.2;
        p.x += ((this.px - p.x) / (d || 1)) * s * dt;
        p.y += ((this.py - p.y) / (d || 1)) * s * dt;
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.9; p.vy *= 0.9;
      }

      if (d <= PLAYER.radius + 8) {
        this.collect(p);
      }
    }
  }

  private collect(p: Pickup): void {
    this.events.push({ t: 'pickup', kind: p.kind, x: p.x, y: p.y, value: p.value });
    if (p.kind === 'scrap') this.scrapEarned += p.value;
    else if (p.kind === 'spark') this.addOverdrive(PLAYER.overdrivePerSpark);
    else this.hp = Math.min(this.maxHp, this.hp + p.value);
    this.pickups.release(p);
  }

  /* ------------------------------------------------------------------ */
  /* wave clock                                                          */
  /* ------------------------------------------------------------------ */

  private stepWaveClock(dt: number): void {
    if (this.wave.boss) return;      // boss waves end when the boss dies
    if (this.timeLeft > 0) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.sweeping = WAVE.endOfWaveSweepSeconds;
        this.spawnBudget = 0;
      }
      return;
    }
    // Shift horn: survivors power down over a short beat, then the wave ends.
    this.sweeping -= dt;
    for (const e of this.enemies.items) {
      if (e.active && !e.boss && this.rng.next() < dt * 6) {
        this.events.push({ t: 'boom', x: e.x, y: e.y, radius: 22 });
        this.enemies.release(e);
      }
    }
    if (this.sweeping <= 0) {
      this.sweepRemainingPickups();
      for (const e of this.enemies.items) if (e.active) this.enemies.release(e);
      for (const p of this.projectiles.items) if (p.active && p.hostile) this.projectiles.release(p);
      this.outcome = 'cleared';
      this.events.push({ t: 'waveCleared' });
    }
  }

  /** Pull any pickups still on the floor into the player's total. */
  sweepRemainingPickups(): void {
    for (const p of this.pickups.items) {
      if (!p.active) continue;
      if (p.kind === 'scrap') this.scrapEarned += p.value;
      this.pickups.release(p);
    }
  }

  /** Diagnostics for the debug overlay and performance reporting. */
  stats(): { enemies: number; projectiles: number; pickups: number; overflow: number } {
    return {
      enemies: this.enemies.activeCount,
      projectiles: this.projectiles.activeCount,
      pickups: this.pickups.activeCount,
      overflow: this.enemies.overflow + this.projectiles.overflow + this.pickups.overflow,
    };
  }

  destroy(): void {
    this.enemies.clear();
    this.projectiles.clear();
    this.pickups.clear();
    this.hazards.clear();
    this.orbiters.length = 0;
    this.weapons.length = 0;
    this.runtimes.clear();
    this.events.length = 0;
  }
}

/* -------------------------------------------------------------------- */
/* pool factories                                                        */
/* -------------------------------------------------------------------- */

function makeEnemy(): Enemy {
  return {
    active: false, uid: 0, type: 'crusher', boss: null,
    x: 0, y: 0, vx: 0, vy: 0, hp: 1, maxHp: 1, speed: 0, radius: 12,
    armor: 0, poise: 0, scrap: 0, contactDamage: 0, contactCooldown: 1,
    contactTimer: 0, state: 'approach', timer: 0, flash: 0, facing: 1,
    phase: 0, summonTimer: 0, attackTimer: 0, jitter: 0, healTimer: 0, animT: 0,
  };
}

function resetEnemy(e: Enemy): void {
  e.boss = null; e.vx = 0; e.vy = 0; e.flash = 0; e.state = 'approach';
  e.timer = 0; e.phase = 0; e.summonTimer = 0; e.attackTimer = 0;
  e.contactTimer = 0; e.healTimer = 0; e.animT = 0; e.facing = 1;
}

function makeProjectile(): Projectile {
  return {
    active: false, uid: 0, kind: 'rivet', x: 0, y: 0, vx: 0, vy: 0,
    life: 0, damage: 0, radius: 4, hostile: false, armorPierce: 0,
    knockback: 0, area: 0, shards: 0, chain: 0, hitUids: new Set(),
    pierce: 0, scrapBonus: 0, angle: 0, spin: 0, fuse: 0,
  };
}

function resetProjectile(p: Projectile): void {
  p.vx = 0; p.vy = 0; p.life = 0; p.damage = 0; p.radius = 4;
  p.hostile = false; p.armorPierce = 0; p.knockback = 0; p.area = 0;
  p.shards = 0; p.chain = 0; p.hitUids.clear(); p.pierce = 0;
  p.scrapBonus = 0; p.angle = 0; p.spin = 0; p.fuse = 0;
}

function makePickup(): Pickup {
  return {
    active: false, uid: 0, kind: 'scrap', x: 0, y: 0, vx: 0, vy: 0,
    value: 0, life: 0, homing: false, animT: 0,
  };
}

function resetPickup(p: Pickup): void {
  p.vx = 0; p.vy = 0; p.value = 0; p.life = 0; p.homing = false; p.animT = 0;
}

function makeHazard(): Hazard {
  return {
    active: false, uid: 0, x: 0, y: 0, radius: 0, damage: 0,
    delay: 0, linger: 0, fired: false, hostile: true,
  };
}

function resetHazard(h: Hazard): void {
  h.radius = 0; h.damage = 0; h.delay = 0; h.linger = 0; h.fired = false; h.hostile = true;
}
