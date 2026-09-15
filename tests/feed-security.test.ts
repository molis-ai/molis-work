import assert from "node:assert/strict";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { hydrateFeedItemContent } from "@molis-ai/molis-work-app-local-host";
import { detectRelayImport, importRelayData } from "@molis-ai/molis-work-app-local-host";
import { createFeedEvidenceContentStore } from "@molis-ai/molis-work-module-feed";
import {
  createFileSecretStore,
  peekSealedEntry,
  resetSecretStoreCache,
  readRelayContent,
} from "@molis-ai/molis-work-storage";
import { createLocalFeedApplication } from "@molis-ai/molis-work-app-local-host";
import { DEMO_BOARD_ID, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import Database from "better-sqlite3";

function withFeedHome<T>(directory: string, run: () => T): T {
  const oldHome = process.env.MOLIS_WORK_HOME;
  const oldBackend = process.env.MOLIS_WORK_SECRET_BACKEND;
  const oldNodeEnv = process.env.NODE_ENV;
  process.env.MOLIS_WORK_HOME = join(directory, "molis-work-home");
  process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  process.env.NODE_ENV = "test";
  resetSecretStoreCache();
  try {
    return run();
  } finally {
    resetSecretStoreCache();
    if (oldHome == null) delete process.env.MOLIS_WORK_HOME;
    else process.env.MOLIS_WORK_HOME = oldHome;
    if (oldBackend == null) delete process.env.MOLIS_WORK_SECRET_BACKEND;
    else process.env.MOLIS_WORK_SECRET_BACKEND = oldBackend;
    if (oldNodeEnv == null) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldNodeEnv;
  }
}

function sealRelaySecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.from(JSON.stringify({
    v: 2,
    alg: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ct: ct.toString("base64"),
  })).toString("base64");
}

