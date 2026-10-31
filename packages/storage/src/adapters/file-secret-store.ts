/**
 * SecretStore v2 — AES-256-GCM ciphertext only; never returns plaintext to Item rows.
 *
 * Backend selection (first match):
 *  1. MOLIS_WORK_ENCRYPTION_KEY env → env-key + AES-GCM file map
 *  2. darwin + keychain available → master key in Keychain, ciphertext in secrets.json
 *  3. otherwise → install key file (0600) + AES-GCM secrets.json
 *
 * Only the current AES-GCM format (file version 1) is read; an older file is refused rather than upgraded
 * (repository-anti-corruption §9.5 #4: the real Home held no v0.3 envelope on 2026-10-04).
 */
import fs from "node:fs";
import path from "node:path";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { execFileSync } from "node:child_process";
import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import { DatabaseSync } from "node:sqlite";
import { atomicWriteFileSync } from "./atomic-write.js";
import { readProductEnv, resolveHomeSecurityDirectory, resolveMolisWorkHome, runWithMolisWorkHome } from "./local-security-paths.js";

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

const FORMAT_VERSION = 1;
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

interface SecretsFileV2 {
  version: number;
  backend: SecretStoreBackendKind;
  entries: Record<string, string>;
}

function secretsPath(): string {
  return path.join(resolveHomeSecurityDirectory(), "secrets.json");
}

function secretsLockDbPath(): string {
  return path.join(resolveHomeSecurityDirectory(), "secrets.lock.sqlite");
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
  return path.join(resolveHomeSecurityDirectory(), "secrets.key");
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

function keychainItemExists(): boolean {
  if (process.platform !== "darwin") return false;
  try {
    // 元数据查询不带 -w，不读密码数据，不会触发授权弹窗。
    execFileSync(
      "security",
      ["find-generic-password", "-a", KEYCHAIN_ACCOUNT, "-s", KEYCHAIN_SERVICE],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 3000 },
    );
    return true;
  } catch {
    return false;
  }
}

