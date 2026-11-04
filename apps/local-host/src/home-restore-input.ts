import { isAbsolute } from "node:path";
import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SqliteSnapshotInfo } from "@molis-ai/molis-work-storage";
import type { HomeSnapshotDirectory, HomeSnapshotFile, HomeSnapshotManifest, HomeSnapshotStoreManifest, HomeSnapshotSourceEntry } from "./home-snapshot-contract.js";
import type { SnapshotExclusion, SnapshotKeyDependency } from "./home-store-snapshot.js";
import { PRODUCT_VERSION } from "./product-version.js";

export const homeRestoreErrors = defineErrorCodes("host.home_restore", {
  invalid: "invalid", changed: "conflict", key_unavailable: "unavailable", dependency_unavailable: "unavailable",
  recovery_required: "unavailable", published_unconfirmed: "internal", rolled_back: "internal",
});
export const invalidRestore = () => homeRestoreErrors.invalid("快照或恢复记录的现行格式、路径、归属或完整性无效；未授予任何文件写入权限");

export function restoreRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidRestore();
  return value as Record<string, unknown>;
}

export function restoreFields(value: Record<string, unknown>, required: string[], optional: string[] = []): void {
  if (required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) throw invalidRestore();
}

export function restoreString(value: unknown): string {
  if (typeof value !== "string" || !value.length || value.includes("\0")) throw invalidRestore();
  return value;
}

export function restoreRelative(value: unknown): string {
  const text = restoreString(value);
  if (isAbsolute(text) || text.includes("\\") || text.split("/").some(part => !part || part === "." || part === "..")) throw invalidRestore();
  return text;
}

export function restoreMode(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 0o777) throw invalidRestore();
  return value;
}

export function restoreInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw invalidRestore();
  return value;
}

export function restoreHash(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) throw invalidRestore();
  return value;
}

function array<T>(value: unknown, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) throw invalidRestore();
  return value.map(parse);
}

function directory(value: unknown): HomeSnapshotDirectory {
  const item = restoreRecord(value); restoreFields(item, ["kind", "path", "mode"]);
  if (item.kind !== "directory") throw invalidRestore();
  return { kind: "directory", path: restoreRelative(item.path), mode: restoreMode(item.mode) };
}

export function parseRestoreSqliteInfo(value: unknown): SqliteSnapshotInfo {
  const item = restoreRecord(value); restoreFields(item, ["user_version", "owner_versions", "schema_sha256", "integrity_check", "foreign_key_check"]);
  if (item.integrity_check !== "ok" || item.foreign_key_check !== "ok") throw invalidRestore();
  const owners: Record<string, string | number> = {};
  for (const [key, entry] of Object.entries(restoreRecord(item.owner_versions))) {
    if (typeof entry !== "string" && (typeof entry !== "number" || !Number.isSafeInteger(entry))) throw invalidRestore();
    Object.defineProperty(owners, key, { value: entry, enumerable: true });
  }
  return { user_version: restoreInteger(item.user_version), owner_versions: owners, schema_sha256: restoreHash(item.schema_sha256),
    integrity_check: "ok", foreign_key_check: "ok" };
}

function entry(value: unknown): HomeSnapshotDirectory | HomeSnapshotFile {
  const item = restoreRecord(value);
  if (item.kind === "directory") return directory(item);
  restoreFields(item, ["kind", "path", "mode", "payload_path", "size", "sha256"], ["sqlite", "binding"]);
  if (item.kind !== "file" && item.kind !== "sealed" || item.kind === "sealed" && (!Object.hasOwn(item, "binding") || Object.hasOwn(item, "sqlite"))
    || item.kind === "file" && Object.hasOwn(item, "binding")) throw invalidRestore();
  return { kind: item.kind, path: restoreRelative(item.path), mode: restoreMode(item.mode), payload_path: restoreRelative(item.payload_path),
    size: restoreInteger(item.size), sha256: restoreHash(item.sha256), ...(Object.hasOwn(item, "sqlite") ? { sqlite: parseRestoreSqliteInfo(item.sqlite) } : {}),
    ...(item.kind === "sealed" ? { binding: restoreString(item.binding) } : {}) };
}

