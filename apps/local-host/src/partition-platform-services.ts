import { existsSync, realpathSync } from "node:fs";
import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { OverviewIndexRow, OverviewKind, PluginManifest, PluginPersonSettingsDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { DUE_REGISTRY_STORE, DueTimer, openDueRegistry, type DueEntryOwner, type DueEntryRecord, type DueExpiredRecord, type DueRegistry } from "@molis-ai/molis-work-service-scheduler";
import { EVIDENCE_STORE, openEvidenceLedger } from "@molis-ai/molis-work-service-evidence";
import { PERSON_SETTINGS_STORE, openPersonSettings, type PersonSettingsInstallation } from "@molis-ai/molis-work-service-person-settings";
import { OverviewService, overviewReach, type OverviewGrant, type OverviewLibrary } from "@molis-ai/molis-work-service-search";
import { homeSqlitePath, openHomeSqliteFile, openOverviewIndex, TEXT_SEARCH_STORE } from "@molis-ai/molis-work-storage";
import { attentionOverviewRows } from "@molis-ai/molis-work-module-attention-resumption";
import { partitionPluginScope, type PartitionPluginLease } from "./partition-plugin-assembly.js";
import { partitionDatabasePath } from "@molis-ai/molis-work-module-projects";

/**
 * The platform services the unified partitions add in the Home (specs/unified-partition-plugins §4.1, §5, §6.1, batch 106), put together
 * once for the Host: the due registry and its one timer (`horizontal/scheduler`), the overview index (`horizontal/search`), and the
 * lifecycle every one of them follows: a plugin disabled in a partition, an installation removed, a partition deleted. Batch 106 only adds
 * them (V1); the plugins that use them move in 107–109.
 *
 * Nothing here wakes more than it must (S-partition-wake-scope): a due entry acquires only that plugin's instance in that partition, and the
 * overview reads only dirty libraries on a read-only connection, starting nothing.
 */

/** One installed plugin as the overview sees it: its installation, and the Manifest it declares its overview kinds and library in. */
export interface OverviewInstallation {
  readonly install_id: string;
  readonly manifest: Pick<PluginManifest, "plugin_id" | "overview_projection" | "databases">;
}

/**
 * The libraries the overview reads: for each partition, each enabled plugin that declares `overview_projection` and keeps a library in every
 * partition. The path is the partition layout's (`partitionPluginScope`), never the plugin's word, and one that a link leads into another
 * partition is left out; the stamp is the platform's.
 */
export function partitionOverviewLibraries(home: string, partitions: readonly { readonly partition_id: string; readonly plugins: readonly OverviewInstallation[] }[]): OverviewLibrary[] {
  return partitions.flatMap(partition => partition.plugins.flatMap(({ install_id, manifest }) => {
    const declaration = manifest.databases?.partition, kinds = manifest.overview_projection?.kinds;
    if (!kinds?.length) return [];
    // A plugin that keeps its data in the partition's main database has its rows in the platform's table there (V17).
    if (!declaration) return manifest.databases?.project ? [mainOverviewLibrary(home, partition.partition_id, install_id, manifest)] : [];
    const scope = partitionPluginScope(home, partition.partition_id, manifest.plugin_id, install_id);
    let path: string;
    try {
      // Through the scope's link check, as the instance itself opens it: a library that resolves into another partition is not this one's to stamp.
      path = scope.assertOwnPath(scope.libraryPath(declaration.store_name));
    } catch (error) {
      if (error instanceof ActionError && error.code === "actions.forbidden") return [];
      throw error;
    }
    return [{ partition_id: partition.partition_id, install_id, plugin_id: manifest.plugin_id, path, kinds }];
  }));
}

/** One main-database plugin's overview rows in one partition: the platform's table in that partition's `molis-work.db`, read by installation. */
export function mainOverviewLibrary(home: string, partitionId: string, installId: string, manifest: Pick<PluginManifest, "plugin_id" | "overview_projection">): OverviewLibrary {
  return { partition_id: partitionId, install_id: installId, plugin_id: manifest.plugin_id, path: partitionDatabasePath(realpathSync(home), partitionId),
    kinds: manifest.overview_projection?.kinds ?? [], table: "main" };
}

/**
 * The stamp of the platform's own "waiting on you" rows in the overview (R13, batch 108): not a plugin, so no installation; one library per
 * partition, read from the partition's main database by the attention module's projection (`attentionOverviewRows`).
 */
export const ATTENTION_OVERVIEW_SOURCE = "system.attention";

/** The partition's "waiting on you" entries as an overview library: `notification` rows, read-only, waking nothing. */
export function attentionOverviewLibrary(home: string, partitionId: string): OverviewLibrary {
  return { partition_id: partitionId, install_id: ATTENTION_OVERVIEW_SOURCE, plugin_id: ATTENTION_OVERVIEW_SOURCE,
    path: partitionDatabasePath(realpathSync(home), partitionId), kinds: ["notification"], table: "attention" };
}

/** Reads one attention library on a read-only connection; a main database not written yet holds nothing, one that cannot be read now stays dirty. */
function readAttentionLibrary(library: OverviewLibrary): ReturnType<typeof attentionOverviewRows> | null {
  if (!existsSync(library.path)) return [];
  let db: ReturnType<typeof openHomeSqliteFile>;
  try { db = openHomeSqliteFile(library.path, { readOnly: true }); } catch { return null; }
  try { return attentionOverviewRows(db); } catch { return null; } finally { db.close(); }
}

export interface PartitionPlatformServicesOptions {
  readonly home: string;
  /** The per-partition assembly: a due entry wakes only that (plugin, partition) instance. */
  readonly assembly: { acquire(pluginId: string, partitionId: string, reason: "due"): Promise<PartitionPluginLease> };
  /** Hands the due entry to the woken instance; batch 108 gives the plugins their handler. Without it, waking the instance is the whole of it. */
  readonly deliverDue?: (lease: PartitionPluginLease, entry: DueEntryRecord) => Promise<void>;
  /** Resolves read-only overview libraries for a changed partition so synced reminder times arm the due timer without waking any plugin (V11). */
  readonly libraries?: (partitionId: string, installId?: string) => readonly OverviewLibrary[];
  readonly expired?: (entries: readonly DueExpiredRecord[]) => void;
  readonly failed?: (entry: DueEntryRecord, error: unknown) => void;
  readonly now?: () => Date;
}

const running = new Map<string, PartitionPlatformServices>();
const canonical = (home: string) => { try { return realpathSync(home); } catch { return home; } };

/** The services the Host runs for this Home now, if it runs them: a plugin's own due entry then arms the timer at once. */
export function runningPartitionPlatformServices(home: string): PartitionPlatformServices | undefined {
  return running.get(canonical(home));
}

export class PartitionPlatformServices {
  readonly due: DueRegistry;
  readonly timer: DueTimer;
  readonly overview: OverviewService;
  private readonly resolveLibraries?: PartitionPlatformServicesOptions["libraries"];
  private readonly home: string;

  constructor(options: PartitionPlatformServicesOptions) {
    this.home = canonical(options.home);
    const now = options.now ?? (() => new Date());
    this.resolveLibraries = options.libraries;
    this.due = openDueRegistry(options.home, { now });
    this.timer = new DueTimer(this.due, {
      now,
      wake: async entry => {
        const lease = await options.assembly.acquire(entry.plugin_id, entry.partition_id, "due");
        try {
          await options.deliverDue?.(lease, entry);
        } finally {
          lease.release();
        }
      },
      ...(options.expired ? { expired: options.expired } : {}),
      ...(options.failed ? { failed: options.failed } : {}),
    });
    this.overview = new OverviewService(openOverviewIndex({ homeDirectory: options.home }), {
      // A reminder time read from a plugin's overview table becomes a due entry of that plugin in that partition, so one synced in rings too.
      reminders: (library, entries) => {
        this.due.replaceOverview({ install_id: library.install_id, plugin_id: library.plugin_id, partition_id: library.partition_id }, entries);
        this.timer.arm();
      },
      readAttention: readAttentionLibrary,
    });
    this.timer.arm();
    running.set(this.home, this);
  }

  /** Registers one of the plugin's own due entries; the owner is the Host's stamp from the trusted context. */
  registerDue(owner: DueEntryOwner, entry: { readonly entry_key: string; readonly due_at: string }): DueEntryRecord {
    const record = this.due.register(owner, entry);
    this.timer.arm();
    return record;
  }

  cancelDue(owner: DueEntryOwner, entryKey: string): boolean {
    const removed = this.due.cancel(owner, entryKey);
    this.timer.arm();
    return removed;
  }

  /**
   * A synchronized write or a restore reached a partition: mark its overview dirty, and when read-only libraries are supplied (either on
   * this call or via options.libraries), read them immediately on a read-only connection without waking any plugin so synced reminders
   * update the due registry and arm the timer right away (V11).
   */
  partitionChanged(partitionId: string, installId?: string, libraries?: readonly OverviewLibrary[]): void {
    this.overview.markDirty(partitionId, installId);
    const source = libraries ?? this.resolveLibraries?.(partitionId, installId);
    if (!source?.length) return;
    const matched = source.filter(library => library.partition_id === partitionId && (installId === undefined || library.install_id === installId));
    if (matched.length > 0) this.overview.refreshDirty(matched);
  }

  /**
   * The overview for `caller`: checks what the caller may read now, refreshes only dirty libraries among those allowed partitions
   * (read-only, starting nothing), then answers what the caller may see. `now` is asked before the read and again before the rows are
   * handed over (`overview-readers`).
   */
  readOverview(caller: ActionCallContext, libraries: readonly OverviewLibrary[], now: () => { readonly readable: readonly string[]; readonly grants: readonly OverviewGrant[] },
    query: { readonly kinds?: readonly OverviewKind[]; readonly limit?: number } = {}): OverviewIndexRow[] {
    const initial = overviewReach(caller, now());
    const allowed = new Set(initial.map(entry => entry.partition_id));
    this.overview.refreshDirty(libraries.filter(library => allowed.has(library.partition_id)));
    return this.overview.read(() => overviewReach(caller, now()), query);
  }

  /** The plugin was disabled in this partition: its due entries and overview rows there go now. */
  pluginDisabled(installId: string, partitionId: string): void {
    this.due.clearInstall(installId, partitionId);
    this.overview.removeInstall(installId, partitionId);
    this.timer.arm();
  }

  close(): void {
    if (running.get(this.home) === this) running.delete(this.home);
    this.timer.close();
    this.due.close();
    this.overview.close();
  }
}

/** Runs `work` on a Home store only when its file is there: a cleanup never creates a library nobody wrote. */
function ifStore(home: string, store: string, work: () => void): void {
  if (existsSync(homeSqlitePath(home, store))) work();
}

/**
 * An installation was removed from one partition (`partitionId`), or from the Home altogether (`null`/`undefined`, clearing every
 * partition): its due entries and overview rows go, always (they are the platform's, like an authorization). Its evidence holds go with
 * its data (`dataGoes`). Its person settings go when its data goes and no other place still has it installed (`installedElsewhere` false):
 * they follow the person, not one partition.
 */
export function forgetInstallationPlatformRecords(home: string, installId: string, partitionId: string | null | undefined, options: { readonly dataGoes: boolean; readonly installedElsewhere: boolean }): void {
  const partition = partitionId ?? undefined;
  ifStore(home, DUE_REGISTRY_STORE, () => {
    const due = openDueRegistry(home);
    try { due.clearInstall(installId, partition); } finally { due.close(); }
  });
  ifStore(home, TEXT_SEARCH_STORE, () => {
    const index = new OverviewService(openOverviewIndex({ homeDirectory: home }));
    try { index.removeInstall(installId, partition); } finally { index.close(); }
  });
  if (options.dataGoes) forgetRetainedPlatformRecords(home, installId, partition, options.installedElsewhere);
}

export function forgetRetainedPlatformRecords(home: string, installId: string, partition: string | undefined, installedElsewhere: boolean): void {
  ifStore(home, EVIDENCE_STORE, () => {
    const ledger = openEvidenceLedger(home);
    try { ledger.releaseInstall(installId, partition); } finally { ledger.close(); }
  });
  if (installedElsewhere) return;
  ifStore(home, PERSON_SETTINGS_STORE, () => {
    const settings = openPersonSettings(home);
    try { settings.clearInstall(installId); } finally { settings.close(); }
  });
}

/** A synchronized write or a restore reached a partition while no services run: mark its libraries dirty in the overview index, if there is one. */
export function markPartitionChanged(home: string, partitionId: string, installId?: string): void {
  ifStore(home, TEXT_SEARCH_STORE, () => {
    const index = new OverviewService(openOverviewIndex({ homeDirectory: home }));
    try { index.markDirty(partitionId, installId); } finally { index.close(); }
  });
}

/** A partition was deleted: every due entry, overview row and evidence hold it had goes with it. */
export function forgetPartitionPlatformRecords(home: string, partitionId: string): void {
  ifStore(home, DUE_REGISTRY_STORE, () => {
    const due = openDueRegistry(home);
    try { due.clearPartition(partitionId); } finally { due.close(); }
  });
  ifStore(home, TEXT_SEARCH_STORE, () => {
    const index = new OverviewService(openOverviewIndex({ homeDirectory: home }));
    try { index.removePartition(partitionId); } finally { index.close(); }
  });
  ifStore(home, EVIDENCE_STORE, () => {
    const ledger = openEvidenceLedger(home);
    try { ledger.releasePartition(partitionId); } finally { ledger.close(); }
  });
}

/**
 * The active installation of a plugin in the Home's install table, with the person settings its Manifest declares, for sync
 * (`personSettingsConfigReplica`). Uninstalled rows are ignored; if more than one active installation shares a plugin id, returns null
 * rather than guessing which installation owns synced preferences.
 */
export function personSettingsInstallations(installations: () => readonly { readonly install_id: string; readonly state?: string; readonly manifest: Pick<PluginManifest, "plugin_id" | "person_settings"> }[]): PersonSettingsInstallation {
  return pluginId => {
    const active = installations().filter(entry => entry.state !== "uninstalled" && entry.manifest.plugin_id === pluginId);
    if (active.length !== 1) return null;
    const found = active[0]!;
    return { install_id: found.install_id, declarations: found.manifest.person_settings as PluginPersonSettingsDeclaration | undefined };
  };
}
