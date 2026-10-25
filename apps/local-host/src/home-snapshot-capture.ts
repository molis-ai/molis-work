import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { backupSnapshotSqlite, copySnapshotFile, readSnapshotFile, sealExistingHomePayload, snapshotFileDigest } from "@molis-ai/molis-work-storage";
import type { HomeSnapshotFile, HomeSnapshotStoreManifest } from "./home-snapshot-contract.js";
import type { SnapshotSourceEntry, SnapshotStoreInventory } from "./home-snapshot-inventory.js";
import { homeSnapshotErrors, type SnapshotKeyDependency } from "./home-store-snapshot.js";
import { writeSnapshotJson } from "./home-snapshot-publication.js";

interface CaptureControl { readonly signal?: AbortSignal; assertCurrent(): void }
const sourcePath = (inventory: SnapshotStoreInventory, entry: SnapshotSourceEntry) => entry.relative ? inventory.store.path + "/" + entry.relative : inventory.store.path;

/** All key identities are references; no key's contents enter the staging directory. */
function dependencies() {
  const items = new Map<string, SnapshotKeyDependency>();
  return { add(item: SnapshotKeyDependency) {
    const key = item.kind + ":" + item.location, previous = items.get(key);
    if (previous && previous.sha256 !== item.sha256) throw homeSnapshotErrors.changed("原 Home 密钥依赖在快照期间改变");
    items.set(key, item);
  }, all: () => [...items.values()].sort((a, b) => a.location.localeCompare(b.location)) };
}

function assertRetainedKey(inventory: SnapshotStoreInventory): void {
  const paths = inventory.files.map(file => file.relative), retained = inventory.store.snapshot.retained;
  const required = retained && paths.some(file => file.startsWith(retained.content.directory + "/")) ? [retained.content.dependency] : [];
  for (const path of required) if (!inventory.files.some(file => file.relative === path && file.disposition.kind === "key")) {
    throw homeSnapshotErrors.key_unavailable(`缺少同 Home 原密钥，不会生成替代值: ${inventory.store.path}/${path}`);
  }
}

export async function captureSnapshotStore(home: string, stage: string, inventory: SnapshotStoreInventory, control: CaptureControl): Promise<HomeSnapshotStoreManifest> {
  const base = { path: inventory.store.path, owner: inventory.store.owner, state: inventory.state, exclusions: inventory.exclusions };
  if (inventory.state !== "captured") return { ...base, entries: [], dependencies: [] };
  assertRetainedKey(inventory);
  const keys = dependencies(), entries: HomeSnapshotStoreManifest["entries"][number][] = [];
  for (const directory of inventory.directories) {
    const path = sourcePath(inventory, directory);
    mkdirSync(join(stage, "data", path), { recursive: true, mode: 0o700 });
    entries.push({ kind: "directory", path, mode: directory.info.mode & 0o777 });
  }
  control.assertCurrent(); control.signal?.throwIfAborted();
  let ownerPayload: HomeSnapshotStoreManifest["owner_payload"];
  if (inventory.store.snapshot.capture) {
    const captured = inventory.store.snapshot.capture(home), payloadPath = "sealed/" + inventory.store.path + ".json";
    for (const entry of captured.installations) keys.add({ kind: "master-key", ...entry.payload.key_reference });
    writeSnapshotJson(join(stage, payloadPath), captured);
    ownerPayload = { kind: "connector-private-state", payload_path: payloadPath, ...snapshotFileDigest(join(stage, payloadPath)) };
  }
  for (const entry of inventory.files) {
    control.assertCurrent(); control.signal?.throwIfAborted();
    const path = sourcePath(inventory, entry);
    if (entry.disposition.kind === "key") {
      if (entry.disposition.bytes !== undefined && entry.info.size !== entry.disposition.bytes) throw homeSnapshotErrors.key_unavailable(`原密钥格式无效，不会生成替代值: ${path}`);
      keys.add({ kind: "file-key", location: "home:" + path, sha256: snapshotFileDigest(entry.path).sha256 });
      continue;
    }
    const dependency = await inventory.store.snapshot.validateFile?.(home, entry.relative);
    if (dependency) keys.add(dependency);
    const payloadPath = (entry.disposition.kind === "sealed" ? "sealed/" : "data/") + path + (entry.disposition.kind === "sealed" ? ".json" : "");
    const destination = join(stage, payloadPath);
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    let captured: Pick<HomeSnapshotFile, "size" | "sha256" | "mode" | "sqlite">;
    let binding: string | undefined;
    if (entry.disposition.kind === "sealed") {
      binding = JSON.stringify(["home-snapshot-file/v1", inventory.store.owner, path]);
      const body = { schema_version: 1, path, mode: entry.info.mode & 0o777, contents_base64: readSnapshotFile(entry.path, 32 * 1024 * 1024).toString("base64") };
      const payload = sealExistingHomePayload(home, binding, JSON.stringify(body));
      keys.add({ kind: "master-key", ...payload.key_reference });
      writeSnapshotJson(destination, { schema_version: 1, binding, payload });
      captured = { ...snapshotFileDigest(destination), mode: entry.info.mode & 0o777 };
    } else captured = entry.database ? await backupSnapshotSqlite(entry.path, destination, { ...entry.database, signal: control.signal })
      : await copySnapshotFile(entry.path, destination, control.signal);
    control.assertCurrent(); control.signal?.throwIfAborted();
    entries.push({ kind: entry.disposition.kind === "sealed" ? "sealed" : "file", path, payload_path: payloadPath, ...captured, ...(binding ? { binding } : {}) });
  }
  await inventory.store.snapshot.inspect?.(join(stage, "data", inventory.store.path), join(home, inventory.store.path),
    [...inventory.directories, ...inventory.files].map(entry => entry.relative), control);
  control.assertCurrent(); control.signal?.throwIfAborted();
  return { ...base, entries, dependencies: keys.all(), ...(ownerPayload ? { owner_payload: ownerPayload } : {}) };
}
