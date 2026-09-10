import { beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate, sanitize } from '../save/migrate';
import { defaultSave, SAVE_VERSION, type SaveData } from '../save/schema';
import { SaveStore, type CloudAdapter } from '../save/store';

/** Minimal in-memory localStorage so the store can be exercised in Node. */
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
}

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new MemStorage();
});

describe('sanitize', () => {
  it('returns a clean default for junk input', () => {
    for (const junk of [null, undefined, 42, 'nope', [], true]) {
      const d = sanitize(junk);
      expect(d.version).toBe(SAVE_VERSION);
      expect(d.progress.credits).toBe(0);
      expect(d.progress.unlockedRobots).toEqual(['scrap14']);
    }
  });

  it('keeps valid values', () => {
    const d = sanitize({
      version: SAVE_VERSION,
      progress: { credits: 250, upgrades: { hull: 3 }, wonContracts: ['night_shift'] },
      settings: { lang: 'en', music: 0.25, sfx: 0.9, screenShake: false },
    });
    expect(d.progress.credits).toBe(250);
    expect(d.progress.upgrades.hull).toBe(3);
    expect(d.progress.wonContracts).toEqual(['night_shift']);
    expect(d.settings.lang).toBe('en');
    expect(d.settings.music).toBe(0.25);
    expect(d.settings.screenShake).toBe(false);
  });

  it('clamps an upgrade level to its cap instead of trusting it', () => {
    expect(sanitize({ progress: { upgrades: { hull: 9999 } } }).progress.upgrades.hull).toBe(5);
    expect(sanitize({ progress: { upgrades: { hull: -4 } } }).progress.upgrades.hull).toBeUndefined();
  });

  it('drops unknown ids rather than carrying them forward', () => {
    const d = sanitize({
      progress: {
        upgrades: { notAThing: 3, hull: 2 },
        wonContracts: ['night_shift', 'made_up_contract'],
        unlockedRobots: ['scrap14', 'not_a_robot'],
      },
    });
    expect(d.progress.upgrades).toEqual({ hull: 2 });
    expect(d.progress.wonContracts).toEqual(['night_shift']);
    expect(d.progress.unlockedRobots).toEqual(['scrap14']);
  });

  it('always keeps the starter robot unlocked', () => {
    expect(sanitize({ progress: { unlockedRobots: [] } }).progress.unlockedRobots)
      .toContain('scrap14');
  });

  it('clamps volumes into range', () => {
    const d = sanitize({ settings: { music: 12, sfx: -3 } });
    expect(d.settings.music).toBe(1);
    expect(d.settings.sfx).toBe(0);
  });

  it('rejects a negative or absurd credit balance', () => {
    expect(sanitize({ progress: { credits: -500 } }).progress.credits).toBe(0);
    expect(sanitize({ progress: { credits: NaN } }).progress.credits).toBe(0);
  });
});

describe('active run validation', () => {
  const goodRun = {
    contractId: 'night_shift', robotId: 'scrap14', waveIndex: 2,
    slots: ['riveter', 'battery', null, null, null, null],
    scrap: 60, seed: 99, rewardedWaves: [0, 1], offers: [], rerolls: 0,
    totalKills: 30, wavesCleared: 2, startedAt: 1000, finished: false,
    won: false, rewardedClaimed: false,
  };

  it('restores a valid run intact', () => {
    const run = sanitize({ activeRun: goodRun }).activeRun!;
    expect(run.contractId).toBe('night_shift');
    expect(run.waveIndex).toBe(2);
    expect(run.slots[0]).toBe('riveter');
    expect(run.rewardedWaves).toEqual([0, 1]);
  });

  it('drops a run pointing at a contract that no longer exists', () => {
    expect(sanitize({ activeRun: { ...goodRun, contractId: 'deleted' } }).activeRun).toBeNull();
  });

  it('drops a run whose wave index is past the end of the contract', () => {
    expect(sanitize({ activeRun: { ...goodRun, waveIndex: 99 } }).activeRun).toBeNull();
  });

  it('strips unknown gear from the panel without dropping the run', () => {
    const run = sanitize({
      activeRun: { ...goodRun, slots: ['riveter', 'ghost_gun', null, null, null, null] },
    }).activeRun!;
    expect(run.slots[0]).toBe('riveter');
    expect(run.slots[1]).toBeNull();
  });

  it('deduplicates and bounds the rewarded-wave list', () => {
    const run = sanitize({
      activeRun: { ...goodRun, rewardedWaves: [0, 0, 1, 1, -3, 500] },
    }).activeRun!;
    expect(run.rewardedWaves).toEqual([0, 1]);
  });

  it('falls back to the starter robot when the saved one is not unlocked', () => {
    const run = sanitize({
      progress: { unlockedRobots: ['scrap14'] },
      activeRun: { ...goodRun, robotId: 'volt9' },
    }).activeRun!;
    expect(run.robotId).toBe('scrap14');
  });
});

