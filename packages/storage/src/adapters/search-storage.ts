import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { SqliteDatabase } from "../sqlite.js";

import type {
  SearchAeadPort,
  SearchDeadlineAwareOpaqueBlobStorePort,
  SearchSecretStorePort,
} from "@adeptify/search-evidence-layer/host/node";

import type { SecretStore } from "./file-secret-store.js";

const AEAD_PREFIX = "molis-work-feed-aead-v1";
const AEAD_ALG = "aes-256-gcm" as const;
const AEAD_IV_BYTES = 12;
const AEAD_KEY_BYTES = 32;
const SQLITE_NOW_MS = "CAST(unixepoch('now', 'subsec') * 1000 AS INTEGER)";

type SqliteChanges = { changes?: number | bigint };

const CURSOR_PREFIX = "molis-work-feed-blob-cursor-v1";
const utf8Fatal = new TextDecoder("utf-8", { fatal: true });

type SecretBackend = Pick<SecretStore, "get" | "createIfAbsent" | "deleteIfPresent">;

export function createFeedSearchOpaqueBlobStore(
  db: SqliteDatabase,
): SearchDeadlineAwareOpaqueBlobStorePort {
  const readNowMs = db.prepare(`SELECT ${SQLITE_NOW_MS} AS now_ms`);
  const readRow = db.prepare(
    "SELECT opaque, cas_token FROM feed_runtime_blobs WHERE namespace = ? AND key = ?",
  );
  const insertIgnore = db.prepare(
    "INSERT OR IGNORE INTO feed_runtime_blobs (namespace, key, opaque, cas_token) VALUES (?, ?, ?, ?)",
  );
  const updateCas = db.prepare(
    "UPDATE feed_runtime_blobs SET opaque = ?, cas_token = ? WHERE namespace = ? AND key = ? AND cas_token = ?",
  );
  const deleteCas = db.prepare(
    "DELETE FROM feed_runtime_blobs WHERE namespace = ? AND key = ? AND cas_token = ?",
  );
  const scanPage = db.prepare(
    "SELECT key, opaque, cas_token FROM feed_runtime_blobs WHERE namespace = ? AND key > ? ORDER BY key COLLATE BINARY LIMIT ?",
  );
  const scanFirst = db.prepare(
    "SELECT key, opaque, cas_token FROM feed_runtime_blobs WHERE namespace = ? ORDER BY key COLLATE BINARY LIMIT ?",
  );

  const trustedNowUnixMs = (): number => {
    const row = readNowMs.get() as { now_ms?: number } | undefined;
    const now = Number(row?.now_ms);
    if (!Number.isSafeInteger(now) || now < 1) {
      throw new Error("Invalid trusted storage clock");
    }
    return now;
  };

  const inImmediate = <T>(fn: () => T): T => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch {
        /* already rolled back */
      }
      throw error;
    }
  };

  return {
    async read(input) {
      const row = readRow.get(input.namespace, input.key) as
        | { opaque: string; cas_token: string }
        | undefined;
      if (!row) return undefined;
      return { opaque: row.opaque, casToken: row.cas_token };
    },

    async createIfAbsent(input) {
      const casToken = newCasToken();
      return inImmediate(() => {
        const result = insertIgnore.run(
          input.namespace,
          input.key,
          input.opaque,
          casToken,
        ) as SqliteChanges;
        if (Number(result.changes ?? 0) === 1) {
          return { created: true as const, casToken };
        }
        return { created: false as const };
      });
    },

    async compareAndSet(input) {
      const casToken = newCasToken();
      return inImmediate(() => {
        const result = updateCas.run(
          input.opaque,
          casToken,
          input.namespace,
          input.key,
          input.expectedCasToken,
        ) as SqliteChanges;
        if (Number(result.changes ?? 0) === 1) {
          return { updated: true as const, casToken };
        }
        return { updated: false as const };
      });
    },

    trustedNowUnixMs,

    async compareAndSetBefore(input) {
      if (!Number.isSafeInteger(input.deadlineUnixMs) || input.deadlineUnixMs < 1) {
        throw new Error("Invalid atomic deadline");
      }
      const casToken = newCasToken();
      return inImmediate(() => {
        const observedAtUnixMs = trustedNowUnixMs();
        if (observedAtUnixMs >= input.deadlineUnixMs) {
          return {
            updated: false as const,
            reason: "deadline_exceeded" as const,
            observedAtUnixMs,
          };
        }
        const result = updateCas.run(
          input.opaque,
          casToken,
          input.namespace,
          input.key,
          input.expectedCasToken,
        ) as SqliteChanges;
        if (Number(result.changes ?? 0) === 1) {
          return {
            updated: true as const,
            casToken,
            committedAtUnixMs: observedAtUnixMs,
          };
        }
        return {
          updated: false as const,
          reason: "cas_mismatch" as const,
          observedAtUnixMs,
        };
      });
    },

    async delete(input) {
      const result = deleteCas.run(
        input.namespace,
        input.key,
        input.expectedCasToken,
      ) as SqliteChanges;
      return Number(result.changes ?? 0) === 1;
    },

    async scan(input) {
      if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 128) {
        throw new Error("Invalid blob scan page");
      }
      const afterKey =
        input.cursor === undefined ? undefined : decodeScanCursor(input.cursor, input.namespace);
      const rows = (
        afterKey === undefined
          ? scanFirst.all(input.namespace, input.limit + 1)
          : scanPage.all(input.namespace, afterKey, input.limit + 1)
      ) as Array<{ key: string; opaque: string; cas_token: string }>;
      const hasMore = rows.length > input.limit;
      const page = hasMore ? rows.slice(0, input.limit) : rows;
      const last = page[page.length - 1];
      return {
        entries: page.map((row) => ({
          key: row.key,
          opaque: row.opaque,
          casToken: row.cas_token,
        })),
        ...(hasMore && last !== undefined
          ? { nextCursor: encodeScanCursor(input.namespace, last.key) }
          : {}),
      };
    },
  };
}

