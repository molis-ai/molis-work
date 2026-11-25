import { existsSync } from "node:fs";
import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { OverviewIndexRow, OverviewKind, PluginManifest, PluginPersonSettingsDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { DUE_REGISTRY_STORE, DueTimer, openDueRegistry, type DueEntryOwner, type DueEntryRecord, type DueExpiredRecord, type DueRegistry } from "@molis-ai/molis-work-service-scheduler";
import { EVIDENCE_STORE, openEvidenceLedger } from "@molis-ai/molis-work-service-evidence";
import { PERSON_SETTINGS_STORE, openPersonSettings, type PersonSettingsInstallation } from "@molis-ai/molis-work-service-person-settings";
import { OverviewService, overviewReach, type OverviewGrant, type OverviewLibrary } from "@molis-ai/molis-work-service-search";
import { homeSqlitePath, openOverviewIndex, TEXT_SEARCH_STORE } from "@molis-ai/molis-work-storage";
import { partitionPluginScope, type PartitionPluginLease } from "./partition-plugin-assembly.js";

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
    if (!declaration || !kinds?.length) return [];
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

export interface PartitionPlatformServicesOptions {
  readonly home: string;
  /** The per-partition assembly: a due entry wakes only that (plugin, partition) instance. */
  readonly assembly: { acquire(pluginId: string, partitionId: string, reason: "due"): Promise<PartitionPluginLease> };
  /** Hands the due entry to the woken instance; batch 108 gives the plugins their handler. Without it, waking the instance is the whole of it. */
  readonly deliverDue?: (lease: PartitionPluginLease, entry: DueEntryRecord) => Promise<void>;
  readonly expired?: (entries: readonly DueExpiredRecord[]) => void;
  readonly failed?: (entry: DueEntryRecord, error: unknown) => void;
  readonly now?: () => Date;
}

export class PartitionPlatformServices {
  readonly due: DueRegistry;
  readonly timer: DueTimer;
  readonly overview: OverviewService;

  constructor(options: PartitionPlatformServicesOptions) {
    const now = options.now ?? (() => new Date());
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
    });
    this.timer.arm();
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

  /** A synchronized write or a restore reached a partition: its overview is read again on the next open, and nothing is started now. */
  partitionChanged(partitionId: string, installId?: string): void {
    this.overview.markDirty(partitionId, installId);
  }

  /**
   * The overview for `caller`: reads the dirty libraries among `libraries` first (read-only, starting nothing), then answers what the caller
   * may see. `now` is asked before the read and again before the rows are handed over (`overview-readers`).
   */
  readOverview(caller: ActionCallContext, libraries: readonly OverviewLibrary[], now: () => { readonly readable: readonly string[]; readonly grants: readonly OverviewGrant[] },
    query: { readonly kinds?: readonly OverviewKind[]; readonly limit?: number } = {}): OverviewIndexRow[] {
    overviewReach(caller, now());
    this.overview.refreshDirty(libraries);
    return this.overview.read(() => overviewReach(caller, now()), query);
  }

  /** The plugin was disabled in this partition: its due entries and overview rows there go now. */
  pluginDisabled(installId: string, partitionId: string): void {
    this.due.clearInstall(installId, partitionId);
    this.overview.removeInstall(installId, partitionId);
    this.timer.arm();
  }

  close(): void {
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
 * An installation was removed from one partition (`partitionId`), or from the Home altogether: its due entries and overview rows there go,
 * always (they are the platform's, like an authorization). Its evidence holds there go with its data (`dataGoes`). Its person settings go when
 * its data goes and no other place still has it installed (`installedElsewhere` false): they follow the person, not one partition.
 */
export function forgetInstallationPlatformRecords(home: string, installId: string, partitionId: string, options: { readonly dataGoes: boolean; readonly installedElsewhere: boolean }): void {
  ifStore(home, DUE_REGISTRY_STORE, () => {
    const due = openDueRegistry(home);
    try { due.clearInstall(installId, partitionId); } finally { due.close(); }
  });
  ifStore(home, TEXT_SEARCH_STORE, () => {
    const index = new OverviewService(openOverviewIndex({ homeDirectory: home }));
    try { index.removeInstall(installId, partitionId); } finally { index.close(); }
  });
  if (!options.dataGoes) return;
  ifStore(home, EVIDENCE_STORE, () => {
    const ledger = openEvidenceLedger(home);
    try { ledger.releaseInstall(installId, partitionId); } finally { ledger.close(); }
  });
  if (options.installedElsewhere) return;
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

/** The installation of a plugin in the Home's install table, with the person settings its Manifest declares, for sync (`personSettingsConfigReplica`). */
export function personSettingsInstallations(installations: () => readonly { readonly install_id: string; readonly manifest: Pick<PluginManifest, "plugin_id" | "person_settings"> }[]): PersonSettingsInstallation {
  return pluginId => {
    const found = installations().find(entry => entry.manifest.plugin_id === pluginId);
    return found ? { install_id: found.install_id, declarations: found.manifest.person_settings as PluginPersonSettingsDeclaration | undefined } : null;
  };
}
