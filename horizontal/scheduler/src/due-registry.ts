import { ActionError, RUN_MISSED_KEPT_MS, runHasExpired } from "@molis-ai/molis-work-contracts/platform/actions";
import type { DueEntryOwner, DueEntryRecord, DueEntrySource, DueExpiredRecord } from "@molis-ai/molis-work-contracts/services/scheduler";
import { openBaselineHomeSqlite, type HomeStoreDeclaration, type SqliteBaseline } from "@molis-ai/molis-work-storage";

export type { DueEntryOwner, DueEntryRecord, DueEntrySource, DueExpiredRecord };

/**
 * The platform's due registry (specs/unified-partition-plugins §4.1 到期的工作, batch 106): what a (plugin, partition) instance has to do at
 * some time, kept in the Home so that the instance need not be running until then. At the time it wakes only that plugin in that partition
 * (S-partition-wake-scope), never a whole supervisor. Entries come from two places: the plugin registers its own (`plugin`), and the
 * overview index registers each reminder time it read from the plugin's overview table (`overview`), so a reminder synced in from another
 * device rings too. An entry that is seven days past its time when it is reached is not run but kept as expired, the rule batch 95-3
 * (#2151) gave missed runs (`runHasExpired`). Each entry taken off is noted in `due_done` with its time, so an overview reminder read
 * again at the same time does not ring twice; notes older than the expiry window are dropped. Entries go with the plugin's disabling or
 * uninstalling and with the partition.
 */
export const DUE_REGISTRY_STORE = "due-registry";
export const DUE_REGISTRY_BASELINE: SqliteBaseline = { version: /* @version database.due_registry_baseline */ 1, schema: `
CREATE TABLE due_entries (
  install_id TEXT NOT NULL,
  plugin_id TEXT NOT NULL,
  partition_id TEXT NOT NULL,
  entry_key TEXT NOT NULL CHECK (length(entry_key) BETWEEN 1 AND 200),
  due_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('plugin', 'overview')),
  registered_at TEXT NOT NULL,
  PRIMARY KEY (install_id, partition_id, source, entry_key)
);
CREATE INDEX due_entries_due ON due_entries (due_at);
CREATE INDEX due_entries_partition ON due_entries (partition_id);
CREATE TABLE due_done (
  install_id TEXT NOT NULL,
  plugin_id TEXT NOT NULL,
  partition_id TEXT NOT NULL,
  entry_key TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('plugin', 'overview')),
  due_at TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('woken', 'expired')),
  done_at TEXT NOT NULL,
  PRIMARY KEY (install_id, partition_id, source, entry_key, due_at)
);
CREATE INDEX due_done_at ON due_done (done_at);
` };
export const DUE_REGISTRY_HOME_STORE = { path: DUE_REGISTRY_STORE, library: { baseline: DUE_REGISTRY_BASELINE } } as const satisfies HomeStoreDeclaration;
/** The most entries one installation keeps in one partition from one source; past it a registration is refused. */
export const DUE_ENTRY_LIMIT = 1_000;

type Database = ReturnType<typeof openBaselineHomeSqlite>;

export function openDueRegistry(home: string, options: { now?: () => Date } = {}): DueRegistry {
  return new DueRegistry(openBaselineHomeSqlite(home, DUE_REGISTRY_STORE, DUE_REGISTRY_BASELINE), options.now ?? (() => new Date()));
}

const iso = (value: string): string => {
  const at = Date.parse(value);
  if (!/^\d{4}-\d{2}-\d{2}T/u.test(value) || Number.isNaN(at)) throw new ActionError("actions.input_invalid", "到期时间要是带时区的时刻");
  return new Date(at).toISOString();
};
const rowOf = (row: Record<string, unknown>): DueEntryRecord => ({ install_id: String(row.install_id), plugin_id: String(row.plugin_id),
  partition_id: String(row.partition_id), entry_key: String(row.entry_key), due_at: String(row.due_at), source: row.source as DueEntrySource });

export class DueRegistry {
  constructor(private readonly db: Database, private readonly now: () => Date) {}

  /** Registers (or moves) one entry of the owner; the owner is the Host's stamp from the trusted context, never the plugin's word. */
  register(owner: DueEntryOwner, entry: { readonly entry_key: string; readonly due_at: string }, source: DueEntrySource = "plugin"): DueEntryRecord {
    checkOwner(owner);
    if (typeof entry.entry_key !== "string" || entry.entry_key.length < 1 || entry.entry_key.length > 200) throw new ActionError("actions.input_invalid", "到期登记的键是 1 到 200 字");
    const dueAt = iso(entry.due_at);
    return this.write(() => {
      const exists = this.db.prepare("SELECT 1 AS found FROM due_entries WHERE install_id = ? AND partition_id = ? AND source = ? AND entry_key = ?")
        .get(owner.install_id, owner.partition_id, source, entry.entry_key);
      if (!exists && this.count(owner, source) >= DUE_ENTRY_LIMIT) throw new ActionError("actions.input_invalid", `一个插件在一个分区至多登记 ${DUE_ENTRY_LIMIT} 个到期项`);
      this.db.prepare(`INSERT INTO due_entries VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (install_id, partition_id, source, entry_key) DO UPDATE SET due_at = excluded.due_at, plugin_id = excluded.plugin_id, registered_at = excluded.registered_at`)
        .run(owner.install_id, owner.plugin_id, owner.partition_id, entry.entry_key, dueAt, source, this.now().toISOString());
      return { ...owner, entry_key: entry.entry_key, due_at: dueAt, source };
    });
  }

