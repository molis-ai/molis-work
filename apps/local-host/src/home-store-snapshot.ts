import { join, relative } from "node:path";
import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import { listPluginProjectDatabases } from "@molis-ai/molis-work-plugin-runtime";
import { inspectSealedSecretsSnapshot, LocalCatalogMetadata, readSnapshotFile, type HomeStore, type HomeStoreRegistry, type SqliteSnapshotMetadata, type SqliteSnapshotOptions } from "@molis-ai/molis-work-storage";
import { ALCHEMIST_SEARCH_BASELINE, ALCHEMIST_STUDIO_BASELINE } from "./alchemist-search.js";
import { CATALOG_OWNER, CATALOG_SCHEMA_VERSION } from "./project-catalog-contract.js";
import { PROJECT_DATABASE_BASELINE } from "./project-database-schema.js";
import { captureConnectorPrivateState, type ConnectorPrivateStateSnapshot } from "./connector-private-state.js";
import { readManagedConnectorTool } from "./connector-tool-install.js";
import { readRuntimeConfigBackup } from "./installer/runtime-config-backups.js";
import { SUPPORTED_RUNTIME_IDS } from "./installer/runtime-integration-contract.js";

export const homeSnapshotErrors = defineErrorCodes("host.home_snapshot", {
  invalid: "invalid", unknown_data: "invalid", maintenance_pending: "unavailable", changed: "conflict", destination_exists: "conflict",
  key_unavailable: "unavailable", published_unconfirmed: "internal",
});

export type SnapshotDisposition = { readonly kind: "keep" | "key" | "sealed" } | { readonly kind: "omit"; readonly reason: string };
export interface SnapshotKeyDependency {
  readonly kind: "file-key" | "master-key";
  readonly location: string;
  readonly sha256: string;
}
export interface HomeStoreSnapshotPolicy {
  /** Static owner declaration, consumed only by the leased offline backup path. */
  readonly retained?: {
    readonly database: { readonly file: string; readonly metadata: SqliteSnapshotMetadata };
    readonly content: { readonly directory: string; readonly dependency: string };
  };
  readonly omit?: string;
  readonly emptyOnly?: boolean;
  readonly entry?: (home: string, relativePath: string) => SnapshotDisposition;
  readonly database?: (relativePath: string) => SqliteSnapshotOptions | undefined;
  readonly requiredKeys?: (files: readonly string[]) => readonly string[];
  readonly validateFile?: (home: string, relativePath: string) => Promise<SnapshotKeyDependency | undefined>;
  readonly capture?: (home: string) => ConnectorPrivateStateSnapshot;
}
export interface HomeSnapshotStore extends HomeStore { readonly snapshot: HomeStoreSnapshotPolicy }
export interface SnapshotExclusion { readonly path: string; readonly reason: string }
export interface HomeSnapshotStoreRegistry extends HomeStoreRegistry<HomeSnapshotStore> {
  /** Installer-owned non-data paths, classified beside the store entries rather than by the CLI. */
  readonly snapshotExclusions: readonly SnapshotExclusion[];
}

export const ordinarySnapshot: HomeStoreSnapshotPolicy = {};
export const omittedSnapshot = (reason: string): HomeStoreSnapshotPolicy => ({ omit: reason });
export const excluded = (reason: string): SnapshotDisposition => ({ kind: "omit", reason });

export const projectSnapshot: HomeStoreSnapshotPolicy = {
  database: file => {
    if (file === "catalog.db") return { inspect: db => {
      const meta = new LocalCatalogMetadata(db), owner = meta.owner(), version = meta.version();
      if (owner !== CATALOG_OWNER || version !== CATALOG_SCHEMA_VERSION) throw homeSnapshotErrors.invalid("目录库不是本版本的现行 owner/schema，未生成快照");
      return { owner, schema_version: version };
    } };
    if (/^[^/]+\/molis-work\.db$/u.test(file)) return { baseline: PROJECT_DATABASE_BASELINE, additionalTables: true,
      inspect: db => Object.fromEntries(listPluginProjectDatabases(db).flatMap(entry => [
        ["plugin:" + entry.plugin_id, entry.version], ["store:" + entry.plugin_id, entry.store_name], ["publisher:" + entry.plugin_id, entry.publisher_signature],
      ])) };
    return undefined;
  },
};

export const alchemistSnapshot: HomeStoreSnapshotPolicy = {
  database: file => /^projects\/[^/]+\/studio\.sqlite$/u.test(file) ? { baseline: ALCHEMIST_STUDIO_BASELINE }
    : /^projects\/[^/]+\/search\.sqlite$/u.test(file) ? { baseline: ALCHEMIST_SEARCH_BASELINE } : undefined,
};

