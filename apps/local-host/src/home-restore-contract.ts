import type { SqliteDatabase, SqliteSnapshotInfo } from "@molis-ai/molis-work-storage";
import type { HomeSnapshotManifest } from "./home-snapshot-contract.js";
import type { HomeSnapshotStoreRegistry } from "./home-store-snapshot.js";

export interface HomeRestoreControl { readonly signal?: AbortSignal; assertCurrent(): void }
/** Live cleanup only: no serialized capability, business replay or recovery completion. */
export interface HomeRestoreCleanupFailure extends Error {
  readonly code: "STORAGE_RECONCILE_REQUIRED";
  close(): Promise<void>;
}
export function isHomeRestoreCleanupFailure(value: unknown): value is HomeRestoreCleanupFailure {
  if (!(value instanceof Error) || !("code" in value) || value.code !== "STORAGE_RECONCILE_REQUIRED") return false;
  const close = Object.getOwnPropertyDescriptor(value, "close");
  return close?.enumerable === false && typeof close.value === "function";
}
export type HomeRestoreCatalogInspector = (database: SqliteDatabase) => Readonly<Record<string, string | number>>;

export interface HomeRestoreIncomingFile {
  readonly path: string;
  readonly mode: number;
  readonly size: number;
  readonly sha256: string;
  readonly sqlite?: SqliteSnapshotInfo;
  /** Owner plaintext stays in memory until written directly to its final controlled path. */
  readonly source: { readonly kind: "archive"; readonly path: string } | { readonly kind: "memory"; readonly bytes: Uint8Array };
}
export interface HomeRestoreDirectory { readonly path: string; readonly mode: number }
export interface HomeRestoreInputs {
  readonly initializeLocalSpace?: string;
  readonly manifest: HomeSnapshotManifest;
  readonly registry: HomeSnapshotStoreRegistry;
  readonly files: ReadonlyMap<string, HomeRestoreIncomingFile>;
  readonly directories: ReadonlyMap<string, HomeRestoreDirectory>;
}

export interface HomeRestoreResult {
  readonly status: "restored" | "unchanged" | "rolled_back" | "finished" | "no_recovery";
  readonly home_directory: string;
  readonly originals_directory?: string;
}
