/**
 * SecretStore v2 — AES-256-GCM ciphertext only; never returns plaintext to Item rows.
 *
 * Backend selection (first match):
 *  1. MOLIS_WORK_ENCRYPTION_KEY env → env-key + AES-GCM file map
 *  2. darwin + keychain available → master key in Keychain, ciphertext in secrets.json
 *  3. otherwise → install key file (0600) + AES-GCM secrets.json
 *
 * Legacy v0.3 Base64 envelopes are migrated once on open; new puts never use reversible
 * Base64-only envelopes.
 */
import fs from "node:fs";
import path from "node:path";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { atomicWriteFileSync } from "./atomic-write.js";
import { readProductEnv, resolveFeedSecurityDirectory, resolveMolisWorkHome, runWithMolisWorkHome } from "./local-security-paths.js";

export interface SecretStore {
  put(authRef: string, plaintext: string): void;
  get(authRef: string): string | null;
  delete(authRef: string): void;
  /**
   * Cross-process create-if-absent on the shared secrets file.
   * Serialized by an independent SQLite lock DB (BEGIN IMMEDIATE) plus
   * atomic write. Timeout and lock errors fail closed. Not get+put.
   */
  createIfAbsent(authRef: string, plaintext: string): boolean;
  /**
   * Cross-process delete-if-present. Same SQLite lock as createIfAbsent:
   * load, delete, save in one critical section. Returns whether a value
   * was removed. Not get+delete.
   */
  deleteIfPresent(authRef: string): boolean;
  /** Describe active backend (no secrets). */
  backend(): SecretStoreBackendInfo;
  /** Re-encrypt any legacy v0.3 envelopes; idempotent. */
  migrateIfNeeded(): SecretStoreMigrationResult;
}

export type SecretStoreBackendKind =
  | "aes-gcm-file"
  | "keychain+aes-gcm"
  | "env-key+aes-gcm";

export interface SecretStoreBackendInfo {
  kind: SecretStoreBackendKind;
  /** Human-readable label for Settings / Doctor */
  label: string;
  /** True when master material lives outside secrets.json (keychain or env). */
  masterKeyExternal: boolean;
  /** Format version of on-disk map after last write. */
  formatVersion: number;
}

export interface SecretStoreMigrationResult {
  migrated: number;
  remainingLegacy: number;
  backend: SecretStoreBackendKind;
}

const FORMAT_VERSION = 2;
const ALG = "aes-256-gcm" as const;
const KEYCHAIN_SERVICE = "com.molis.work.feed.secretstore";
const KEYCHAIN_ACCOUNT = "install-master-key";
/** Historical key-derivation constant. Changing the string would invalidate existing ciphertext. */
const ENV_KEY_SALT = "goalboard-feed-secretstore-v1";

/** On-disk sealed entry (v2). */
interface SealedV2 {
  v: 2;
  alg: typeof ALG;
  iv: string;
  tag: string;
  ct: string;
}

/** Legacy v0.3 envelope after base64 decode. */
interface LegacyEnvelope {
  salt?: string;
  h?: string;
  v: string;
}

interface SecretsFileV2 {
  version: number;
  backend: SecretStoreBackendKind;
  entries: Record<string, string>;
}

function secretsPath(): string {
  return path.join(resolveFeedSecurityDirectory(), "secrets.json");
}

function secretsLockDbPath(): string {
  return path.join(resolveFeedSecurityDirectory(), "secrets.lock.sqlite");
}

/**
 * Cross-process mutex via an independent SQLite DB that never stores secrets.
 * BEGIN IMMEDIATE waits up to busy_timeout then fails closed. A crashed
 * holder is released by the OS/SQLite; no durable lock file is required.
 */