/** This is path classification, never a second ownership test or a read of a lock descriptor. */
export const agentSnapshot: HomeStoreSnapshotPolicy = {
  entry: (_home, file) => /^\.molis-runtime-owner\.db(?:-journal|-wal|-shm)?$/u.test(file) ? excluded("Home ownership lock")
    : /^(?:leases|image-intake)(?:\/|$)/u.test(file) ? excluded("Agent temporary state")
      : file === "storage.key" ? { kind: "key" } : { kind: "keep" },
  requiredKeys: files => files.some(file => /^(?:records|checkpoints)\//u.test(file)) ? ["storage.key"] : [],
};

export const builderSnapshot: HomeStoreSnapshotPolicy = {
  entry: (_home, file) => /^[^/]+\/runs\/[^/]+\/\.molis-runtime-owner\.db(?:-journal|-wal|-shm)?$/u.test(file) ? excluded("Build Agent ownership lock")
    : /^[^/]+\/runs\/[^/]+\/storage\.key$/u.test(file) ? { kind: "key" }
    : /(?:^|\/)(?:node_modules|\.cache|leases)(?:\/|$)/u.test(file) ? excluded("Rebuildable dependencies/cache or execution lease") : { kind: "keep" },
  requiredKeys: files => [...new Set(files.flatMap(file => {
    const found = /^([^/]+\/runs\/[^/]+)\/(?:records|checkpoints)\//u.exec(file);
    return found ? [found[1] + "/storage.key"] : [];
  }))],
};

export const feedSnapshot: HomeStoreSnapshotPolicy = {
  entry: (_home, file) => /^secrets\.lock\.sqlite(?:-journal|-wal|-shm)?$/u.test(file) ? excluded("SecretStore mutex")
    : file === "secrets.key" ? { kind: "key" } : { kind: "keep" },
  validateFile: async (home, file) => {
    if (file !== "secrets.json") return undefined;
    const inspected = inspectSealedSecretsSnapshot(home, readSnapshotFile(join(home, "feed", file), 32 * 1024 * 1024).toString("utf8"));
    return inspected.key_reference ? { kind: "master-key", ...inspected.key_reference } : undefined;
  },
};

export const browserSnapshot: HomeStoreSnapshotPolicy = {
  entry: (_home, file) => file === "sites.json" ? { kind: "keep" }
    : /^(?:profile|downloads|uploads)(?:\/|$)/u.test(file) || /(?:^|\/)[^/]*\.pid$/u.test(file)
      ? excluded("Browser transient/login state; sign in again after recovery") : unknown(file),
};

export const directoryAccessSnapshot: HomeStoreSnapshotPolicy = {
  entry: (_home, file) => file === "bookmarks.json" ? { kind: "sealed" } : unknown(file),
};

export const runtimeBackupSnapshot: HomeStoreSnapshotPolicy = {
  validateFile: async (home, file) => {
    const matched = /^([^/]+)\/([A-Za-z0-9_-]{1,128})\.bak$/u.exec(file);
    const runtime = matched && SUPPORTED_RUNTIME_IDS.find(id => id === matched[1]);
    if (!matched || !runtime) throw homeSnapshotErrors.unknown_data("Runtime 配置备份有未分类条目，须先完成离线维护");
    await readRuntimeConfigBackup(home, runtime, matched[2]!);
    return undefined;
  },
};

function unknown(file: string): never { throw homeSnapshotErrors.unknown_data(`登记的存储含无法分类的条目，未生成快照: ${file}`); }

export const managedToolsSnapshot: HomeStoreSnapshotPolicy = {
  capture: captureConnectorPrivateState,
  entry: (home, file) => {
    if (file === "connectors" || file === "connectors/installs") return { kind: "keep" };
    if (/^connectors\/(?:runtimes|cache)(?:\/|$)/u.test(file)) return excluded("Reinstallable managed tool runtime/cache");
    const parts = /^connectors\/installs\/([^/]+)(?:\/(.+))?$/u.exec(file);
    if (!parts) return unknown(file);
    if (!parts[2]) return { kind: "keep" };
    const inside = parts[2];
    if (/^\.home(?:\/|$)/u.test(inside)) return excluded("Captured by connector-private-state owner as sealed payload");
    if (/^(?:node_modules|\.venv|\.tmp|release)(?:\/|$)/u.test(inside)) return excluded("Reinstallable managed package or temporary state");
    if (/^(?:installation\.json|package\.json|package-lock\.json|requirements\.lock|user\.npmrc|global\.npmrc)$/u.test(inside)) return { kind: "keep" };
    const installation = readManagedConnectorTool(home, parts[1]!);
    if (relative(join(home, "runtime"), installation.executable).split("\\").join("/") === file) return excluded("Reinstallable native executable");
    return unknown(file);
  },
};