describe('migrate', () => {
  it('reports no migration for a current save', () => {
    const r = migrate({ ...defaultSave(), version: SAVE_VERSION });
    expect(r.migratedFrom).toBeNull();
    expect(r.data.version).toBe(SAVE_VERSION);
  });

  it('steps an unversioned save up to the current version', () => {
    const r = migrate({ progress: { credits: 40 } });
    expect(r.data.version).toBe(SAVE_VERSION);
    expect(r.data.progress.credits).toBe(40);
    expect(r.migratedFrom).toBe(0);
  });

  /** A save from a newer build: keep what is safe, drop what we cannot read. */
  it('salvages a save from a future version without guessing at its run', () => {
    const r = migrate({
      version: SAVE_VERSION + 5,
      progress: { credits: 900 },
      activeRun: { contractId: 'night_shift', waveIndex: 1, someNewField: true },
    });
    expect(r.data.progress.credits).toBe(900);
    expect(r.data.activeRun).toBeNull();
    expect(r.migratedFrom).toBe(SAVE_VERSION + 5);
  });

  it('never throws, whatever it is handed', () => {
    for (const junk of [null, 0, '', [], { version: 'x' }, { progress: 5 }]) {
      expect(() => migrate(junk)).not.toThrow();
    }
  });
});

describe('SaveStore', () => {
  it('writes through to local storage and bumps the revision', () => {
    const store = new SaveStore(defaultSave());
    store.update((d) => { d.progress.credits = 10; });
    store.update((d) => { d.progress.credits = 20; });
    expect(store.get().revision).toBe(2);
    expect(SaveStore.loadLocal('ru').data.progress.credits).toBe(20);
  });

  it('survives storage being unavailable', () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem() { throw new Error('blocked'); },
      setItem() { throw new Error('blocked'); },
    };
    expect(() => SaveStore.loadLocal('ru')).not.toThrow();
    const store = new SaveStore(defaultSave());
    expect(() => store.update((d) => { d.progress.credits = 5; })).not.toThrow();
    expect(store.get().progress.credits).toBe(5);
  });

  it('recovers from corrupt stored JSON', () => {
    globalThis.localStorage.setItem('sparkscrapper.save.v1', '{not json');
    const r = SaveStore.loadLocal('ru');
    expect(r.data.progress.credits).toBe(0);
  });
});