function withSecretsLock<T>(fn: () => T): T {
  const lockDbPath = secretsLockDbPath();
  fs.mkdirSync(path.dirname(lockDbPath), { recursive: true });
  let db: DatabaseSync | undefined;
  let begun = false;
  try {
    db = new DatabaseSync(lockDbPath);
    db.exec("PRAGMA busy_timeout = 5000;");
    db.exec("BEGIN IMMEDIATE;");
    begun = true;
    const result = fn();
    db.exec("COMMIT;");
    begun = false;
    return result;
  } catch (error) {
    if (begun && db) {
      try {
        db.exec("ROLLBACK;");
      } catch {
        /* already rolled back */
      }
    }
    throw error;
  } finally {
    if (db) {
      try {
        db.close();
      } catch {
        /* ignore */
      }
    }
  }
}

/** Test helper: hold the secrets mutex until `fn` returns. */
export function holdSecretsLockForTest<T>(fn: () => T): T {
  return withSecretsLock(fn);
}

function installKeyPath(): string {
  return path.join(resolveFeedSecurityDirectory(), "secrets.key");
}

function preferKeychain(): boolean {
  const backend = readProductEnv("SECRET_BACKEND");
  if (backend === "file") return false;
  if (backend === "keychain") return true;
  if (backend === "env") return false;
  // Tests / CI: avoid interactive keychain prompts unless forced
  if (process.env.NODE_ENV === "test" || process.env.CI === "true") return false;
  return process.platform === "darwin";
}

function parseEnvKey(raw: string): Buffer | null {
  const t = raw.trim();
  if (!t) return null;
  // 64 hex chars → 32 bytes
  if (/^[0-9a-fA-F]{64}$/.test(t)) {
    return Buffer.from(t, "hex");
  }
  try {
    const b = Buffer.from(t, "base64");
    if (b.length === 32) return b;
  } catch {
    /* fall through */
  }
  // Derive stable 32-byte key from arbitrary passphrase
  return scryptSync(t, ENV_KEY_SALT, 32);
}

function readKeychainService(service: string): string | null {
  if (process.platform !== "darwin") return null;
  try {
    const out = execFileSync(
      "security",
      [
        "find-generic-password",
        "-a",
        KEYCHAIN_ACCOUNT,
        "-s",
        service,
        "-w",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 3000 },
    );
    const key = out.trim();
    return key || null;
  } catch {
    return null;
  }
}

function readKeychain(): string | null {
  return readKeychainService(KEYCHAIN_SERVICE);
}

function writeKeychain(keyB64: string): boolean {
  if (process.platform !== "darwin") return false;
  try {
    // Add-only: if an item already exists but cannot be read in this process,
    // fail and use the recovery path. Replacing it would make every existing
    // ciphertext permanently unreadable.
    execFileSync(
      "security",
      [
        "add-generic-password",
        "-a",
        KEYCHAIN_ACCOUNT,
        "-s",
        KEYCHAIN_SERVICE,
        "-w",
        keyB64,
        "-T",
        "",
      ],
      { encoding: "utf8", stdio: "ignore", timeout: 3000 },
    );
    return true;
  } catch {
    return false;
  }
}

function readInstallKeyFile(p: string): Buffer | null {
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, "utf8").trim();
  if (!raw) return null;
  const fromB64 = Buffer.from(raw, "base64");
  if (fromB64.length === 32) return fromB64;
  const fromHex = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : null;
  if (fromHex?.length === 32) return fromHex;
  return null;
}

function loadOrCreateInstallKeyFile(): Buffer {
  const p = installKeyPath();
  if (fs.existsSync(p)) {
    const existing = readInstallKeyFile(p);
    if (existing) return existing;
    throw new Error("install key file exists but is not a valid 32-byte key");
  }
  const key = randomBytes(32);
  atomicWriteFileSync(p, key.toString("base64"), { mode: 0o600 });
  return key;
}

interface ResolvedMaster {
  key: Buffer;
  kind: SecretStoreBackendKind;
  label: string;
  masterKeyExternal: boolean;
}