  cancel(owner: DueEntryOwner, entryKey: string, source: DueEntrySource = "plugin"): boolean {
    checkOwner(owner);
    return Number(this.db.prepare("DELETE FROM due_entries WHERE install_id = ? AND partition_id = ? AND source = ? AND entry_key = ?")
      .run(owner.install_id, owner.partition_id, source, entryKey).changes) > 0;
  }

  /**
   * Makes the owner's `overview` entries exactly these, in one transaction: the reminder times the overview index read from the plugin's
   * overview table in that partition. A plugin's own entries are untouched.
   */
  replaceOverview(owner: DueEntryOwner, entries: readonly { readonly entry_key: string; readonly due_at: string }[]): void {
    checkOwner(owner);
    if (entries.length > DUE_ENTRY_LIMIT) throw new ActionError("actions.input_invalid", `一个插件在一个分区至多登记 ${DUE_ENTRY_LIMIT} 个到期项`);
    const at = this.now().toISOString();
    const rows = entries.map(entry => {
      if (typeof entry.entry_key !== "string" || entry.entry_key.length < 1 || entry.entry_key.length > 200) {
        throw new ActionError("actions.input_invalid", "到期登记的键是 1 到 200 字");
      }
      return [entry.entry_key, iso(entry.due_at)] as const;
    });
    this.write(() => {
      this.db.prepare("DELETE FROM due_entries WHERE install_id = ? AND partition_id = ? AND source = 'overview'").run(owner.install_id, owner.partition_id);
      const insert = this.db.prepare("INSERT OR REPLACE INTO due_entries VALUES (?, ?, ?, ?, ?, 'overview', ?)");
      const done = this.db.prepare("SELECT 1 AS found FROM due_done WHERE install_id = ? AND partition_id = ? AND source = 'overview' AND entry_key = ? AND due_at = ?");
      // Notes of reminders no longer in the table go: the notes stay as many as the table's rows.
      const current = new Set(rows.map(([key, due]) => JSON.stringify([key, due])));
      for (const note of this.db.prepare("SELECT entry_key, due_at FROM due_done WHERE install_id = ? AND partition_id = ? AND source = 'overview'")
        .all(owner.install_id, owner.partition_id)) {
        if (!current.has(JSON.stringify([String(note.entry_key), String(note.due_at)]))) {
          this.db.prepare("DELETE FROM due_done WHERE install_id = ? AND partition_id = ? AND source = 'overview' AND entry_key = ? AND due_at = ?")
            .run(owner.install_id, owner.partition_id, note.entry_key, note.due_at);
        }
      }
      for (const [key, due] of rows) {
        // The same reminder at the same time was already rung (or expired): reading the table again does not ring it twice.
        if (done.get(owner.install_id, owner.partition_id, key, due)) continue;
        insert.run(owner.install_id, owner.plugin_id, owner.partition_id, key, due, at);
      }
    });
  }

  /** Clears an installation's entries, in one partition (it was disabled there) or in all of them (it was uninstalled). */
  clearInstall(installId: string, partitionId?: string): number {
    const sql = partitionId === undefined ? "install_id = ?" : "install_id = ? AND partition_id = ?";
    const parameters = partitionId === undefined ? [installId] : [installId, partitionId];
    return this.write(() => {
      this.db.prepare(`DELETE FROM due_done WHERE ${sql}`).run(...parameters);
      return Number(this.db.prepare(`DELETE FROM due_entries WHERE ${sql}`).run(...parameters).changes);
    });
  }

  /** Clears a partition's entries, when it is deleted. */
  clearPartition(partitionId: string): number {
    return this.write(() => {
      this.db.prepare("DELETE FROM due_done WHERE partition_id = ?").run(partitionId);
      return Number(this.db.prepare("DELETE FROM due_entries WHERE partition_id = ?").run(partitionId).changes);
    });
  }

  /** The earliest time anything is due, or null. */
  next(): string | null {
    return (this.db.prepare("SELECT MIN(due_at) AS next FROM due_entries").get() as { next: string | null } | undefined)?.next ?? null;
  }

  entries(partitionId?: string): DueEntryRecord[] {
    const rows = partitionId === undefined
      ? this.db.prepare("SELECT * FROM due_entries ORDER BY due_at, install_id, entry_key").all()
      : this.db.prepare("SELECT * FROM due_entries WHERE partition_id = ? ORDER BY due_at, install_id, entry_key").all(partitionId);
    return rows.map(rowOf);
  }

