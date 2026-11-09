import type { RestoreNodeIdentity, RestoreTargetNode } from "./home-restore-files.js";
import type { RestoreDirectoryPlan } from "./home-restore-target.js";
import { invalidRestore, parseRestoreDependency, parseRestoreSqliteInfo, restoreFields, restoreHash, restoreInteger, restoreMode, restoreRecord, restoreRelative, restoreString } from "./home-restore-input.js";
import type { SnapshotKeyDependency } from "./home-store-snapshot.js";
import type { SqliteSnapshotInfo } from "@molis-ai/molis-work-storage";
import { PRODUCT_VERSION } from "./product-version.js";

export type HomeRestorePhase = "prepared" | "publishing" | "committed";
export interface RestoreJournalFile { readonly path: string; readonly mode: number; readonly size: number; readonly sha256: string; readonly sqlite?: SqliteSnapshotInfo }
export interface HomeRestoreJournal {
  readonly schema_version: 2;
  readonly space_digest: string | null;
  readonly initialize_local_space?: string;
  readonly product_version: string;
  readonly home_directory: string;
  readonly operation_id: string;
  readonly originals_directory: string;
  readonly phase: HomeRestorePhase;
  readonly home_identity: RestoreNodeIdentity;
  readonly runtime_identity: RestoreNodeIdentity;
  readonly work_identity: RestoreNodeIdentity;
  readonly home_mode: number;
  readonly originals: readonly RestoreTargetNode[];
  readonly directories: readonly RestoreDirectoryPlan[];
  readonly files: readonly RestoreJournalFile[];
  readonly preserved: readonly RestoreTargetNode[];
  readonly dependencies: readonly SnapshotKeyDependency[];
  readonly registry_input?: { readonly size: number; readonly sha256: string };
  readonly registry_original?: { readonly size: number; readonly sha256: string };
}

function list<T>(value: unknown, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) throw invalidRestore();
  return value.map(parse);
}

function finite(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw invalidRestore();
  return value;
}

function identity(value: unknown): RestoreNodeIdentity {
  const item = restoreRecord(value); restoreFields(item, ["kind", "dev", "ino", "mode", "size", "mtime_ms", "ctime_ms"]);
  if (item.kind !== "file" && item.kind !== "directory") throw invalidRestore();
  return { kind: item.kind, dev: restoreInteger(item.dev), ino: restoreInteger(item.ino), mode: restoreMode(item.mode), size: restoreInteger(item.size),
    mtime_ms: finite(item.mtime_ms), ctime_ms: finite(item.ctime_ms) };
}

function node(value: unknown): RestoreTargetNode {
  const item = restoreRecord(value); restoreFields(item, ["path", "identity"], ["opaque"]);
  if (item.opaque !== undefined && item.opaque !== true) throw invalidRestore();
  const parsed = identity(item.identity);
  if (item.opaque && parsed.kind !== "directory") throw invalidRestore();
  return { path: restoreRelative(item.path), identity: parsed, ...(item.opaque ? { opaque: true } : {}) };
}

function directory(value: unknown): RestoreDirectoryPlan {
  const item = restoreRecord(value); restoreFields(item, ["path", "mode"], ["original"]);
  const original = item.original === undefined ? undefined : identity(item.original);
  if (original && original.kind !== "directory") throw invalidRestore();
  return { path: restoreRelative(item.path), mode: restoreMode(item.mode), ...(original ? { original } : {}) };
}

function file(value: unknown): RestoreJournalFile {
  const item = restoreRecord(value); restoreFields(item, ["path", "mode", "size", "sha256"], ["sqlite"]);
  return { path: restoreRelative(item.path), mode: restoreMode(item.mode), size: restoreInteger(item.size), sha256: restoreHash(item.sha256),
    ...(item.sqlite !== undefined ? { sqlite: parseRestoreSqliteInfo(item.sqlite) } : {}) };
}

function registry(value: unknown): { readonly size: number; readonly sha256: string } | undefined {
  if (value === undefined) return undefined;
  const item = restoreRecord(value); restoreFields(item, ["size", "sha256"]);
  return { size: restoreInteger(item.size), sha256: restoreHash(item.sha256) };
}

/** Only the explicit recovery owner parses this log. Mere presence blocks all normal startup regardless of validity. */
export function parseHomeRestoreJournal(value: unknown, home: string): HomeRestoreJournal {
  const item = restoreRecord(value);
  restoreFields(item, ["schema_version", "space_digest", "product_version", "home_directory", "operation_id", "originals_directory", "phase", "home_identity", "runtime_identity",
    "work_identity", "home_mode", "originals", "directories", "files", "preserved", "dependencies"], ["registry_input", "registry_original", "initialize_local_space"]);
  if (item.schema_version !== 2 || item.product_version !== PRODUCT_VERSION || item.home_directory !== home
    || typeof item.operation_id !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u.test(item.operation_id)
    || item.phase !== "prepared" && item.phase !== "publishing" && item.phase !== "committed") throw invalidRestore();
  const root = identity(item.home_identity), runtime = identity(item.runtime_identity), work = identity(item.work_identity);
  if (root.kind !== "directory" || runtime.kind !== "directory" || work.kind !== "directory" || work.mode !== 0o700) throw invalidRestore();
  const inputRegistry = registry(item.registry_input), originalRegistry = registry(item.registry_original);
  return { schema_version: 2, space_digest: item.space_digest === null ? null : restoreHash(item.space_digest),
    ...(item.initialize_local_space === undefined ? {} : { initialize_local_space: restoreString(item.initialize_local_space) }), product_version: PRODUCT_VERSION, home_directory: home, operation_id: item.operation_id,
    originals_directory: restoreString(item.originals_directory), phase: item.phase, home_identity: root, runtime_identity: runtime, work_identity: work,
    home_mode: restoreMode(item.home_mode), originals: list(item.originals, node), directories: list(item.directories, directory), files: list(item.files, file),
    preserved: list(item.preserved, node), dependencies: list(item.dependencies, parseRestoreDependency),
    ...(inputRegistry ? { registry_input: inputRegistry } : {}), ...(originalRegistry ? { registry_original: originalRegistry } : {}) };
}