describe('cloud reconciliation', () => {
  const cloudWith = (data: SaveData | null) => {
    let slot = data;
    const adapter: CloudAdapter & { slot: () => SaveData | null } = {
      available: () => true,
      load: async () => slot,
      save: async (d) => { slot = d; },
      slot: () => slot,
    };
    return adapter;
  };

  it('takes the cloud copy when it is strictly ahead', async () => {
    const local = defaultSave();
    local.revision = 1;
    local.progress.credits = 10;
    const cloud = defaultSave();
    cloud.revision = 9;
    cloud.progress.credits = 500;
    cloud.progress.totalRuns = 20;

    const store = new SaveStore(local);
    store.attachCloud(cloudWith(cloud));
    expect(await store.syncFromCloud()).toBe('cloud');
    expect(store.get().progress.credits).toBe(500);
  });

  it('keeps local when local is ahead', async () => {
    const local = defaultSave();
    local.revision = 12;
    local.progress.credits = 300;
    const cloud = defaultSave();
    cloud.revision = 3;

    const store = new SaveStore(local);
    store.attachCloud(cloudWith(cloud));
    expect(await store.syncFromCloud()).toBe('local');
    expect(store.get().progress.credits).toBe(300);
  });

  /**
   * The case that must never silently destroy progress: the cloud has a higher
   * revision, but the local device holds something the cloud does not.
   */
  it('asks the player when neither side dominates', async () => {
    const local = defaultSave();
    local.revision = 4;
    local.progress.credits = 800;          // more money here
    local.progress.wonContracts = ['night_shift'];
    const cloud = defaultSave();
    cloud.revision = 20;                    // but a newer revision there
    cloud.progress.credits = 50;

    const store = new SaveStore(local);
    store.attachCloud(cloudWith(cloud));
    const seen: unknown[] = [];
    store.events.on('conflict', (c) => seen.push(c));

    expect(await store.syncFromCloud()).toBe('conflict');
    expect(seen).toHaveLength(1);
    // Nothing changed until the player chooses.
    expect(store.get().progress.credits).toBe(800);
  });

  it('never sums two balances when resolving a conflict', async () => {
    const local = defaultSave();
    local.revision = 4;
    local.progress.credits = 800;
    const cloud = defaultSave();
    cloud.revision = 20;
    cloud.progress.credits = 50;

    const store = new SaveStore(local);
    store.attachCloud(cloudWith(cloud));
    await store.syncFromCloud();

    store.resolveConflict('cloud', cloud);
    expect(store.get().progress.credits).toBe(50);      // not 850
    expect(store.get().revision).toBeGreaterThan(20);
  });

  it('keeping local after a conflict wins future syncs', async () => {
    const local = defaultSave();
    local.revision = 4;
    local.progress.credits = 800;
    const cloud = defaultSave();
    cloud.revision = 20;
    cloud.progress.credits = 50;

    const store = new SaveStore(local);
    store.attachCloud(cloudWith(cloud));
    await store.syncFromCloud();
    store.resolveConflict('local', cloud);
    expect(store.get().progress.credits).toBe(800);
    expect(store.get().revision).toBeGreaterThan(cloud.revision);
  });

  it('seeds an empty cloud from local', async () => {
    const adapter = cloudWith(null);
    const store = new SaveStore(defaultSave());
    store.attachCloud(adapter);
    expect(await store.syncFromCloud()).toBe('local');
    store.update((d) => { d.progress.credits = 42; });
    await store.flushCloud();
    expect(adapter.slot()?.progress.credits).toBe(42);
  });

  /** A network failure must cost nothing locally. */
  it('a failed cloud write leaves local progress untouched', async () => {
    const failing: CloudAdapter = {
      available: () => true,
      load: async () => null,
      save: async () => { throw new Error('network down'); },
    };
    const store = new SaveStore(defaultSave());
    store.attachCloud(failing);
    const errors: unknown[] = [];
    store.events.on('cloudError', (e) => errors.push(e));

    store.update((d) => { d.progress.credits = 123; });
    await store.flushCloud();

    expect(store.get().progress.credits).toBe(123);
    expect(SaveStore.loadLocal('ru').data.progress.credits).toBe(123);
    expect(errors).toHaveLength(1);
  });

  it('a failed cloud load does not clobber local progress', async () => {
    const failing: CloudAdapter = {
      available: () => true,
      load: async () => { throw new Error('offline'); },
      save: async () => {},
    };
    const local = defaultSave();
    local.progress.credits = 77;
    const store = new SaveStore(local);
    store.attachCloud(failing);
    expect(await store.syncFromCloud()).toBe('unavailable');
    expect(store.get().progress.credits).toBe(77);
  });

  it('does nothing when there is no cloud at all', async () => {
    const store = new SaveStore(defaultSave());
    expect(await store.syncFromCloud()).toBe('unavailable');
    await expect(store.flushCloud()).resolves.toBeUndefined();
  });

  it('coalesces a burst of writes into one upload', async () => {
    vi.useFakeTimers();
    const adapter = cloudWith(null);
    const spy = vi.spyOn(adapter, 'save');
    const store = new SaveStore(defaultSave());
    store.attachCloud(adapter);
    for (let i = 0; i < 6; i++) store.update((d) => { d.progress.credits = i; });
    await vi.advanceTimersByTimeAsync(5000);
    expect(spy).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