function writeKeychain(keyB64: string): boolean {
  if (process.platform !== "darwin") return false;
  try {
    // Add-only: if an item already exists but cannot be read in this process,
    // fail and use the recovery path. Replacing it would make every existing
    // ciphertext permanently unreadable.
    //
    // -T /usr/bin/security：信任 security CLI 本身，后续 `security
    // find-generic-password` 读取才不会每次弹授权框。空信任列表（-T ""）会让
    // 每次读取都弹窗，而读取的 3 秒超时让人来不及点「始终允许」，授权永远
    // 记不下来。security CLI 与 0600 的 install key 文件同属本地用户信任域。
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
        "/usr/bin/security",
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

export class KeychainUnavailableError extends Error {
  constructor() {
    super("macOS Keychain master key is unavailable; refusing to rotate existing secrets. Automatic retries are stopped for this process. Even an empty vault may have sealed Home data that needs its original Keychain item (com.molis.work.feed.secretstore / install-master-key). Restore access to that original item, then restart Molis Work or the affected MCP connection. An environment key cannot replace this recorded backend. See docs/system/HOME-DATA.md#original-key-recovery.");
    this.name = "KeychainUnavailableError";
  }
}

function masterInfo(kind: SecretStoreBackendKind, key: Buffer): ResolvedMaster {
  const label = kind === "aes-gcm-file" ? "AES-256-GCM (local install key file)"
    : kind === "env-key+aes-gcm" ? "AES-256-GCM (MOLIS_WORK_ENCRYPTION_KEY)" : "macOS Keychain + AES-256-GCM";
  return { key, kind, label, masterKeyExternal: kind !== "aes-gcm-file" };
}

/** Reads an already selected backend. An empty map may have other, separately sealed owner data depending on this key. */
function readExistingMasterKey(backend: SecretStoreBackendKind): ResolvedMaster {
  if (backend === "aes-gcm-file") {
    const key = readInstallKeyFile(installKeyPath());
    if (!key) throw new Error("install key file is unavailable or invalid; refusing to rotate existing secrets. Even an empty vault may have sealed Home data that needs its original key. Restore this Home's original feed/secrets.key, then restart Molis Work or the affected MCP connection. A new environment key cannot replace this recorded file backend. See docs/system/HOME-DATA.md#original-key-recovery.");
    return masterInfo(backend, key);
  }
  if (backend === "env-key+aes-gcm") {
    const raw = readProductEnv("ENCRYPTION_KEY"), key = raw ? parseEnvKey(raw) : null;
    if (!key) throw new Error("Molis Work encryption key is unavailable; refusing to rotate existing secrets. Even an empty vault may have sealed Home data that needs its original key. Restore the original MOLIS_WORK_ENCRYPTION_KEY, then restart Molis Work or the affected MCP connection. A new value cannot recover existing ciphertext. See docs/system/HOME-DATA.md#original-key-recovery.");
    return masterInfo(backend, key);
  }
  const raw = readKeychain(), key = raw ? Buffer.from(raw, "base64") : null;
  if (!key || key.length !== 32) throw new KeychainUnavailableError();
  return masterInfo(backend, key);
}

function resolveMasterKey(): ResolvedMaster {
  const persisted = loadFile();
  if (fs.existsSync(secretsPath())) return readExistingMasterKey(persisted.backend);
  const envRaw = readProductEnv("ENCRYPTION_KEY");
  if (envRaw) {
    const key = parseEnvKey(envRaw);
    if (key) return masterInfo("env-key+aes-gcm", key);
  }

  if (preferKeychain()) {
    let b64 = readKeychain();
    if (!b64) {
      const generated = randomBytes(32).toString("base64");
      // 这个 Home 还没有 keychain 后端密文，但钥匙串条目是全机共用的：别的 Home
      // 的密文可能正依赖它。条目存在却读不出（拒绝授权、弹窗超时、历史版本以
      // -T "" 创建）时一律不删、不覆盖，这个 Home 改用自己的本地密钥文件。
      if (!keychainItemExists() && writeKeychain(generated)) {
        b64 = generated;
      }
    }
    if (b64) {
      const key = Buffer.from(b64, "base64");
      if (key.length === 32) return masterInfo("keychain+aes-gcm", key);
    }
  }
  return masterInfo("aes-gcm-file", loadOrCreateInstallKeyFile());
}

function sealV2(plaintext: string, key: Buffer, aad?: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, key, iv);
  if (aad) cipher.setAAD(aad);
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

function openV2(sealed: string, key: Buffer, aad?: Buffer): string | null {
  try {
    const raw = JSON.parse(Buffer.from(sealed, "base64").toString("utf8")) as SealedV2;
    if (raw.v !== 2 || raw.alg !== ALG || typeof raw.iv !== "string" || typeof raw.tag !== "string" || typeof raw.ct !== "string") {
      return null;
    }
    const iv = Buffer.from(raw.iv, "base64");
    const tag = Buffer.from(raw.tag, "base64");
    const ct = Buffer.from(raw.ct, "base64");
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = createDecipheriv(ALG, key, iv);
    if (aad) decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString("utf8");
  } catch {
    return null;
  }
}

function loadFile(): SecretsFileV2 {
  const p = secretsPath();
  if (!fs.existsSync(p)) {
    return { version: FORMAT_VERSION, backend: "aes-gcm-file", entries: {} };
  }
  return parseSecretsFile(fs.readFileSync(p, "utf8"));
}

function parseSecretsFile(contents: string): SecretsFileV2 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error("secrets file is corrupt");
  }
  if (!isPlainObject(parsed)) {
    throw new Error("secrets file has invalid structure");
  }
  if (!("entries" in parsed) || !isStringRecord(parsed.entries)) {
    throw new Error("secrets file has invalid structure");
  }
  if (parsed.version !== FORMAT_VERSION) {
    throw new Error(`secrets file format ${String(parsed.version)} is not supported; only ${FORMAT_VERSION} is read`);
  }
  const backend = parsed.backend;
  if (!isSecretStoreBackend(backend)) throw new Error("secrets file backend is not supported");
  return {
    version: FORMAT_VERSION,
    backend,
    entries: { ...parsed.entries },
  };
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

const snapshotErrors = defineErrorCodes("storage.secrets_snapshot", {
  invalid: "invalid", key_unavailable: "unavailable", integrity_failed: "invalid",
});

export interface SealedSecretsSnapshotInspection {
  version: 1;
  backend: SecretStoreBackendKind;
  entries: number;
  key_reference: { location: string; sha256: string } | null;
}

function snapshotHome(homeDirectory: string): string {
  if (typeof homeDirectory !== "string" || !path.isAbsolute(homeDirectory)) throw snapshotErrors.invalid("密文预检需要明确的绝对 Home 路径");
  try {
    runWithMolisWorkHome(homeDirectory, () => {
      const directory = fs.lstatSync(resolveHomeSecurityDirectory(), { throwIfNoEntry: false });
      if (directory && (!directory.isDirectory() || directory.isSymbolicLink())) throw snapshotErrors.key_unavailable("凭据目录不能是链接");
      const key = fs.lstatSync(installKeyPath(), { throwIfNoEntry: false });
      if (key && (!key.isFile() || key.nlink !== 1)) throw snapshotErrors.key_unavailable("原密钥必须是只有一个链接的普通文件");
    });
  } catch { throw snapshotErrors.key_unavailable("原 Home 的凭据目录或密钥文件不可用"); }
  return homeDirectory;
}

/** Reads only existing master material selected by the supplied vault, not the possibly damaged live vault. */
function openSnapshot(homeDirectory: string, contents: string) {
  snapshotHome(homeDirectory);
  let file: SecretsFileV2;
  try { file = parseSecretsFile(contents); }
  catch { throw snapshotErrors.invalid("凭据快照不是现行的 v2 密文格式或后端"); }
  return openSnapshotFile(homeDirectory, file);
}

function openSnapshotFile(homeDirectory: string, file: SecretsFileV2) {
  const opened = new Map<string, string>();
  if (Object.keys(file.entries).length === 0) return { file, opened, master: null };
  let master: ResolvedMaster;
  try { master = runWithMolisWorkHome(homeDirectory, () => readExistingMasterKey(file.backend)); }
  catch { throw snapshotErrors.key_unavailable("原 Home 的凭据主密钥不可用；不会创建替代密钥"); }
  for (const [ref, sealed] of Object.entries(file.entries)) {
    const value = openV2(sealed, master.key);
    if (value === null) throw snapshotErrors.integrity_failed("原密钥与凭据快照不匹配，或密文已损坏");
    opened.set(ref, value);
  }
  return { file, opened, master };
}

/** No store initialization, cache, lock database, write, key generation or returned plaintext. */
export function inspectSealedSecretsSnapshot(homeDirectory: string, contents: string): SealedSecretsSnapshotInspection {
  const { file, opened, master } = openSnapshot(homeDirectory, contents);
  return { version: FORMAT_VERSION, backend: file.backend, entries: opened.size,
    key_reference: master ? masterReference(master) : null };
}

/** An explicit owner read shares the same read-only integrity check; normal diagnostics return no plaintext. */
export function readSealedSecretSnapshotEntry(homeDirectory: string, contents: string, authRef: string): string | null {
  return openSnapshot(homeDirectory, contents).opened.get(authRef) ?? null;
}

function readExistingSecretsFile(homeDirectory: string): SecretsFileV2 | null {
  snapshotHome(homeDirectory);
  try {
    return runWithMolisWorkHome(homeDirectory, (): SecretsFileV2 | null => {
      let descriptor: number;
      try { descriptor = fs.openSync(secretsPath(), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK); }
      catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
        throw error;
      }
      try {
        const stat = fs.fstatSync(descriptor);
        if (!stat.isFile() || stat.nlink !== 1) throw snapshotErrors.invalid("凭据文件必须是只有一个链接的普通文件");
        return parseSecretsFile(fs.readFileSync(descriptor, "utf8"));
      } finally { fs.closeSync(descriptor); }
    });
  }
  catch { throw snapshotErrors.invalid("现 Home 的凭据文件不可用或不是现行格式"); }
}