export function createFeedSearchAead(): SearchAeadPort {
  return {
    async seal(input) {
      assertAeadParts(input);
      const key = Buffer.from(input.key);
      const iv = randomBytes(AEAD_IV_BYTES);
      const cipher = createCipheriv(AEAD_ALG, key, iv);
      cipher.setAAD(Buffer.from(input.aad));
      const ciphertext = Buffer.concat([
        cipher.update(Buffer.from(input.plaintext)),
        cipher.final(),
      ]);
      const tag = cipher.getAuthTag();
      return `${AEAD_PREFIX}.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
    },

    async open(input) {
      if (typeof input.encrypted !== "string") {
        throw new Error("Invalid AEAD sealed value");
      }
      assertAeadParts(input);
      const parts = input.encrypted.split(".");
      if (parts.length !== 4 || parts[0] !== AEAD_PREFIX) {
        throw new Error("Invalid AEAD sealed value");
      }
      const iv = decodeB64Url(parts[1]);
      const tag = decodeB64Url(parts[2]);
      const ciphertext = decodeB64Url(parts[3]);
      if (iv.byteLength !== AEAD_IV_BYTES) {
        throw new Error("Invalid AEAD sealed value");
      }
      const decipher = createDecipheriv(AEAD_ALG, Buffer.from(input.key), iv);
      decipher.setAAD(Buffer.from(input.aad));
      decipher.setAuthTag(tag);
      return new Uint8Array(
        Buffer.concat([decipher.update(ciphertext), decipher.final()]),
      );
    },
  };
}

export function createFeedSearchSecretStore(
  backend: SecretBackend,
): SearchSecretStorePort {
  return {
    async get(key) {
      return backend.get(key) ?? undefined;
    },
    async createIfAbsent(key, value) {
      return backend.createIfAbsent(key, value);
    },
    async delete(key) {
      return backend.deleteIfPresent(key);
    },
  };
}

function newCasToken(): string {
  return `molis-work-feed-cas-v1.${randomBytes(18).toString("base64url")}`;
}

function encodeScanCursor(namespace: string, lastKey: string): string {
  return `${CURSOR_PREFIX}.${Buffer.from(
    JSON.stringify({ version: 1, namespace, lastKey }),
    "utf8",
  ).toString("base64url")}`;
}

function decodeScanCursor(cursor: string, namespace: string): string {
  if (typeof cursor !== "string" || !cursor.startsWith(`${CURSOR_PREFIX}.`)) {
    throw new Error("Invalid blob cursor");
  }
  const encoded = cursor.slice(`${CURSOR_PREFIX}.`.length);
  if (!/^[A-Za-z0-9_-]+$/u.test(encoded)) {
    throw new Error("Invalid blob cursor");
  }
  const raw = Buffer.from(encoded, "base64url");
  if (raw.toString("base64url") !== encoded) {
    throw new Error("Invalid blob cursor");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(utf8Fatal.decode(raw));
  } catch {
    throw new Error("Invalid blob cursor");
  }
  if (!isScanCursorPayload(parsed) || parsed.namespace !== namespace) {
    throw new Error("Invalid blob cursor");
  }
  return parsed.lastKey;
}

function isScanCursorPayload(
  value: unknown,
): value is { version: 1; namespace: string; lastKey: string } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  if (Object.getPrototypeOf(value) !== Object.prototype) return false;
  if (Object.getOwnPropertySymbols(value).length !== 0) return false;
  const keys = Object.keys(value);
  if (keys.length !== 3) return false;
  const rec = value as Record<string, unknown>;
  return (
    rec.version === 1
    && typeof rec.namespace === "string"
    && rec.namespace.length > 0
    && typeof rec.lastKey === "string"
    && rec.lastKey.length > 0
  );
}

function assertAeadParts(input: {
  readonly key: Uint8Array;
  readonly aad: Uint8Array;
  readonly plaintext?: Uint8Array;
}): void {
  if (!(input.key instanceof Uint8Array) || input.key.byteLength !== AEAD_KEY_BYTES) {
    throw new Error("Invalid AEAD key");
  }
  if (!(input.aad instanceof Uint8Array)) {
    throw new Error("Invalid AEAD aad");
  }
  if (input.plaintext !== undefined && !(input.plaintext instanceof Uint8Array)) {
    throw new Error("Invalid AEAD plaintext");
  }
}

function decodeB64Url(value: string | undefined): Buffer {
  if (value === undefined || !/^[A-Za-z0-9_-]*$/u.test(value)) {
    throw new Error("Invalid AEAD sealed value");
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) {
    throw new Error("Invalid AEAD sealed value");
  }
  return decoded;
}