test("Molis Work Feed secrets and retained content are AES-GCM sealed", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-feed-security-"));
  try {
    withFeedHome(directory, () => {
      const secrets = createFileSecretStore();
      secrets.put("connector:github:token", "github-secret-value-123");
      assert.equal(secrets.get("connector:github:token"), "github-secret-value-123");
      const sealed = peekSealedEntry("connector:github:token");
      assert.ok(sealed);
      assert.equal(sealed!.includes("github-secret-value-123"), false);

      const content = createFeedEvidenceContentStore({ secretStore: secrets });
      const written = content.write("# Private retained body\n\nfull text");
      assert.equal(content.read(written.contentRef), "# Private retained body\n\nfull text");
      const digest = written.contentRef.split("/").at(-1)!;
      const blobPath = join(directory, "molis-work-home", "feed", "evidence", "blobs", digest.slice(0, 2), `${digest}.blob`);
      assert.equal(readFileSync(blobPath, "utf8").includes("Private retained body"), false);
      writeFileSync(blobPath, readFileSync(blobPath, "utf8").replace(/.$/u, "x"));
      assert.throws(() => content.read(written.contentRef), /integrity|unavailable/u);
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("retained content recovery re-seals a migrated hash without overwriting unreadable ciphertext", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-feed-content-recovery-"));
  try {
    withFeedHome(directory, () => {
      const secrets = createFileSecretStore();
      const content = createFeedEvidenceContentStore({ secretStore: secrets });
      const markdown = "# Migrated feed body\n\nThe original ciphertext must remain untouched.";
      const written = content.write(markdown);
      const digest = written.contentRef.split("/").at(-1)!;
      const originalPath = join(directory, "molis-work-home", "feed", "evidence", "blobs", digest.slice(0, 2), `${digest}.blob`);
      const originalCiphertext = readFileSync(originalPath, "utf8");

      secrets.deleteIfPresent("system:feed:evidence-content-key:v1");
      const migrated = createFeedEvidenceContentStore({ secretStore: secrets });
      assert.throws(() => migrated.read(written.contentRef), /key unavailable/u);
      assert.deepEqual(migrated.write(markdown), written);
      assert.equal(migrated.read(written.contentRef), markdown);
      const fresh = migrated.write("# A new body after migration");
      assert.equal(migrated.read(fresh.contentRef), "# A new body after migration");
      assert.equal(readFileSync(originalPath, "utf8"), originalCiphertext, "v1 ciphertext is retained byte-for-byte");
      const recoveryPath = join(directory, "molis-work-home", "feed", "evidence-recovered-v2", "blobs", digest.slice(0, 2), `${digest}.blob`);
      assert.equal(readFileSync(recoveryPath, "utf8").includes("Migrated feed body"), false);
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("SecretStore preserves its populated backend and refuses silent key rotation", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-feed-secret-backend-"));
  const oldEncryptionKey = process.env.MOLIS_WORK_ENCRYPTION_KEY;
  try {
    withFeedHome(directory, () => {
      const fileStore = createFileSecretStore();
      fileStore.put("connector:github:token", "persisted-file-secret");
      resetSecretStoreCache();
      process.env.MOLIS_WORK_SECRET_BACKEND = "keychain";
      const reopened = createFileSecretStore();
      assert.equal(reopened.backend().kind, "aes-gcm-file");
      assert.equal(reopened.get("connector:github:token"), "persisted-file-secret");
    });

    const envDirectory = mkdtempSync(join(tmpdir(), "molis-work-feed-secret-env-"));
    try {
      withFeedHome(envDirectory, () => {
        process.env.MOLIS_WORK_SECRET_BACKEND = "env";
        process.env.MOLIS_WORK_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
        resetSecretStoreCache();
        createFileSecretStore().put("connector:gmail:token", "persisted-env-secret");
        resetSecretStoreCache();
        delete process.env.MOLIS_WORK_ENCRYPTION_KEY;
        assert.throws(
          () => createFileSecretStore(),
          /unavailable; refusing to rotate existing secrets/u,
        );
      });
    } finally {
      resetSecretStoreCache();
      rmSync(envDirectory, { recursive: true, force: true });
    }
  } finally {
    resetSecretStoreCache();
    if (oldEncryptionKey == null) delete process.env.MOLIS_WORK_ENCRYPTION_KEY;
    else process.env.MOLIS_WORK_ENCRYPTION_KEY = oldEncryptionKey;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Relay retained content requires its key, authenticated reference and matching plaintext digest", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-relay-content-boundary-"));
  try {
    const key = randomBytes(32);
    const plaintext = "Private retained Relay fixture";
    const digest = createHash("sha256").update(plaintext).digest("hex");
    const ref = `relay-evidence/sha256/${digest}`;
    const blobPath = join(directory, "evidence", "blobs", digest.slice(0, 2), `${digest}.blob`);
    mkdirSync(dirname(blobPath), { recursive: true });
    const seal = (body: string, aad: string) => {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(Buffer.from(aad));
      const ciphertext = Buffer.concat([cipher.update(body), cipher.final()]);
      writeFileSync(blobPath, JSON.stringify({ v: 1, alg: "aes-256-gcm", iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ct: ciphertext.toString("base64") }));
    };
    seal(plaintext, ref);
    assert.equal(readRelayContent(ref, directory, key), plaintext);
    assert.equal(readRelayContent(ref, directory, null), null);
    assert.equal(readRelayContent(ref, directory, randomBytes(32)), null);
    seal(plaintext, "relay-evidence/sha256/a-different-reference");
    assert.equal(readRelayContent(ref, directory, key), null, "ciphertext cannot be moved from another authenticated ref");
    seal("A different plaintext with a valid tag", ref);
    assert.equal(readRelayContent(ref, directory, key), null, "successful decryption alone does not prove the content identity");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Relay ownership migration reseals connector credentials and full evidence content", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-relay-ownership-"));
  const relayPath = join(directory, "relay.sqlite");
  const molisWorkPath = join(directory, "molis-work.sqlite");
  try {
    withFeedHome(directory, () => {
      const relay = new Database(relayPath);
      relay.exec(`
        CREATE TABLE inbox_sources (id TEXT PRIMARY KEY, definition_id TEXT, kind TEXT, name TEXT, description TEXT, status TEXT, enabled INTEGER, item_count INTEGER, query TEXT, channel_id TEXT, feed_url TEXT, query_fingerprint TEXT, cursor_json TEXT, last_sync_at TEXT, last_outcome TEXT, last_error_code TEXT, updated_at TEXT);
        CREATE TABLE items (id TEXT PRIMARY KEY, kind TEXT, title TEXT, summary TEXT, body TEXT, source TEXT, source_label TEXT, external_id TEXT, url TEXT, status TEXT, priority TEXT, tags_json TEXT, author TEXT, created_at TEXT, updated_at TEXT);
        CREATE TABLE evidence_refs (id TEXT PRIMARY KEY, item_id TEXT, canonical_url TEXT, title TEXT, source_name TEXT, published_at TEXT, preview TEXT, content_hash TEXT, content_ref TEXT, content_type TEXT, character_count INTEGER, captured_at TEXT, provenance_json TEXT, selected_for_context INTEGER, last_seen_at TEXT);
        CREATE TABLE connectors (id TEXT PRIMARY KEY, type TEXT, name TEXT, description TEXT, status TEXT, account_label TEXT, last_sync_at TEXT, item_count INTEGER);
        CREATE TABLE connector_cursors (connector_id TEXT PRIMARY KEY, cursor_json TEXT);
        CREATE TABLE settings (key TEXT PRIMARY KEY, value_json TEXT, updated_at TEXT);
      `);
      relay.prepare("INSERT INTO inbox_sources VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
        "source-rss", "sspai", "rss", "少数派", "公开 RSS", "active", 1, 1,
        null, null, "https://sspai.com/feed", "fp", "{}", null, null, null,
        "2026-08-29T08:00:00.000Z",
      );
      relay.prepare("INSERT INTO items VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
        "item-1", "update", "迁移内容", "摘要", "预览正文", "rss", "少数派", "ext-1",
        "https://example.com/item", "inbox", "medium", "[]", null,
        "2026-08-29T08:00:00.000Z", "2026-08-29T08:00:00.000Z",
      );
      const fullBody = "# Relay retained body\n\nThis must survive Relay deletion.";
      const digest = createHash("sha256").update(fullBody).digest("hex");
      const relayRef = `relay-evidence/sha256/${digest}`;
      relay.prepare("INSERT INTO evidence_refs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(
        "material-1", "item-1", "https://example.com/item", "迁移材料", "少数派", null,
        "摘要", `sha256:${digest}`, relayRef, "text/markdown", fullBody.length,
        "2026-08-29T08:00:00.000Z", "{}", 1, "2026-08-29T08:00:00.000Z",
      );
      relay.prepare("INSERT INTO connectors VALUES (?,?,?,?,?,?,?,?)").run(
        "conn-github", "github", "GitHub", "Relay GitHub", "connected", "octocat", null, 0,
      );
      relay.prepare("INSERT INTO connector_cursors VALUES (?,?)").run("conn-github", JSON.stringify({ since: "cursor-1" }));
      relay.prepare("INSERT INTO settings VALUES (?,?,?)").run(
        "connector:gmail:installations",
        JSON.stringify([{ id: "gmail-a", email: "a@example.com", status: "connected", itemCount: 2, createdAt: "2026-08-01T00:00:00.000Z" }]),
        "2026-08-29T08:00:00.000Z",
      );
      relay.close();

      const relayMaster = randomBytes(32);
      const relayContentKey = randomBytes(32);
      const oldRelayKey = process.env.RELAY_ENCRYPTION_KEY;
      process.env.RELAY_ENCRYPTION_KEY = relayMaster.toString("base64");
      writeFileSync(join(directory, "secrets.key"), relayMaster.toString("base64"));
      writeFileSync(join(directory, "secrets.json"), JSON.stringify({
        version: 2,
        entries: {
          "connector:github:token": sealRelaySecret("relay-github-token", relayMaster),
          "connector:gmail:inst:gmail-a:access": sealRelaySecret("relay-gmail-access", relayMaster),
          "connector:gmail:inst:gmail-a:refresh": sealRelaySecret("relay-gmail-refresh", relayMaster),
          "system:evidence:content-key:v1": sealRelaySecret(relayContentKey.toString("base64"), relayMaster),
        },
      }));
      const blobPath = join(directory, "evidence", "blobs", digest.slice(0, 2), `${digest}.blob`);
      mkdirSync(dirname(blobPath), { recursive: true });
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", relayContentKey, iv);
      cipher.setAAD(Buffer.from(relayRef));
      const ciphertext = Buffer.concat([cipher.update(fullBody, "utf8"), cipher.final()]);
      writeFileSync(blobPath, JSON.stringify({
        v: 1,
        alg: "aes-256-gcm",
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
        ct: ciphertext.toString("base64"),
      }));

      seedDemoBoard(molisWorkPath);
      const store = new LocalProjectDatabase(molisWorkPath);
      try {
        const result = importRelayData(createLocalFeedApplication(store.db), DEMO_BOARD_ID, relayPath);
        assert.equal(result.credentials.status, "migrated");
        assert.equal(result.credentials.migrated, 3);
        assert.equal(result.content.status, "migrated");
        assert.equal(result.content.migrated, 1);
        assert.equal(createFileSecretStore().get("connector:github:token"), "relay-github-token");
        assert.equal(createFileSecretStore().get("connector:gmail:inst:gmail-a:access"), "relay-gmail-access");
        const hydrated = hydrateFeedItemContent(createLocalFeedApplication(store.db).getItem(DEMO_BOARD_ID, "item-1"));
        assert.equal(hydrated.materials[0]?.content, fullBody);
        const gmail = createLocalFeedApplication(store.db).snapshot(DEMO_BOARD_ID).sources.find(
          (source) => source.config.installation_id === "gmail-a",
        );
        assert.equal(gmail?.account_label, "a@example.com");
        assert.equal(gmail?.credential_ref, "connector:gmail:inst:gmail-a:access");

        rmSync(relayPath, { force: true });
        rmSync(join(directory, "secrets.json"), { force: true });
        rmSync(join(directory, "secrets.key"), { force: true });
        rmSync(join(directory, "evidence"), { recursive: true, force: true });
        resetSecretStoreCache();

        assert.equal(detectRelayImport(relayPath).available, false);
        assert.equal(createFileSecretStore().get("connector:github:token"), "relay-github-token");
        const independent = hydrateFeedItemContent(createLocalFeedApplication(store.db).getItem(DEMO_BOARD_ID, "item-1"));
        assert.equal(independent.materials[0]?.content, fullBody);
        assert.equal(createLocalFeedApplication(store.db).snapshot(DEMO_BOARD_ID).sources.length >= 3, true);
      } finally {
        store.close();
        if (oldRelayKey == null) delete process.env.RELAY_ENCRYPTION_KEY;
        else process.env.RELAY_ENCRYPTION_KEY = oldRelayKey;
      }
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