/** A normal owner can read a persisted reference without initializing a store or relying on a cached master. */
export function readExistingSecret(homeDirectory: string, authRef: string): string | null {
  const file = readExistingSecretsFile(homeDirectory);
  if (!file) return null;
  return openSnapshotFile(homeDirectory, file).opened.get(authRef) ?? null;
}

export interface SealedHomePayload {
  schema_version: 1;
  backend: SecretStoreBackendKind;
  key_reference: NonNullable<SealedSecretsSnapshotInspection["key_reference"]>;
  ciphertext: string;
}

function masterReference(master: ResolvedMaster): SealedHomePayload["key_reference"] {
  const location = master.kind === "aes-gcm-file" ? "home:feed/secrets.key" : master.kind === "env-key+aes-gcm"
    ? "env:MOLIS_WORK_ENCRYPTION_KEY" : "keychain:" + KEYCHAIN_SERVICE + "/" + KEYCHAIN_ACCOUNT;
  return { location, sha256: createHash("sha256").update(master.key).digest("hex") };
}

function payloadHome(homeDirectory: string): string {
  snapshotHome(homeDirectory);
  try {
    const home = fs.realpathSync(homeDirectory);
    if (!fs.lstatSync(home).isDirectory()) throw snapshotErrors.invalid("密封数据需要已有 Home 目录");
    return home;
  } catch { throw snapshotErrors.invalid("密封数据需要已有的绝对 Home 目录"); }
}

