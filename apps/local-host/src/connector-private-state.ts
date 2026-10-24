import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync, type Stats } from "node:fs";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { ActionError, defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import { openExistingHomePayload, sealExistingHomePayload, type SealedHomePayload } from "@molis-ai/molis-work-storage";
import { readManagedConnectorTool } from "./connector-tool-install.js";

export const CONNECTOR_PRIVATE_STATE_OWNER = "connector-private-state";
const errors = defineErrorCodes("connector.private_state", { invalid: "invalid" });
const installationId = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u;
const fail = () => errors.invalid("受管 CLI 私有状态的格式、安装归属或文件路径无效");

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
    if (!held.isFile() || held.nlink !== 1 || held.ino !== before.ino || held.dev !== before.dev) throw fail();
    const bytes = readFileSync(descriptor), after = fstatSync(descriptor), current = regularFile(file);
    if (after.ino !== current.ino || after.dev !== current.dev || after.size !== bytes.length || after.nlink !== 1
      || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) throw fail();
    return bytes;
  } finally { closeSync(descriptor); }
}

function captureTree(root: string): PrivateTree {
  const tree: PrivateTree = { schema_version: 1, root_present: plainDirectory(root, true), directories: [], files: [] };
  if (!tree.root_present) return tree;
  const visit = (directory: string, path: string) => {
    plainDirectory(directory);
    tree.directories.push({ relative_path: path, mode: lstatSync(directory).mode & 0o777 });
    for (const name of readdirSync(directory).sort()) {
      const file = join(directory, name), next = path ? path + "/" + name : name, entry = info(file);
      if (!safeRelative(next)) throw fail();
      if (entry?.isDirectory() && !entry.isSymbolicLink()) visit(file, next);
      else {
        const regular = regularFile(file, entry);
        tree.files.push({ relative_path: next, mode: regular.mode & 0o777, contents_base64: readPrivateFile(file, regular).toString("base64") });
      }
    }
  };
  visit(root, ""); return tree;
}

const binding = (id: string, source: string) => JSON.stringify({ owner: CONNECTOR_PRIVATE_STATE_OWNER, installation_id: id, source_sha256: source });

/** Enumerates this owner's installations without writing the Home, live vault, locks or plaintext staging files. */
export function captureConnectorPrivateState(homeDirectory: string): ConnectorPrivateStateSnapshot {
  return ownerRead(() => {
    const home = homeRoot(homeDirectory), root = installsRoot(home);
    const installations: ConnectorPrivateStateSnapshot["installations"] = [];
    for (const id of root ? readdirSync(root).sort() : []) {
      const owned = ownedInstallation(home, id), tree = captureTree(owned.root);
      installations.push({ installation_id: id, source_sha256: owned.source,
        payload: sealExistingHomePayload(home, binding(id, owned.source), JSON.stringify(tree)) });
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

function parseTree(contents: string): PrivateTree {
  let body: unknown;
  try { body = JSON.parse(contents); } catch { throw fail(); }
  if (!record(body) || body.schema_version !== 1 || typeof body.root_present !== "boolean" || !Array.isArray(body.directories) || !Array.isArray(body.files)) throw fail();
  const directories: PrivateDirectory[] = [], files: PrivateFile[] = [], names = new Set<string>();
  for (const entry of body.directories) {
    if (!record(entry) || !safeRelative(entry.relative_path, true) || !mode(entry.mode) || names.has(entry.relative_path)) throw fail();
    names.add(entry.relative_path); directories.push({ relative_path: entry.relative_path, mode: entry.mode });
  }
  if (body.root_present !== names.has("")) throw fail();
  for (const entry of directories) if (entry.relative_path && !names.has(parent(entry.relative_path))) throw fail();
  const directoryNames = new Set(names);
  for (const entry of body.files) {
    if (!record(entry) || !safeRelative(entry.relative_path) || !mode(entry.mode) || names.has(entry.relative_path)
      || !directoryNames.has(parent(entry.relative_path)) || typeof entry.contents_base64 !== "string"
      || Buffer.from(entry.contents_base64, "base64").toString("base64") !== entry.contents_base64) throw fail();
    names.add(entry.relative_path); files.push({ relative_path: entry.relative_path, mode: entry.mode, contents_base64: entry.contents_base64 });
  }
  if (!body.root_present && (directories.length || files.length)) throw fail();
  return { schema_version: 1, root_present: body.root_present, directories, files };
}

function inspectDestination(root: string, tree: PrivateTree): void {
  if (!plainDirectory(root, true)) return;
  const visit = (directory: string) => {
    plainDirectory(directory);
    for (const name of readdirSync(directory)) {
      const path = join(directory, name), entry = info(path);
      if (entry?.isDirectory() && !entry.isSymbolicLink()) visit(path); else regularFile(path, entry);
    }
  };
  visit(root);
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
    const root = installsRoot(home), ids = root ? readdirSync(root) : [];
    if (snapshot.installations.length !== ids.length) throw fail();
    const seen = new Set<string>(), plans: ConnectorPrivateStateRestorePlan[] = [];
    for (const entry of snapshot.installations) {
      if (!record(entry) || typeof entry.installation_id !== "string" || typeof entry.source_sha256 !== "string" || seen.has(entry.installation_id)) throw fail();
      seen.add(entry.installation_id);
      const owned = ownedInstallation(home, entry.installation_id);
      if (entry.source_sha256 !== owned.source) throw fail();
      const tree = parseTree(openExistingHomePayload(home, binding(entry.installation_id, owned.source), entry.payload));
      inspectDestination(owned.root, tree);
      if (relative(home, owned.root).startsWith("..")) throw fail();
      plans.push({ installation_id: entry.installation_id, root_path: owned.root, root_present: tree.root_present,
        directories: tree.directories, files: tree.files.map(file => ({ relative_path: file.relative_path, mode: file.mode, bytes: Buffer.from(file.contents_base64, "base64") })) });
    }
    return plans;
  });
}
