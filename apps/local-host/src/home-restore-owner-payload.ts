import { createHash } from "node:crypto";
import { join } from "node:path";
import { openExistingHomePayload } from "@molis-ai/molis-work-storage";
import { preflightConnectorPrivateStateRestore, type ConnectorPrivateStateSnapshot } from "./connector-private-state.js";
import type { HomeRestoreIncomingFile } from "./home-restore-contract.js";
import type { HomeSnapshotFile } from "./home-snapshot-contract.js";
import type { SnapshotKeyDependency } from "./home-store-snapshot.js";
import { readRestoreJson } from "./home-restore-archive.js";
import { invalidRestore, restoreFields, restoreHash, restoreRecord, restoreString } from "./home-restore-input.js";

export function memoryRestoreFile(path: string, mode: number, bytes: Uint8Array): HomeRestoreIncomingFile {
  return { path, mode, size: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex"), source: { kind: "memory", bytes } };
}

function masterDependency(value: unknown): SnapshotKeyDependency {
  const item = restoreRecord(restoreRecord(value).key_reference); restoreFields(item, ["location", "sha256"]);
  return { kind: "master-key", location: restoreString(item.location), sha256: restoreHash(item.sha256) };
}

/** The snapshot-file owner alone interprets its own wrapper; the OS bookmark inside remains opaque original bytes. */
export function preflightSnapshotFile(home: string, archive: string, owner: string, entry: HomeSnapshotFile): { readonly file: HomeRestoreIncomingFile; readonly dependency: SnapshotKeyDependency } {
  const binding = JSON.stringify(["home-snapshot-file/v1", owner, entry.path]);
  const wrapper = restoreRecord(readRestoreJson(join(archive, entry.payload_path)));
  restoreFields(wrapper, ["schema_version", "binding", "payload"]);
  if (wrapper.schema_version !== /* @version format.home.snapshot.file-wrapper */ 1 || wrapper.binding !== binding || entry.binding !== binding) throw invalidRestore();
  let contents: unknown;
  try { contents = JSON.parse(openExistingHomePayload(home, binding, wrapper.payload)) as unknown; } catch { throw invalidRestore(); }
  const body = restoreRecord(contents); restoreFields(body, ["schema_version", "path", "mode", "contents_base64"]);
  if (body.schema_version !== /* @version format.home.snapshot.file-body */ 1 || body.path !== entry.path || body.mode !== entry.mode || typeof body.contents_base64 !== "string"
    || body.contents_base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(body.contents_base64) || body.contents_base64.length > 4 * Math.ceil(32 * 1024 * 1024 / 3)) throw invalidRestore();
  const bytes = Buffer.from(body.contents_base64, "base64");
  if (bytes.length > 32 * 1024 * 1024 || bytes.toString("base64") !== body.contents_base64) throw invalidRestore();
  return { file: memoryRestoreFile(entry.path, entry.mode, bytes), dependency: masterDependency(wrapper.payload) };
}

/** All installations pass the existing owner boundary before any private plaintext joins the in-memory publication plan. */
export function preflightSnapshotConnectors(home: string, archive: string, payload: string) {
  const snapshot = readRestoreJson(join(archive, payload));
  const plans = preflightConnectorPrivateStateRestore(home, snapshot, { archiveDataDirectory: join(archive, "data") });
  const files: HomeRestoreIncomingFile[] = [], directories: Array<{ path: string; mode: number }> = [];
  for (const plan of plans) {
    const root = "runtime/connectors/installs/" + plan.installation_id + "/.home";
    for (const directory of plan.directories) directories.push({ path: directory.relative_path ? root + "/" + directory.relative_path : root, mode: directory.mode });
    for (const file of plan.files) files.push(memoryRestoreFile(root + "/" + file.relative_path, file.mode, file.bytes));
  }
  // The owner has authenticated these public dependency references while opening every complete payload above.
  const dependencies = (snapshot as ConnectorPrivateStateSnapshot).installations.map(installation => masterDependency(installation.payload));
  return { files, directories, dependencies };
}