function payloadMaster(home: string, backend: SecretStoreBackendKind): ResolvedMaster {
  try { return runWithMolisWorkHome(home, () => readExistingMasterKey(backend)); }
  catch { throw snapshotErrors.key_unavailable("原 Home 的凭据主密钥不可用；不会创建替代密钥。请按原后端找回原钥匙并重启，见 docs/system/HOME-DATA.md#original-key-recovery。"); }
}

function homePayloadAad(home: string, binding: string): Buffer {
  return Buffer.from(JSON.stringify(["molis-work/home-payload/v1", home, binding]), "utf8");
}

/** Seals owner data in memory under the existing backend; never puts temporary entries in the live vault. */
export function sealExistingHomePayload(homeDirectory: string, binding: string, contents: string): SealedHomePayload {
  const home = payloadHome(homeDirectory), file = readExistingSecretsFile(home);
  if (!file || typeof binding !== "string" || !binding || typeof contents !== "string") {
    throw snapshotErrors.invalid("密封数据需要现行凭据库、明确的主人绑定与正文");
  }
  const master = openSnapshotFile(home, file).master ?? payloadMaster(home, file.backend);
  const body = JSON.stringify({ schema_version: 1, home, binding, contents });
  return { schema_version: 1, backend: master.kind, key_reference: masterReference(master), ciphertext: sealV2(body, master.key, homePayloadAad(home, binding)) };
}

