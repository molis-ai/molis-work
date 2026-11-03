import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, opendirSync, openSync, readSync, realpathSync, type Stats } from "node:fs";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { ActionError, defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import { openExistingHomePayload, sealExistingHomePayload, type SealedHomePayload } from "@molis-ai/molis-work-storage";
import { readManagedConnectorTool } from "./connector-tool-install.js";

export const CONNECTOR_PRIVATE_STATE_OWNER = "connector-private-state";
const errors = defineErrorCodes("connector.private_state", { invalid: "invalid", limit_exceeded: "too_large" });
const MAX_BYTES = 32 * 1024 * 1024, MAX_NODES = 10_000, MAX_SEALED_BYTES = 128 * 1024 * 1024;
const installationId = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u;
const fail = () => errors.invalid("受管 CLI 私有状态的格式、安装归属或文件路径无效");
const overLimit = () => errors.limit_exceeded("受管 CLI 私有状态超出本次资源边界；整次未生成可用快照或恢复计划");

function readBudget() {
  let bytes = 0, nodes = 0, sealed = 0;
  const add = (current: number, amount: number, maximum: number) => {
    if (!Number.isSafeInteger(amount) || amount < 0) throw fail();
    if (amount > maximum - current) throw overLimit();
    return current + amount;
  };
  return {
    file(size: number) { bytes = add(bytes, size, MAX_BYTES); },
    nodes(count = 1) { nodes = add(nodes, count, MAX_NODES); },
    sealed(size: number) { sealed = add(sealed, size, MAX_SEALED_BYTES); },
    beforeSeal(contents: string) {
      // The two existing base64 layers alone are a lower bound: reject certain overflow before AES allocations.
      const minimum = 4 * Math.ceil((4 * Math.ceil(Buffer.byteLength(contents) / 3)) / 3);
      if (minimum > MAX_SEALED_BYTES - sealed) throw overLimit();
    },
  };
}
type ReadBudget = ReturnType<typeof readBudget>;

function* directoryEntries(directory: string) {
  const opened = opendirSync(directory);
  try {
    let entry;
    while ((entry = opened.readSync()) !== null) yield entry;
  } finally { opened.closeSync(); }
}

function installationIds(root: string | null, budget: ReadBudget): string[] {
  const ids: string[] = [];
  if (root) for (const entry of directoryEntries(root)) { budget.nodes(); ids.push(entry.name); }
  return ids.sort();
}

function ownerRead<T>(read: () => T): T {
  try { return read(); } catch (error) {
    if (error instanceof ActionError) throw error;
    throw fail();
  }
}

export interface ConnectorPrivateStateSnapshot {
  schema_version: 1;
  owner: typeof CONNECTOR_PRIVATE_STATE_OWNER;
  installations: Array<{ installation_id: string; source_sha256: string; payload: SealedHomePayload }>;
}

interface PrivateDirectory { relative_path: string; mode: number }
interface PrivateFile extends PrivateDirectory { contents_base64: string }
interface PrivateTree { schema_version: 1; root_present: boolean; directories: PrivateDirectory[]; files: PrivateFile[] }
type RestoredTree = Omit<PrivateTree, "files"> & { files: Array<PrivateDirectory & { bytes: Buffer }> };

/** Plaintext is returned only to an explicit restore owner, after all installations have passed preflight. */
export interface ConnectorPrivateStateRestorePlan {
  installation_id: string;
  root_path: string;
  root_present: boolean;
  directories: ReadonlyArray<Readonly<PrivateDirectory>>;
  files: ReadonlyArray<{ readonly relative_path: string; readonly mode: number; readonly bytes: Uint8Array }>;
}

function info(file: string): Stats | undefined {
  try { return lstatSync(file, { throwIfNoEntry: false }); } catch { throw fail(); }
}

function plainDirectory(directory: string, optional = false): boolean {
  const entry = info(directory);
  if (!entry && optional) return false;
  if (!entry?.isDirectory() || entry.isSymbolicLink() || realpathSync(directory) !== directory) throw fail();
  return true;
}

function homeRoot(homeDirectory: string): string {
  if (!isAbsolute(homeDirectory)) throw fail();
  try {
    const home = realpathSync(homeDirectory);
    plainDirectory(home); return home;
  } catch { throw fail(); }
}

function installsRoot(home: string): string | null {
  let current = home;
  for (const segment of ["runtime", "connectors", "installs"]) {
    current = join(current, segment);
    if (!plainDirectory(current, true)) return null;
  }
  return current;
}

function regularFile(file: string, entry = info(file)): Stats {
  if (!entry?.isFile() || entry.nlink !== 1 || realpathSync(file) !== file) throw fail();
  return entry;
}

function ownedInstallation(home: string, id: string) {
  if (!installationId.test(id)) throw fail();
  const root = installsRoot(home);
  if (!root) throw fail();
  const directory = join(root, id);
  plainDirectory(directory); regularFile(join(directory, "installation.json"));
  try {
    const installed = readManagedConnectorTool(home, id);
    return { root: join(directory, ".home"), source: createHash("sha256").update(JSON.stringify(installed.source)).digest("hex") };
  } catch { throw fail(); }
}

function readPrivateFile(file: string, before: Stats): Buffer {
  let descriptor: number;
  try { descriptor = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); } catch { throw fail(); }
  try {
    const held = fstatSync(descriptor);
    if (!held.isFile() || held.nlink !== 1 || held.ino !== before.ino || held.dev !== before.dev
      || held.size !== before.size || held.mtimeMs !== before.mtimeMs || held.ctimeMs !== before.ctimeMs) throw fail();
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(descriptor, bytes, offset, bytes.length - offset, offset);
      if (!count) throw fail();
      offset += count;
    }
    const after = fstatSync(descriptor), current = regularFile(file);
    if (after.ino !== current.ino || after.dev !== current.dev || after.size !== bytes.length || after.nlink !== 1
      || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) throw fail();
    return bytes;
  } finally { closeSync(descriptor); }
}

