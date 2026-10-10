import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { SqliteSchemaVersionError, type SecretStore } from "@molis-ai/molis-work-storage";
import { ALCHEMIST_SEARCH_BASELINE, createAlchemistSearchPort } from "@molis-ai/molis-work-app-local-host";

// Each Alchemist project's search store used to have no version at all (repository-anti-corruption §4.11). It is now created
// at version 1 like every other store, and a file the previous build left behind (tables, no version) is refused until the
// one-time stamp gives it its version.

const homeWith = (t: test.TestContext) => {
  const home = mkdtempSync(join(tmpdir(), "molis-private-store-versions-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  return home;
};
const rawDatabase = (path: string, sql?: string) => { const db = new DatabaseSync(path); if (sql) db.exec(sql); return db; };
const read = <T>(path: string, sql: string): T => { const db = new DatabaseSync(path, { readOnly: true }); try { return { ...(db.prepare(sql).get() as object) } as T; } finally { db.close(); } };
const userVersion = (path: string) => read<{ user_version: number }>(path, "PRAGMA user_version").user_version;
const secretStore = (): SecretStore => {
  const secrets = new Map<string, string>();
  return { get: ref => secrets.get(ref) ?? null, put: (ref, value) => { secrets.set(ref, value); }, delete: ref => { secrets.delete(ref); },
    createIfAbsent(ref, value) { if (secrets.has(ref)) return false; secrets.set(ref, value); return true; }, deleteIfPresent: ref => secrets.delete(ref),
    backend: () => ({ kind: "aes-gcm-file", label: "explicit test memory", masterKeyExternal: false, formatVersion: 2 }) };
};
const refused = (found: number, expected: number, path: string) => (error: unknown) => {
  assert.ok(error instanceof SqliteSchemaVersionError, String(error));
  assert.equal(error.code, "storage.schema_version_mismatch");
  assert.deepEqual([error.found, error.expected, error.path], [found, expected, path]);
  return true;
};

test("an Alchemist project's search store is created at version 1 and reopens", async t => {
  const home = homeWith(t), path = join(home, "alchemist", "projects", encodeURIComponent("project-a"), "search.sqlite");
  const options = { homeDirectory: home, projectId: "project-a", secretStore: secretStore() };
  await createAlchemistSearchPort(options).shutdown();
  assert.ok(existsSync(path), `${path} is where the store lives`);
  assert.equal(ALCHEMIST_SEARCH_BASELINE.version, 1);
  assert.equal(userVersion(path), 1);
  assert.deepEqual(read(path, "SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'feed_runtime_blobs'"), { n: 1 });
  await createAlchemistSearchPort(options).shutdown();
});

test("an unversioned Alchemist search store is refused untouched, and opens once it carries its version", async t => {
  const home = homeWith(t), directory = join(home, "alchemist", "projects", encodeURIComponent("project-b")), path = join(directory, "search.sqlite");
  mkdirSync(directory, { recursive: true });
  const old = rawDatabase(path, `PRAGMA journal_mode = WAL; ${ALCHEMIST_SEARCH_BASELINE.schema} INSERT INTO feed_runtime_blobs VALUES ('ns', 'k', 'opaque', 'token');`);
  old.close();
  const options = { homeDirectory: home, projectId: "project-b", secretStore: secretStore() };
  assert.throws(() => createAlchemistSearchPort(options), refused(0, 1, path));
  assert.equal(userVersion(path), 0, "refusing does not stamp the store");
  assert.deepEqual(read(path, "SELECT count(*) AS n FROM feed_runtime_blobs"), { n: 1 }, "refusing does not touch its blobs");
  const stamp = rawDatabase(path, "PRAGMA user_version = 1"); stamp.close();
  await createAlchemistSearchPort(options).shutdown();
  assert.deepEqual(read(path, "SELECT opaque FROM feed_runtime_blobs WHERE key = 'k'"), { opaque: "opaque" });
});