/** Opens a previously sealed owner payload even when the live vault has been lost or damaged. */
export function openExistingHomePayload(homeDirectory: string, binding: string, payload: unknown): string {
  const home = payloadHome(homeDirectory);
  if (!isPlainObject(payload) || payload.schema_version !== 1 || !isSecretStoreBackend(payload.backend)
    || typeof payload.ciphertext !== "string" || !payload.ciphertext || !isPlainObject(payload.key_reference)
    || typeof binding !== "string" || !binding) throw snapshotErrors.invalid("密封数据格式或主人绑定无效");
  const master = payloadMaster(home, payload.backend), reference = masterReference(master);
  if (payload.key_reference.location !== reference.location || payload.key_reference.sha256 !== reference.sha256) {
    throw snapshotErrors.integrity_failed("原密钥与密封数据的依赖不匹配");
  }
  const text = openV2(payload.ciphertext, master.key, homePayloadAad(home, binding));
  if (text === null) throw snapshotErrors.integrity_failed("原密钥与密封数据不匹配，或密文已损坏");
  let body: unknown;
  try { body = JSON.parse(text); } catch { throw snapshotErrors.invalid("密封数据正文格式无效"); }
  if (!isPlainObject(body) || body.schema_version !== 1 || body.home !== home || body.binding !== binding || typeof body.contents !== "string") {
    throw snapshotErrors.integrity_failed("密封数据不属于当前 Home 或主人");
  }
  return body.contents;
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

/** A new seal must be an AES-GCM v2 envelope, never reversible encoding. */
function assertSealedV2(sealed: string): void {
  try {
    const raw = JSON.parse(Buffer.from(sealed, "base64").toString("utf8")) as SealedV2;
    if (raw.v === 2 && raw.alg === ALG) return;
  } catch { /* reported below */ }
  throw new Error("secret not AES-GCM sealed");
}

/** Per data-dir store instances so put/get share one master resolution. */
const storeCache = new Map<string, SecretStore>();
// A cancelled, denied, timed-out or invalid Keychain read must not open another
// authorization dialog on every status poll. Keep the failure until process
// restart, scoped exactly like successful stores; never fall back or rotate keys.
const keychainFailures = new Map<string, KeychainUnavailableError>();

function cacheKey(): string {
  const dataDir = resolveHomeSecurityDirectory();
  const env = readProductEnv("ENCRYPTION_KEY") ?? "";
  const backend = readProductEnv("SECRET_BACKEND") ?? "";
  return `${dataDir}::${backend}::${env}`;
}

function buildStore(master: ResolvedMaster): SecretStore {
  return {
    put(authRef, plaintext) {
      withSecretsLock(() => {
        const file = loadFile();
        const sealed = sealV2(plaintext, master.key);
        assertSealedV2(sealed);
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
      return openV2(sealed, master.key);
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
        assertSealedV2(sealed);
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
  };
}

/**
 * Bind the Home now, but unlock credentials only when an operation needs them.
 * Listing local configuration must not request Keychain access merely because
 * its service also supports authenticated operations.
 */
export function createLazyFileSecretStore(homeDirectory = resolveMolisWorkHome()): SecretStore {
  const home = path.resolve(homeDirectory);
  const open = () => runWithMolisWorkHome(home, createFileSecretStore);
  return {
    put: (ref, value) => open().put(ref, value),
    get: (ref) => runWithMolisWorkHome(home, () =>
      peekSealedEntry(ref) === null ? null : createFileSecretStore().get(ref)),
    delete: (ref) => open().delete(ref),
    createIfAbsent: (ref, value) => open().createIfAbsent(ref, value),
    deleteIfPresent: (ref) => open().deleteIfPresent(ref),
    backend: () => open().backend(),
  };
}

export function createFileSecretStore(): SecretStore {
  const key = cacheKey();
  const hit = storeCache.get(key);
  if (hit) return hit;
  const failure = keychainFailures.get(key);
  if (failure) throw failure;
  let master: ResolvedMaster;
  try {
    master = withSecretsLock(() => resolveMasterKey());
  } catch (error) {
    if (error instanceof KeychainUnavailableError) keychainFailures.set(key, error);
    throw error;
  }
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
  };
  storeCache.set(key, store);
  return store;
}

/** Test helper: drop cached store instances (e.g. after changing env). */
export function resetSecretStoreCache(): void {
  storeCache.clear();
  keychainFailures.clear();
}

/** Peek on-disk sealed blob for a ref (tests / diagnostics; not plaintext). */
export function peekSealedEntry(authRef: string): string | null {
  const file = loadFile();
  return file.entries[authRef] ?? null;
}

/**
 * Deletes every entry whose reference starts with `prefix` (a deleted project's secrets), under the same cross-process
 * lock as the store's other writes. Nothing is decrypted, so it needs no master key. Returns how many went.
 */
export function deleteSecretEntriesWithPrefix(prefix: string): number {
  if (!prefix) throw new Error("a secret prefix is required");
  if (!fs.existsSync(secretsPath())) return 0;
  return withSecretsLock(() => {
    const file = loadFile();
    const names = Object.keys(file.entries).filter(name => name.startsWith(prefix));
    for (const name of names) delete file.entries[name];
    if (names.length) saveFile(file);
    return names.length;
  });
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
