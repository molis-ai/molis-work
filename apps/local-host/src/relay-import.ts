import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createFeedEvidenceContentStore } from "@molis-ai/molis-work-module-feed";
import { createFileSecretStore, openRelaySecurity, readRelayContent } from "@molis-ai/molis-work-storage";
import { gmailInstallationSecretRefs } from "@molis-ai/molis-work-integration-gmail";
import { prepareRelayFeedImport, type FeedApplication, type RelayImportAvailability, type RelayImportResult } from "@molis-ai/molis-work-plugin-feed";
import { RelayLegacyReader } from "./adapters/relay-reader.js";

const MIGRATABLE_SECRET = /^connector:(?:github|gmail):/u;

export function defaultRelayDatabasePath(): string {
  if (process.env.RELAY_DB_PATH?.trim()) return path.resolve(process.env.RELAY_DB_PATH.trim());
  const dataDir = process.env.RELAY_DATA_DIR?.trim()
    ? path.resolve(process.env.RELAY_DATA_DIR.trim())
    : process.platform === "darwin"
      ? path.join(os.homedir(), "Library", "Application Support", "Relay")
      : process.platform === "win32"
        ? path.join(process.env.APPDATA || os.homedir(), "Relay")
        : path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), "relay");
  return path.join(dataDir, "relay.sqlite");
}

export function detectRelayImport(databasePath = defaultRelayDatabasePath()): RelayImportAvailability {
  const resolved = path.resolve(databasePath);
  if (!fs.existsSync(resolved)) {
    return {
      path: resolved,
      available: false,
      source_count: 0,
      item_count: 0,
      material_count: 0,
      error: "未找到 Relay 数据库",
    };
  }
  let reader: RelayLegacyReader | null = null;
  try {
    reader = new RelayLegacyReader(resolved);
    const counts = reader.inspect();
    return {
      path: resolved,
      available: true,
      ...counts,
      error: null,
    };
  } catch (error) {
    return {
      path: resolved,
      available: false,
      source_count: 0,
      item_count: 0,
      material_count: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    reader?.close();
  }
}

export function importRelayData(target: FeedApplication, boardId: string,
  databasePath = defaultRelayDatabasePath(), options: { migrateOwnership?: boolean } = {},
): RelayImportResult {
  const availability = detectRelayImport(databasePath);
  if (!availability.available) throw new Error(availability.error || "Relay 数据不可用");
  const reader = new RelayLegacyReader(availability.path);
  const migrateOwnership = options.migrateOwnership !== false;
  try {
    const data = reader.read();
    const commit = prepareRelayFeedImport(target, boardId, data);
    const relaySecurity = migrateOwnership
      ? openRelaySecurity(path.dirname(availability.path))
      : { entries: new Map<string, string>(), contentKey: null, readable: false };
    const molisWorkSecrets = migrateOwnership && relaySecurity.readable
      ? createFileSecretStore()
      : null;
    const molisWorkContent = relaySecurity.contentKey && molisWorkSecrets
      ? createFeedEvidenceContentStore({ secretStore: molisWorkSecrets })
      : null;
    let credentialsMigrated = 0;
    if (migrateOwnership && relaySecurity.readable) {
      for (const [authRef, plaintext] of relaySecurity.entries) {
        if (!MIGRATABLE_SECRET.test(authRef)) continue;
        molisWorkSecrets!.put(authRef, plaintext);
        credentialsMigrated += 1;
      }
    }

    return commit({
      path: availability.path,
      migrateOwnership,
      credentialRefs: new Set(relaySecurity.entries.keys()),
      credentials: { status: !migrateOwnership ? "not_requested" : relaySecurity.readable ? "migrated" : "unavailable", migrated: credentialsMigrated },
      gmailInstallationSecretRefs,
      migrateContent: (ref) => migrateRelayContent(ref, path.dirname(availability.path), relaySecurity.contentKey, molisWorkContent),
      sourceFingerprint: () => sourceFingerprint(availability.path),
    });
  } finally {
    reader.close();
  }
}

function migrateRelayContent(
  contentRef: string | null,
  dataDirectory: string,
  key: Buffer | null,
  target: ReturnType<typeof createFeedEvidenceContentStore> | null,
): { contentRef: string | null; available: boolean } {
  if (!target) return { contentRef: null, available: false };
  try {
    const plaintext = readRelayContent(contentRef, dataDirectory, key);
    if (plaintext === null) return { contentRef: null, available: false };
    const written = target.write(plaintext);
    return { contentRef: written.contentRef, available: target.has(written.contentRef) };
  } catch {
    return { contentRef: null, available: false };
  }
}

function sourceFingerprint(databasePath: string): string {
  const stat = fs.statSync(databasePath);
  return `sha256:${createHash("sha256")
    .update(`${path.resolve(databasePath)}\u0000${stat.size}\u0000${stat.mtimeMs}`)
    .digest("hex")}`;
}
