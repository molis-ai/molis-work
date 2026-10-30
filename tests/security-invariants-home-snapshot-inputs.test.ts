import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { link, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { homeStores } from "@molis-ai/molis-work-app-local-host";
import { createLazyFileSecretStore } from "@molis-ai/molis-work-storage";
import { assertSnapshotRefused, smallSnapshotHome } from "./fixtures/home-snapshot-small.js";

test("RAC-104-S-01 RAC-106-S-03 RAC-109-S-05: unknown stores, unsupported/corrupt libraries and unfinished maintenance refuse without output", async t => {
  for (const kind of ["unregistered-root", "reserved-nonempty", "unknown-library", "wrong-version", "not-sqlite", "orphan-sidecar", "maintenance", "raw-runtime-backup", "renamed-sdk-key", "renamed-master"] as const) {
    await t.test(kind, async t => {
      const f = await smallSnapshotHome(t);
      let code: string | undefined = "host.home_snapshot.unknown_data";
      if (kind === "unregistered-root") await f.file("unregistered-private.json");
      if (kind === "reserved-nonempty") await f.file("backups/keep.txt");
      if (kind === "renamed-sdk-key") await f.file("agent-runtime/storage.key.original", randomBytes(32));
      if (kind === "renamed-master") await f.file("feed/secrets.key.original", randomBytes(32));
      if (kind === "unknown-library" || kind === "wrong-version") {
        await mkdir(join(f.home, "memory"));
        const memory = homeStores().get("memory")!, file = join(f.home, "memory", kind === "unknown-library" ? "unknown.db" : "memory.db");
        const database = new DatabaseSync(file);
        try { database.exec(memory.library!.baseline.schema); database.exec("PRAGMA user_version=" + (memory.library!.baseline.version + 1)); }
        finally { database.close(); }
        if (kind === "wrong-version") code = "storage.schema_version_mismatch";
      }
      if (kind === "not-sqlite") { await f.file("memory/memory.db", "SQLite payload is corrupt"); code = "host.home_snapshot.invalid"; }
      if (kind === "orphan-sidecar") await f.file("memory/memory.db-wal", "Orphan WAL is never interpreted as content");
      if (kind === "maintenance") { await f.file("server/.invite-maintenance.json", "{}"); code = "host.home_snapshot.maintenance_pending"; }
      if (kind === "raw-runtime-backup") { await f.file("runtime-config-backups/codex/previous.bak", "unsealed old Runtime configuration"); code = "installer.runtime_backup.invalid"; }
      await assertSnapshotRefused(f, code);
    });
  }
});

test("S-12 RAC-104-S-04 RAC-109-S-05: links and special source paths never escape the registered Home", async t => {
  for (const kind of ["file-symlink", "directory-symlink", "hardlink", "fifo"] as const) await t.test(kind, async t => {
    const f = await smallSnapshotHome(t), outside = join(f.area, "outside");
    await mkdir(outside); await writeFile(join(outside, "value"), "A different owner's bytes");
    if (kind === "directory-symlink") await symlink(outside, join(f.home, "images"));
    else {
      await mkdir(join(f.home, "images"));
      if (kind === "file-symlink") await symlink(join(outside, "value"), join(f.home, "images", "value"));
      else if (kind === "fifo") assert.equal(spawnSync("mkfifo", [join(f.home, "images", "value")]).status, 0);
      else await link(join(outside, "value"), join(f.home, "images", "value"));
    }
    await assertSnapshotRefused(f, "host.home_snapshot.invalid");
    assert.equal(await readFile(join(outside, "value"), "utf8"), "A different owner's bytes");
  });
});

test("S-12 RAC-104-S-04: the original vault backend/key is required and never repaired by snapshot", async t => {
  for (const kind of ["missing", "wrong", "old-vault", "unprepared-bookmark"] as const) await t.test(kind, async t => {
    const f = await smallSnapshotHome(t);
    let code = "storage.secrets_snapshot.invalid";
    if (kind === "unprepared-bookmark") await f.file("directory-access/bookmarks.json", JSON.stringify({ documents: { path: f.area, bookmark: "test-only authorization" } }));
    else {
      createLazyFileSecretStore(f.home).put("snapshot-fixture", "test-only-snapshot-value");
      if (kind === "missing") { await rm(join(f.home, "feed", "secrets.key")); code = "storage.secrets_snapshot.key_unavailable"; }
      if (kind === "wrong") { await writeFile(join(f.home, "feed", "secrets.key"), randomBytes(32).toString("base64")); code = "storage.secrets_snapshot.integrity_failed"; }
      if (kind === "old-vault") await writeFile(join(f.home, "feed", "secrets.json"), JSON.stringify({ version: 1, entries: { fixture: "old plaintext" } }));
    }
    await assertSnapshotRefused(f, code);
  });
});

test("RAC-104-S-01/04 RAC-106-S-03: retired storage is strictly owner/meta v7 and requires its original content key", async t => {
  for (const kind of ["wrong-version", "wrong-owner", "missing-key", "invalid-key-size"] as const) await t.test(kind, async t => {
    const f = await smallSnapshotHome(t); await mkdir(join(f.home, "sessions"));
    const database = new DatabaseSync(join(f.home, "sessions", "sessions.db"));
    try {
      database.exec("CREATE TABLE session_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE sessions (id TEXT PRIMARY KEY,title TEXT);");
      database.prepare("INSERT INTO session_meta VALUES (?,?)").run("owner", kind === "wrong-owner" ? "foreign-owner" : "molis-work-session-registry-v1");
      database.prepare("INSERT INTO session_meta VALUES (?,?)").run("schema_version", kind === "wrong-version" ? "6" : "7");
      database.prepare("INSERT INTO sessions VALUES (?,?)").run("kept", "Opaque retired fact");
    } finally { database.close(); }
    await f.file("sessions/content/blobs/kept.blob", "Opaque sealed bytes");
    if (kind !== "missing-key") await f.file("sessions/content/content.key", randomBytes(kind === "invalid-key-size" ? 31 : 32));
    await assertSnapshotRefused(f, kind === "missing-key" || kind === "invalid-key-size" ? "host.home_snapshot.key_unavailable" : undefined,
      kind === "wrong-version" || kind === "wrong-owner" ? /owner.*版本不符/u : undefined);
  });
});

const readyInstallRecord = (home: string, directory: string, id: string) => JSON.stringify({ id, ready: true, directory: join(home, directory), executable: join(home, directory, "tool"), runtime_path: [], source: { kind: "npm" } });

test("RAC-1845 an unknown file in a managed install directory whose record cannot be used is refused as an unclassifiable entry, naming the file", async t => {
  // Telling the install's own executable from a stranger reads the install record, and readManagedConnectorTool throws connector.install.invalid
  // (connector-tool-install.ts) for each of these; the snapshot answers with its own code, the one every other unclassifiable entry gets.
  const id = "8fe2d9f4-f9a8-4cd0-bd86-4c96a73d0abc";
  for (const kind of ["record-missing", "record-not-json", "record-incomplete", "executable-gone", "invalid-id"] as const) await t.test(kind, async t => {
    const f = await smallSnapshotHome(t), name = kind === "invalid-id" ? "not-an-installation" : id, directory = "runtime/connectors/installs/" + name;
    await f.file(directory + "/stray.txt");
    if (kind === "record-not-json") await f.file(directory + "/installation.json", "not json");
    if (kind === "record-incomplete") await f.file(directory + "/installation.json", JSON.stringify({ id, ready: true }));
    if (kind === "executable-gone") await f.file(directory + "/installation.json", readyInstallRecord(f.home, directory, id));
    await assertSnapshotRefused(f, "host.home_snapshot.unknown_data", new RegExp("未生成快照: connectors/installs/" + name + "/stray\\.txt", "u"));
  });
});

test("RAC-1846 an unknown file beside a usable install record is still refused by name, and the install's own executable is not refused", async t => {
  // "tool" is the executable the record names and is let through; "zz-stray.txt" sorts after it, so it is the file the snapshot reaches and refuses.
  const id = "8fe2d9f4-f9a8-4cd0-bd86-4c96a73d0abc", directory = "runtime/connectors/installs/" + id, f = await smallSnapshotHome(t);
  await f.file(directory + "/installation.json", readyInstallRecord(f.home, directory, id));
  await f.file(directory + "/tool"); await f.file(directory + "/zz-stray.txt");
  await assertSnapshotRefused(f, "host.home_snapshot.unknown_data", new RegExp("未生成快照: connectors/installs/" + id + "/zz-stray\\.txt", "u"));
});