function resolveMasterKey(): ResolvedMaster {
  const persisted = loadFile();
  const hasPersistedEntries = Object.keys(persisted.entries).length > 0;
  const envRaw = readProductEnv("ENCRYPTION_KEY");
  if (persisted.backend === "env-key+aes-gcm" && hasPersistedEntries && !envRaw) {
    throw new Error("Molis Work encryption key is unavailable; refusing to rotate existing secrets");
  }
  if (envRaw && (!hasPersistedEntries || persisted.backend === "env-key+aes-gcm")) {
    const key = parseEnvKey(envRaw);
    if (key) {
      return {
        key,
        kind: "env-key+aes-gcm",
        label: "AES-256-GCM (MOLIS_WORK_ENCRYPTION_KEY)",
        masterKeyExternal: true,
      };
    }
  }

  if (hasPersistedEntries && persisted.backend === "aes-gcm-file") {
    return {
      key: loadOrCreateInstallKeyFile(),
      kind: "aes-gcm-file",
      label: "AES-256-GCM (local install key file)",
      masterKeyExternal: false,
    };
  }

  if (preferKeychain() || (hasPersistedEntries && persisted.backend === "keychain+aes-gcm")) {
    let b64 = readKeychain();
    if (!b64) {
      if (hasPersistedEntries && persisted.backend === "keychain+aes-gcm") {
        throw new Error("macOS Keychain master key is unavailable; refusing to rotate existing secrets");
      }
      const generated = randomBytes(32).toString("base64");
      if (writeKeychain(generated)) {
        b64 = generated;
      }
    }
    if (b64) {
      const key = Buffer.from(b64, "base64");
      if (key.length === 32) {
        return {
          key,
          kind: "keychain+aes-gcm",
          label: "macOS Keychain + AES-256-GCM",
          masterKeyExternal: true,
        };
      }
    }
  }

  if (hasPersistedEntries) {
    throw new Error(`SecretStore backend ${persisted.backend} is unavailable; refusing to rotate existing secrets`);
  }

  const key = loadOrCreateInstallKeyFile();
  return {
    key,
    kind: "aes-gcm-file",
    label: "AES-256-GCM (local install key file)",
    masterKeyExternal: false,
  };
}

