import type { SqliteSnapshotInfo } from "@molis-ai/molis-work-storage";
import type { SnapshotExclusion, SnapshotKeyDependency } from "./home-store-snapshot.js";

export interface HomeSnapshotFile {
  readonly kind: "file" | "sealed";
  readonly path: string;
  readonly payload_path: string;
  readonly mode: number;
  readonly size: number;
  readonly sha256: string;
  readonly sqlite?: SqliteSnapshotInfo;
  readonly binding?: string;
}
export interface HomeSnapshotDirectory {
  readonly kind: "directory";
  readonly path: string;
  readonly mode: number;
}
export interface HomeSnapshotStoreManifest {
  readonly path: string;
  readonly owner: string;
  readonly state: "absent" | "omitted" | "captured";
  readonly entries: readonly (HomeSnapshotFile | HomeSnapshotDirectory)[];
  readonly dependencies: readonly SnapshotKeyDependency[];
  readonly exclusions: readonly SnapshotExclusion[];
  readonly owner_payload?: {
    readonly kind: "connector-private-state";
    readonly payload_path: string;
    readonly size: number;
    readonly sha256: string;
  };
}

/** Restore input for the original Home and original keys. Existence in the published directory means capture completed. */
export interface HomeSnapshotManifest {
  readonly schema_version: 1;
  readonly product_version: string;
  readonly created_at: string;
  readonly home_directory: string;
  readonly home_mode: number;
  readonly container_directories: readonly HomeSnapshotDirectory[];
  readonly stores: readonly HomeSnapshotStoreManifest[];
  readonly exclusions: readonly SnapshotExclusion[];
  readonly external_dependencies: readonly string[];
}

export interface HomeSnapshotResult {
  readonly status: "created";
  readonly home_directory: string;
  readonly snapshot_directory: string;
  readonly stores: number;
  readonly databases: number;
}
