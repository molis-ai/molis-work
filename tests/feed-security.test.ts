import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createFeedEvidenceContentStore } from "@molis-ai/molis-work-module-feed";
import {
  createFileSecretStore,
  peekSealedEntry,
  resetSecretStoreCache,
} from "@molis-ai/molis-work-storage";

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