function sealV2(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, key, iv);
  const ct = Buffer.concat([
    cipher.update(Buffer.from(plaintext, "utf8")),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const sealed: SealedV2 = {
    v: 2,
    alg: ALG,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ct: ct.toString("base64"),
  };
  return Buffer.from(JSON.stringify(sealed)).toString("base64");
}

function openV2(sealed: string, key: Buffer): string | null {
  try {
    const raw = JSON.parse(Buffer.from(sealed, "base64").toString("utf8")) as SealedV2;
    if (raw.v !== 2 || raw.alg !== ALG || !raw.iv || !raw.tag || !raw.ct) {
      return null;
    }
    const iv = Buffer.from(raw.iv, "base64");
    const tag = Buffer.from(raw.tag, "base64");
    const ct = Buffer.from(raw.ct, "base64");
    const decipher = createDecipheriv(ALG, key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString("utf8");
  } catch {
    return null;
  }
}

/** Detect legacy v0.3 Base64 envelope (has base64 plaintext field `v`, no alg). */
export function isLegacyEnvelope(sealed: string): boolean {
  try {
    const raw = JSON.parse(Buffer.from(sealed, "base64").toString("utf8")) as Record<
      string,
      unknown
    >;
    if (raw.v === 2 || raw.alg === ALG) return false;
    return typeof raw.v === "string" && !("ct" in raw);
  } catch {
    return false;
  }
}

function openLegacy(sealed: string): string | null {
  try {
    const raw = JSON.parse(Buffer.from(sealed, "base64").toString("utf8")) as LegacyEnvelope;
    if (typeof raw.v !== "string") return null;
    return Buffer.from(raw.v, "base64").toString("utf8");
  } catch {
    return null;
  }
}

/** Build a v0.3-style envelope for migration tests only. */
export function sealLegacyForTest(plaintext: string): string {
  const salt = randomBytes(8).toString("hex");
  const h = createHash("sha256").update(salt + plaintext).digest("hex");
  return Buffer.from(
    JSON.stringify({ salt, h, v: Buffer.from(plaintext).toString("base64") }),
  ).toString("base64");
}

function loadFile(): SecretsFileV2 {
  const p = secretsPath();
  if (!fs.existsSync(p)) {
    return { version: FORMAT_VERSION, backend: "aes-gcm-file", entries: {} };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    throw new Error("secrets file is corrupt");
  }
  if (!isPlainObject(parsed)) {
    throw new Error("secrets file has invalid structure");
  }
  if ("entries" in parsed) {
    if (!isStringRecord(parsed.entries)) {
      throw new Error("secrets file has invalid structure");
    }
    const backend = parsed.backend;
    return {
      version: typeof parsed.version === "number" ? parsed.version : FORMAT_VERSION,
      backend: isSecretStoreBackend(backend) ? backend : "aes-gcm-file",
      entries: { ...parsed.entries },
    };
  }
  if (!isStringRecord(parsed)) {
    throw new Error("secrets file has invalid structure");
  }
  return { version: 1, backend: "aes-gcm-file", entries: { ...parsed } };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isPlainObject(value)) return false;
  return Object.values(value).every((entry) => typeof entry === "string");
}

function isSecretStoreBackend(value: unknown): value is SecretStoreBackendKind {
  return value === "aes-gcm-file" || value === "keychain+aes-gcm" || value === "env-key+aes-gcm";
}

function saveFile(file: SecretsFileV2): void {
  const p = secretsPath();
  const payload: SecretsFileV2 = {
    version: FORMAT_VERSION,
    backend: file.backend,
    entries: file.entries,
  };
  atomicWriteFileSync(p, JSON.stringify(payload, null, 2), { mode: 0o600 });
}

function openAny(sealed: string, key: Buffer): string | null {
  if (isLegacyEnvelope(sealed)) return openLegacy(sealed);
  return openV2(sealed, key);
}

/** Assert ciphertext is not a plain reversible Base64-only envelope. */
export function assertNotReversibleBase64Only(sealed: string): void {
  if (isLegacyEnvelope(sealed)) {
    throw new Error("secret stored as reversible Base64-only envelope");
  }
  const opened = openLegacy(sealed);
  // openLegacy returns for legacy only; for v2 it should be null
  if (opened !== null && isLegacyEnvelope(sealed)) {
    throw new Error("secret stored as reversible Base64-only envelope");
  }
  // v2 must not embed raw base64 plaintext as sole payload
  try {
    const raw = JSON.parse(Buffer.from(sealed, "base64").toString("utf8")) as SealedV2;
    if (raw.v !== 2 || raw.alg !== ALG) {
      throw new Error("secret not AES-GCM sealed");
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("secret")) throw e;
    throw new Error("secret not AES-GCM sealed");
  }
}

/**
 * Constant-time-ish compare of two equal-length buffers for tests.
 * Exported only for migration acceptance checks.
 */
export function safeEqualString(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** Per data-dir store instances so put/get share one master resolution. */
const storeCache = new Map<string, SecretStore>();

function cacheKey(): string {
  const dataDir = resolveFeedSecurityDirectory();
  const env = readProductEnv("ENCRYPTION_KEY") ?? "";
  const backend = readProductEnv("SECRET_BACKEND") ?? "";
  return `${dataDir}::${backend}::${env}`;
}

function buildStore(master: ResolvedMaster): SecretStore {
  const migrateIfNeeded = (): SecretStoreMigrationResult =>
    withSecretsLock(() => {
      const file = loadFile();
      let migrated = 0;
      let remainingLegacy = 0;
      const wasLegacyFormat = file.version < FORMAT_VERSION;
      for (const [ref, sealed] of Object.entries(file.entries)) {
        if (!isLegacyEnvelope(sealed)) continue;
        const pt = openLegacy(sealed);
        if (pt == null) {
          remainingLegacy += 1;
          continue;
        }
        file.entries[ref] = sealV2(pt, master.key);
        migrated += 1;
      }
      file.backend = master.kind;
      file.version = FORMAT_VERSION;
      // Rewrite only when entries were re-sealed or flat v0.3 map needs v2 envelope
      if (migrated > 0 || wasLegacyFormat) {
        saveFile(file);
      }
      return {
        migrated,
        remainingLegacy,
        backend: master.kind,
      };
    });

  // One-shot migrate on construction so get/put always see v2 after open
  migrateIfNeeded();

  return {
    put(authRef, plaintext) {
      withSecretsLock(() => {
        const file = loadFile();
        const sealed = sealV2(plaintext, master.key);
        assertNotReversibleBase64Only(sealed);
        file.entries[authRef] = sealed;
        file.backend = master.kind;
        file.version = FORMAT_VERSION;
        saveFile(file);
      });
    },
    get(authRef) {
      const file = loadFile();
      const sealed = file.entries[authRef];
      if (!sealed) return null;
      const pt = openAny(sealed, master.key);
      // Lazy migrate single entry if still legacy
      if (pt != null && isLegacyEnvelope(sealed)) {
        withSecretsLock(() => {
          const latest = loadFile();
          const current = latest.entries[authRef];
          if (!current || !isLegacyEnvelope(current)) return;
          const opened = openLegacy(current);
          if (opened == null) return;
          latest.entries[authRef] = sealV2(opened, master.key);
          latest.backend = master.kind;
          saveFile(latest);
        });
      }
      return pt;
    },
    delete(authRef) {
      withSecretsLock(() => {
        const file = loadFile();
        delete file.entries[authRef];
        file.backend = master.kind;
        saveFile(file);
      });
    },
    createIfAbsent(authRef, plaintext) {
      return withSecretsLock(() => {
        const file = loadFile();
        if (Object.hasOwn(file.entries, authRef)) return false;
        const sealed = sealV2(plaintext, master.key);
        assertNotReversibleBase64Only(sealed);
        file.entries[authRef] = sealed;
        file.backend = master.kind;
        file.version = FORMAT_VERSION;
        saveFile(file);
        return true;
      });
    },
    deleteIfPresent(authRef) {
      return withSecretsLock(() => {
        const file = loadFile();
        if (!Object.hasOwn(file.entries, authRef)) return false;
        delete file.entries[authRef];
        file.backend = master.kind;
        saveFile(file);
        return true;
      });
    },
    backend() {
      return {
        kind: master.kind,
        label: master.label,
        masterKeyExternal: master.masterKeyExternal,
        formatVersion: FORMAT_VERSION,
      };
    },
    migrateIfNeeded,
  };
}

export function createFileSecretStore(): SecretStore {
  const key = cacheKey();
  const hit = storeCache.get(key);
  if (hit) return hit;
  const master = withSecretsLock(() => resolveMasterKey());
  const home = resolveMolisWorkHome();
  const implementation = buildStore(master);
  // Cached instances may outlive the request that created them.
  const store: SecretStore = {
    put: (ref, value) => runWithMolisWorkHome(home, () => implementation.put(ref, value)),
    get: (ref) => runWithMolisWorkHome(home, () => implementation.get(ref)),
    delete: (ref) => runWithMolisWorkHome(home, () => implementation.delete(ref)),
    createIfAbsent: (ref, value) => runWithMolisWorkHome(home, () => implementation.createIfAbsent(ref, value)),
    deleteIfPresent: (ref) => runWithMolisWorkHome(home, () => implementation.deleteIfPresent(ref)),
    backend: () => implementation.backend(),
    migrateIfNeeded: () => runWithMolisWorkHome(home, () => implementation.migrateIfNeeded()),
  };
  storeCache.set(key, store);
  return store;
}

/** Test helper: drop cached store instances (e.g. after changing env). */
export function resetSecretStoreCache(): void {
  storeCache.clear();
}

/** Peek on-disk sealed blob for a ref (tests / diagnostics; not plaintext). */
export function peekSealedEntry(authRef: string): string | null {
  const file = loadFile();
  return file.entries[authRef] ?? null;
}

export function readSecretsFileMeta(): {
  version: number;
  backend: string;
  entryCount: number;
  path: string;
} {
  const file = loadFile();
  return {
    version: file.version,
    backend: file.backend,
    entryCount: Object.keys(file.entries).length,
    path: secretsPath(),
  };
}