function exclusion(value: unknown): SnapshotExclusion {
  const item = restoreRecord(value); restoreFields(item, ["path", "reason"]);
  return { path: restoreRelative(item.path), reason: restoreString(item.reason) };
}

export function parseRestoreDependency(value: unknown): SnapshotKeyDependency {
  const item = restoreRecord(value); restoreFields(item, ["kind", "location", "sha256"]);
  if (item.kind !== "file-key" && item.kind !== "master-key") throw invalidRestore();
  return { kind: item.kind, location: restoreString(item.location), sha256: restoreHash(item.sha256) };
}

function store(value: unknown): HomeSnapshotStoreManifest {
  const item = restoreRecord(value); restoreFields(item, ["path", "owner", "state", "entries", "dependencies", "exclusions"], ["owner_payload"]);
  if (item.state !== "captured" && item.state !== "absent" && item.state !== "omitted") throw invalidRestore();
  let ownerPayload: HomeSnapshotStoreManifest["owner_payload"];
  if (Object.hasOwn(item, "owner_payload")) {
    const payload = restoreRecord(item.owner_payload); restoreFields(payload, ["kind", "payload_path", "size", "sha256"]);
    if (payload.kind !== "connector-private-state") throw invalidRestore();
    ownerPayload = { kind: payload.kind, payload_path: restoreRelative(payload.payload_path), size: restoreInteger(payload.size), sha256: restoreHash(payload.sha256) };
  }
  return { path: restoreRelative(item.path), owner: restoreString(item.owner), state: item.state, entries: array(item.entries, entry),
    dependencies: array(item.dependencies, parseRestoreDependency), exclusions: array(item.exclusions, exclusion), ...(ownerPayload ? { owner_payload: ownerPayload } : {}) };
}

/** Parse a closed current shape. Registry, physical files and cryptographic owners are checked separately. */
function sourceEntry(value: unknown): HomeSnapshotSourceEntry {
  const item = restoreRecord(value); restoreFields(item, ["path", "kind", "links"], ["children"]);
  const path = item.path === "" ? "" : restoreRelative(item.path);
  if (item.kind !== "absent" && item.kind !== "file" && item.kind !== "directory" && item.kind !== "link" && item.kind !== "special") throw invalidRestore();
  const links = restoreInteger(item.links);
  if ((item.kind === "absent") !== (links === 0) || (item.kind === "directory") !== Object.hasOwn(item, "children")) throw invalidRestore();
  const children = item.kind === "directory" ? array(item.children, value => {
    const name = restoreRelative(value); if (name.includes("/")) throw invalidRestore(); return name;
  }) : undefined;
  if (children && (new Set(children).size !== children.length || children.join("\0") !== [...children].sort().join("\0"))) throw invalidRestore();
  return { path, kind: item.kind, links, ...(children ? { children } : {}) };
}

export function parseHomeSnapshotManifest(value: unknown, home: string): HomeSnapshotManifest {
  const item = restoreRecord(value);
  restoreFields(item, ["schema_version", "product_version", "created_at", "home_directory", "home_mode", "container_directories", "stores", "exclusions", "external_dependencies"], ["source_inventory"]);
  if (item.schema_version !== 1 || item.product_version !== PRODUCT_VERSION || item.home_directory !== home) throw invalidRestore();
  const created = restoreString(item.created_at);
  if (!Number.isFinite(Date.parse(created))) throw invalidRestore();
  return { schema_version: 1, product_version: PRODUCT_VERSION, created_at: created, home_directory: home, home_mode: restoreMode(item.home_mode),
    container_directories: array(item.container_directories, directory), stores: array(item.stores, store), exclusions: array(item.exclusions, exclusion),
    external_dependencies: array(item.external_dependencies, restoreString),
    ...(Object.hasOwn(item, "source_inventory") ? { source_inventory: array(item.source_inventory, sourceEntry) } : {}) };
}
