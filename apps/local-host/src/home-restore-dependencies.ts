import { assertExistingHomeKeyReference } from "@molis-ai/molis-work-storage";
import type { HomeSnapshotStoreRegistry, SnapshotKeyDependency } from "./home-store-snapshot.js";
import { assertRestoreFileDependency } from "./home-restore-stores.js";

/** Data has already passed its owner's authentication; reentry still verifies that the original key identities remain. */
export function assertRestoreDependencies(home: string, registry: HomeSnapshotStoreRegistry, dependencies: readonly SnapshotKeyDependency[]): void {
  for (const dependency of dependencies) {
    if (dependency.kind === "file-key") assertRestoreFileDependency(home, registry, dependency);
    else assertExistingHomeKeyReference(home, dependency);
  }
}