function captureTree(root: string, budget: ReadBudget): PrivateTree {
  const tree: PrivateTree = { schema_version: 1, root_present: plainDirectory(root, true), directories: [], files: [] };
  if (!tree.root_present) return tree;
  budget.nodes();
  const pending = [{ directory: root, path: "" }];
  while (pending.length) {
    const { directory, path } = pending.pop()!;
    plainDirectory(directory);
    tree.directories.push({ relative_path: path, mode: lstatSync(directory).mode & 0o777 });
    for (const { name } of directoryEntries(directory)) {
      budget.nodes();
      const file = join(directory, name), next = path ? path + "/" + name : name, entry = info(file);
      if (!safeRelative(next)) throw fail();
      if (entry?.isDirectory() && !entry.isSymbolicLink()) pending.push({ directory: file, path: next });
      else {
        const regular = regularFile(file, entry);
        budget.file(regular.size);
        tree.files.push({ relative_path: next, mode: regular.mode & 0o777, contents_base64: readPrivateFile(file, regular).toString("base64") });
      }
    }
  }
  const byPath = (a: PrivateDirectory, b: PrivateDirectory) => a.relative_path < b.relative_path ? -1 : a.relative_path > b.relative_path ? 1 : 0;
  tree.directories.sort(byPath); tree.files.sort(byPath);
  return tree;
}

const binding = (id: string, source: string) => JSON.stringify({ owner: CONNECTOR_PRIVATE_STATE_OWNER, installation_id: id, source_sha256: source });

/** Enumerates this owner's installations without writing the Home, live vault, locks or plaintext staging files. */
export function captureConnectorPrivateState(homeDirectory: string): ConnectorPrivateStateSnapshot {
  return ownerRead(() => {
    const home = homeRoot(homeDirectory), root = installsRoot(home), budget = readBudget();
    const installations: ConnectorPrivateStateSnapshot["installations"] = [];
    for (const id of installationIds(root, budget)) {
      const owned = ownedInstallation(home, id), contents = JSON.stringify(captureTree(owned.root, budget));
      budget.beforeSeal(contents);
      const payload = sealExistingHomePayload(home, binding(id, owned.source), contents);
      budget.sealed(Buffer.byteLength(payload.ciphertext));
      installations.push({ installation_id: id, source_sha256: owned.source, payload });
    }
    return { schema_version: 1, owner: CONNECTOR_PRIVATE_STATE_OWNER, installations };
  });
}

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const mode = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0o777;

function safeRelative(value: unknown, allowRoot = false): value is string {
  return typeof value === "string" && (allowRoot && value === "" || value.length > 0 && !isAbsolute(value)
    && !value.includes("\\") && !value.includes("\0") && value.split("/").every(part => part !== "" && part !== "." && part !== ".."));
}

