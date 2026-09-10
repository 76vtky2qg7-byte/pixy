import { Emitter } from '../core/emitter';
import { migrate } from './migrate';
import { SAVE_VERSION, type SaveData } from './schema';

const KEY = 'sparkscrapper.save.v1';

/** Where a save can live. Cloud is optional and may be absent for guests. */
export interface CloudAdapter {
  available(): boolean;
  load(): Promise<unknown>;
  save(data: SaveData): Promise<void>;
}

export type ConflictChoice = 'local' | 'cloud';

export interface StoreEvents extends Record<string, unknown> {
  changed: SaveData;
  /** Raised when local and cloud disagree and the player must decide. */
  conflict: { local: SaveData; cloud: SaveData };
  migrated: { from: number };
  cloudError: { phase: 'load' | 'save'; error: unknown };
}

/**
 * Save store.
 *
 * Local writes are synchronous and immediate. Cloud writes are debounced and
 * best-effort: a failed cloud write NEVER touches local state, because losing a
 * network round trip must not cost the player their credits.
 */
export class SaveStore {
  readonly events = new Emitter<StoreEvents>();
  private data: SaveData;
  private cloud: CloudAdapter | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private cloudInFlight = false;
  private cloudDirty = false;
  private disposed = false;

  constructor(initial: SaveData) {
    this.data = initial;
  }

  /** Read the local slot and normalise it. Never throws. */
  static loadLocal(fallbackLang: 'ru' | 'en'): { data: SaveData; migratedFrom: number | null } {
    let raw: unknown = null;
    try {
      const text = globalThis.localStorage?.getItem(KEY);
      if (text) raw = JSON.parse(text);
    } catch {
      // Corrupt JSON, disabled storage, or a private window. Start clean rather
      // than fail to boot — the game must always be playable.
      raw = null;
    }
    return migrate(raw, fallbackLang);
  }

  get(): SaveData {
    return this.data;
  }

  /**
   * Apply a change. `revision` is bumped on every write and is what the
   * conflict rule compares, so two devices can never silently interleave.
   */
  update(mutate: (draft: SaveData) => void, opts: { cloud?: boolean } = {}): SaveData {
    if (this.disposed) return this.data;
    const draft: SaveData = structuredClone(this.data);
    mutate(draft);
    draft.version = SAVE_VERSION;
    draft.revision = this.data.revision + 1;
    draft.updatedAt = Date.now();
    this.data = draft;
    this.writeLocal();
    this.events.emit('changed', draft);
    if (opts.cloud !== false) this.scheduleCloud();
    return draft;
  }

  private writeLocal(): void {
    try {
      globalThis.localStorage?.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // Quota or private mode. The session keeps working from memory.
    }
  }

  /* ---------------- cloud ---------------- */

  attachCloud(cloud: CloudAdapter): void {
    this.cloud = cloud;
  }

  /**
   * Reconcile with the cloud at boot.
   *
   * Rule: the higher `revision` wins. Balances are never summed — two snapshots
   * of the same wallet added together would invent currency. When both sides
   * hold real progress and neither strictly dominates, the caller is asked.
   */
  async syncFromCloud(): Promise<'local' | 'cloud' | 'conflict' | 'unavailable'> {
    if (!this.cloud?.available()) return 'unavailable';
    let raw: unknown;
    try {
      raw = await this.cloud.load();
    } catch (error) {
      this.events.emit('cloudError', { phase: 'load', error });
      return 'unavailable';
    }
    if (raw == null) {
      // Nothing in the cloud yet: seed it from local.
      this.scheduleCloud();
      return 'local';
    }

    const { data: cloudData } = migrate(raw, this.data.settings.lang);
    const local = this.data;

    if (cloudData.revision > local.revision) {
      if (localHasUnsyncedProgress(local, cloudData)) {
        this.events.emit('conflict', { local, cloud: cloudData });
        return 'conflict';
      }
      this.data = cloudData;
      this.writeLocal();
      this.events.emit('changed', cloudData);
      return 'cloud';
    }

    if (local.revision > cloudData.revision) {
      this.scheduleCloud();
      return 'local';
    }
    return 'local';
  }

  /** Apply the player's answer to a conflict. */
  resolveConflict(choice: ConflictChoice, cloudData: SaveData): void {
    if (choice === 'cloud') {
      this.data = { ...cloudData, revision: Math.max(cloudData.revision, this.data.revision) + 1 };
      this.writeLocal();
      this.events.emit('changed', this.data);
    } else {
      this.data = { ...this.data, revision: Math.max(cloudData.revision, this.data.revision) + 1 };
      this.writeLocal();
    }
    this.scheduleCloud();
  }

  /**
   * Cloud writes are coalesced: the SDK rate-limits player data, so a burst of
   * purchases produces one upload rather than six.
   */
  private scheduleCloud(): void {
    if (!this.cloud?.available() || this.disposed) return;
    this.cloudDirty = true;
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flushCloud();
    }, 4000);
  }

  async flushCloud(): Promise<void> {
    if (!this.cloud?.available() || !this.cloudDirty || this.cloudInFlight) return;
    this.cloudInFlight = true;
    const snapshot = this.data;
    this.cloudDirty = false;
    try {
      await this.cloud.save(snapshot);
    } catch (error) {
      // Put the flag back so the next write retries; local state is untouched.
      this.cloudDirty = true;
      this.events.emit('cloudError', { phase: 'save', error });
    } finally {
      this.cloudInFlight = false;
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    this.events.clear();
  }
}

/**
 * True when the local save holds something the cloud save does not, so taking
 * the cloud copy would destroy real progress.
 */
function localHasUnsyncedProgress(local: SaveData, cloud: SaveData): boolean {
  if (local.revision === 0) return false;
  const lp = local.progress, cp = cloud.progress;
  if (lp.credits > cp.credits) return true;
  if (lp.totalRuns > cp.totalRuns) return true;
  if (lp.wonContracts.some((c) => !cp.wonContracts.includes(c))) return true;
  if (lp.unlockedRobots.some((r) => !cp.unlockedRobots.includes(r))) return true;
  for (const [id, lvl] of Object.entries(lp.upgrades)) {
    if ((lvl ?? 0) > (cp.upgrades[id as keyof typeof cp.upgrades] ?? 0)) return true;
  }
  return false;
}
