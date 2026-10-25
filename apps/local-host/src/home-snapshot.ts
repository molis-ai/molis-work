import { lstatSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { acquireStorageOwner, assertStorageOwner } from "@molis-ai/molis-work-storage";
import { agentRuntimeDirectory } from "./agent-runtime-paths.js";
import { captureSnapshotStore } from "./home-snapshot-capture.js";
import type { HomeSnapshotDirectory, HomeSnapshotManifest, HomeSnapshotResult, HomeSnapshotStoreManifest } from "./home-snapshot-contract.js";
import { assertSnapshotHomeInventory, inventorySnapshotStore, snapshotDirectoryInfo } from "./home-snapshot-inventory.js";
import { snapshotDestination, syncSnapshotPath, writeSnapshotJson } from "./home-snapshot-publication.js";
import { homeSnapshotErrors } from "./home-store-snapshot.js";
import { homeStores } from "./home-stores.js";
import { resolveConfiguredHome } from "./product-home.js";
import { PRODUCT_VERSION } from "./product-version.js";

export interface HomeSnapshotOptions {
  readonly homeDirectory?: string;
  readonly destination: string;
  readonly signal?: AbortSignal;
}

/** An offline maintenance operation, never a business Host or an online quiesce/resume protocol. */
export async function createHomeSnapshot(
  options: HomeSnapshotOptions,
): Promise<HomeSnapshotResult> {
  const requested = resolve(resolveConfiguredHome(options.homeDirectory));
  const source = lstatSync(requested);
  if (!source.isDirectory() || source.isSymbolicLink())
    throw homeSnapshotErrors.invalid("快照需要已经存在的普通 Home 目录");
  const home = realpathSync(requested),
    mode = snapshotDirectoryInfo(home).mode & 0o777;
  const destination = snapshotDestination(home, options.destination);
  options.signal?.throwIfAborted();
  const root = agentRuntimeDirectory(home),
    owner = acquireStorageOwner(root);
  let publication: ReturnType<ReturnType<typeof snapshotDestination>["create"]> | undefined;
  try {
    const assertCurrent = () => {
      options.signal?.throwIfAborted();
      assertStorageOwner(root, owner);
    };
    const registry = homeStores(home);
    assertSnapshotHomeInventory(home, registry);
    const inventory = registry.stores.map(store => inventorySnapshotStore(home, store));
    assertCurrent();
    publication = destination.create();
    const stores: HomeSnapshotStoreManifest[] = [];
    for (const store of inventory)
      stores.push(
        await captureSnapshotStore(home, publication.stage, store, {
          signal: options.signal,
          assertCurrent,
        }),
      );
    const containers = new Map<string, HomeSnapshotDirectory>();
    for (const store of registry.stores)
      if (store.path.includes("/")) {
        const path = dirname(store.path);
        if (lstatSync(join(home, path), { throwIfNoEntry: false }))
          containers.set(path, {
            kind: "directory",
            path,
            mode: snapshotDirectoryInfo(join(home, path)).mode & 0o777,
          });
      }
    const manifest: HomeSnapshotManifest = {
      schema_version: 1,
      product_version: PRODUCT_VERSION,
      created_at: new Date().toISOString(),
      home_directory: home,
      home_mode: mode,
      container_directories: [...containers.values()],
      stores,
      exclusions: registry.snapshotExclusions,
      external_dependencies: [
        "Restore only to this original canonical Home path using its original file/env/Keychain keys.",
        "Managed runtimes/packages must remain installed or be reinstalled at the recorded versions.",
        "Browser login state is excluded. Directory bookmarks may require selecting the directory again on this machine; external AppData is not copied.",
      ],
    };
    assertCurrent();
    writeSnapshotJson(join(publication.stage, "manifest.json"), manifest);
    // Flush every new payload directory from leaves up before exposing the manifest's directory.
    const directories = new Set<string>([publication.stage]);
    for (const store of stores) for (const entry of store.entries) {
      let directory = join(publication.stage, entry.kind === "directory" ? "data/" + entry.path : dirname(entry.payload_path));
      while (directory !== publication.stage) { directories.add(directory); directory = dirname(directory); }
    }
    for (const store of stores) if (store.owner_payload) directories.add(dirname(join(publication.stage, store.owner_payload.payload_path)));
    for (const directory of [...directories].sort((a, b) => b.length - a.length)) syncSnapshotPath(directory);
    assertCurrent();
    const published = publication.publish();
    return {
      status: "created",
      home_directory: home,
      snapshot_directory: published,
      stores: stores.length,
      databases: stores.reduce(
        (total, store) =>
          total + store.entries.filter(entry => entry.kind === "file" && entry.sqlite).length,
        0,
      ),
    };
  } catch (error) {
    if (error !== options.signal?.reason && error instanceof ActionError) {
      if (error.code === "actions.input_invalid") throw homeSnapshotErrors.invalid(error.message);
      if (error.code === "actions.conflict") throw homeSnapshotErrors.changed(error.message);
    }
    throw error;
  } finally {
    try {
      publication?.cleanup();
    } finally {
      owner.release();
    }
  }
}