const parent = (path: string) => { const value = dirname(path); return value === "." ? "" : value.split(sep).join("/"); };

function parseTree(contents: string, budget: ReadBudget): RestoredTree {
  let body: unknown;
  try { body = JSON.parse(contents); } catch { throw fail(); }
  if (!record(body) || body.schema_version !== 1 || typeof body.root_present !== "boolean" || !Array.isArray(body.directories) || !Array.isArray(body.files)) throw fail();
  budget.nodes(body.directories.length + body.files.length);
  const directories: PrivateDirectory[] = [], files: RestoredTree["files"] = [], names = new Set<string>();
  for (const entry of body.directories) {
    if (!record(entry) || !safeRelative(entry.relative_path, true) || !mode(entry.mode) || names.has(entry.relative_path)) throw fail();
    names.add(entry.relative_path); directories.push({ relative_path: entry.relative_path, mode: entry.mode });
  }
  if (body.root_present !== names.has("")) throw fail();
  for (const entry of directories) if (entry.relative_path && !names.has(parent(entry.relative_path))) throw fail();
  const directoryNames = new Set(names);
  for (const entry of body.files) {
    if (!record(entry) || !safeRelative(entry.relative_path) || !mode(entry.mode) || names.has(entry.relative_path)
      || !directoryNames.has(parent(entry.relative_path)) || typeof entry.contents_base64 !== "string") throw fail();
    const encoded = entry.contents_base64;
    if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(encoded)) throw fail();
    const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
    budget.file(encoded.length / 4 * 3 - padding);
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.toString("base64") !== encoded) throw fail();
    names.add(entry.relative_path); files.push({ relative_path: entry.relative_path, mode: entry.mode, bytes });
  }
  if (!body.root_present && (directories.length || files.length)) throw fail();
  return { schema_version: 1, root_present: body.root_present, directories, files };
}

function inspectDestination(root: string, tree: RestoredTree, budget: ReadBudget): void {
  if (!plainDirectory(root, true)) return;
  budget.nodes();
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop()!;
    plainDirectory(directory);
    for (const { name } of directoryEntries(directory)) {
      budget.nodes();
      const path = join(directory, name), entry = info(path);
      if (entry?.isDirectory() && !entry.isSymbolicLink()) pending.push(path); else regularFile(path, entry);
    }
  }
  for (const directory of tree.directories) plainDirectory(join(root, directory.relative_path), true);
  for (const file of tree.files) {
    const path = join(root, file.relative_path), entry = info(path);
    if (entry) regularFile(path, entry);
  }
}

/** Returns a complete memory-only file plan; the shared restore publisher still owns every write and rollback. */
export function preflightConnectorPrivateStateRestore(homeDirectory: string, snapshot: unknown): ConnectorPrivateStateRestorePlan[] {
  return ownerRead(() => {
    const home = homeRoot(homeDirectory);
    if (!record(snapshot) || snapshot.schema_version !== 1 || snapshot.owner !== CONNECTOR_PRIVATE_STATE_OWNER || !Array.isArray(snapshot.installations)) throw fail();
    if (snapshot.installations.length > MAX_NODES) throw overLimit();
    const budget = readBudget(), destination = readBudget(), ids = installationIds(installsRoot(home), budget);
    if (snapshot.installations.length !== ids.length) throw fail();
    for (const entry of snapshot.installations) {
      if (!record(entry) || !record(entry.payload) || typeof entry.payload.ciphertext !== "string") throw fail();
      budget.sealed(Buffer.byteLength(entry.payload.ciphertext));
    }
    const seen = new Set<string>(), plans: ConnectorPrivateStateRestorePlan[] = [];
    for (const entry of snapshot.installations) {
      if (!record(entry) || typeof entry.installation_id !== "string" || typeof entry.source_sha256 !== "string" || seen.has(entry.installation_id)) throw fail();
      seen.add(entry.installation_id);
      const owned = ownedInstallation(home, entry.installation_id);
      if (entry.source_sha256 !== owned.source) throw fail();
      const tree = parseTree(openExistingHomePayload(home, binding(entry.installation_id, owned.source), entry.payload), budget);
      destination.nodes(); inspectDestination(owned.root, tree, destination);
      if (relative(home, owned.root).startsWith("..")) throw fail();
      plans.push({ installation_id: entry.installation_id, root_path: owned.root, root_present: tree.root_present,
        directories: tree.directories, files: tree.files });
    }
    return plans;
  });
}