  expired(partitionId?: string): DueExpiredRecord[] {
    const rows = partitionId === undefined ? this.db.prepare("SELECT * FROM due_done WHERE outcome = 'expired' ORDER BY due_at").all()
      : this.db.prepare("SELECT * FROM due_done WHERE outcome = 'expired' AND partition_id = ? ORDER BY due_at").all(partitionId);
    return rows.map(row => ({ ...rowOf(row), expired_at: String(row.done_at) }));
  }

  /**
   * Takes everything due by now off the registry, in one transaction, before any of it runs: an entry the woken plugin registers again
   * under the same key is a new entry, which this round does not remove (the alternating one-shot of #2257). An entry seven days past its
   * time is kept as expired and not given back.
   */
  takeDue(): { due: DueEntryRecord[]; expired: DueExpiredRecord[] } {
    const now = this.now(), at = now.toISOString();
    return this.write(() => {
      const rows = this.db.prepare("SELECT * FROM due_entries WHERE due_at <= ? ORDER BY due_at, install_id, partition_id, entry_key").all(at).map(rowOf);
      const remove = this.db.prepare("DELETE FROM due_entries WHERE install_id = ? AND partition_id = ? AND source = ? AND entry_key = ? AND due_at = ?");
      const note = this.db.prepare("INSERT OR REPLACE INTO due_done VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
      const due: DueEntryRecord[] = [], expired: DueExpiredRecord[] = [];
      for (const row of rows) {
        remove.run(row.install_id, row.partition_id, row.source, row.entry_key, row.due_at);
        const outcome = runHasExpired(row.due_at, now.getTime()) ? "expired" : "woken";
        note.run(row.install_id, row.plugin_id, row.partition_id, row.entry_key, row.source, row.due_at, outcome, at);
        if (outcome === "expired") expired.push({ ...row, expired_at: at });
        else due.push(row);
      }
      // A plugin's own entry is never read again, so its woken note serves nothing, and its expired note is kept for the expiry window
      // once more. An overview note lives as long as its reminder is in the table (`replaceOverview`).
      this.db.prepare("DELETE FROM due_done WHERE source = 'plugin' AND (outcome = 'woken' OR done_at < ?)").run(new Date(now.getTime() - RUN_MISSED_KEPT_MS).toISOString());
      return { due, expired };
    });
  }

  close(): void { this.db.close(); }

  private count(owner: DueEntryOwner, source: DueEntrySource): number {
    return Number((this.db.prepare("SELECT count(*) AS total FROM due_entries WHERE install_id = ? AND partition_id = ? AND source = ?")
      .get(owner.install_id, owner.partition_id, source) as { total: number }).total);
  }

  private write<T>(run: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const value = run();
      this.db.exec("COMMIT");
      return value;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

function checkOwner(owner: DueEntryOwner): void {
  if (!owner.install_id || !owner.plugin_id || !owner.partition_id) throw new ActionError("actions.input_invalid", "到期登记的插件、安装与分区都要有");
}

/** The longest a timer is set for; a later time is reached by setting it again. */
const MAX_TIMER_MS = 2 ** 31 - 1;

/**
 * The one timer of the registry: armed for the earliest entry, it takes what is due, wakes each (plugin, partition) through `wake` (the
 * per-partition assembly's `acquire(..., "due")` in the Host), and arms itself again. `arm()` is called after every change to the
 * registry. A wake that fails is told to `failed` and not retried: the plugin registers again when it next runs.
 */
export class DueTimer {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | undefined;
  private closed = false;

  constructor(private readonly registry: DueRegistry, private readonly options: {
    readonly wake: (entry: DueEntryRecord) => Promise<void>;
    readonly expired?: (entries: readonly DueExpiredRecord[]) => void;
    readonly failed?: (entry: DueEntryRecord, error: unknown) => void;
    readonly now?: () => Date;
  }) {}

  arm(): void {
    if (this.closed) return;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    const next = this.registry.next();
    if (next === null) return;
    const delay = Math.min(MAX_TIMER_MS, Math.max(0, Date.parse(next) - (this.options.now ?? (() => new Date()))().getTime()));
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.fire();
    }, delay);
    this.timer.unref?.();
  }

  /** Runs one round now, whatever the timer says; the timer is armed again after it. */
  fire(): Promise<void> {
    if (this.running) return this.running;
    this.running = (async () => {
      try {
        const { due, expired } = this.registry.takeDue();
        if (expired.length) this.options.expired?.(expired);
        for (const entry of due) {
          try { await this.options.wake(entry); } catch (error) { this.options.failed?.(entry, error); }
        }
      } finally {
        this.running = undefined;
        this.arm();
      }
    })();
    return this.running;
  }

  close(): void {
    this.closed = true;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }
}
