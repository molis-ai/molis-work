import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

// Hold an actual rollback-journal write after cache spill, until the test process stops this child.
const [file, version, owner, mode, peer, root] = process.argv.slice(2);
if (mode === "replay") {
  const { dirname, join } = await import("node:path");
  const { readdirSync } = await import("node:fs");
  const { acquireStorageOwner, recoverSqliteRollbackJournals } = await import("@molis-ai/molis-work-storage");
  const lockDirectory = join(root, "agent-runtime"), lease = acquireStorageOwner(lockDirectory);
  const marker = readdirSync(dirname(file)).find(name => name.includes("-mj"));
  const inspect = db => {
    if (db.prepare("SELECT owner FROM facts WHERE id=1").get().owner !== "trusted") throw new Error("unexpected recovery owner");
    if (db.name === file) process.kill(process.pid, "SIGKILL");
  };
  try {
    recoverSqliteRollbackJournals({ home: root, lockDirectory, owner: lease }, [
      { path: file, version: 2, kind: "project", inspect }, { path: peer, version: 1, kind: "home", inspect },
    ], [file + "-journal", peer + "-journal", join(dirname(file), marker)]);
  } finally { lease.release(); }
  process.exitCode = 1; // Reaching here would miss the requested kill window.
} else runWrite();

function runWrite() {
  const db = new DatabaseSync(file);
  if (mode === "wal-transition") {
    db.exec("PRAGMA synchronous=EXTRA");
    // The first row is available while the native statement still holds its page-1 journal.
    const changing = db.prepare("PRAGMA journal_mode=DELETE").iterate();
    if (changing.next().value?.journal_mode !== "delete") throw new Error("journal-mode change did not begin");
    process.on("SIGCONT", () => changing.return());
    process.stdout.write("staged\n");
    setInterval(() => {}, 1000);
    return;
  }
  db.exec("PRAGMA journal_mode=DELETE; PRAGMA synchronous=EXTRA");
  if (mode === "pair") {
    const uri = pathToFileURL(peer);
    uri.searchParams.set("mode", "rw");
    db.prepare("ATTACH DATABASE ? AS peer").run(uri.href);
    db.exec("PRAGMA peer.synchronous=EXTRA; PRAGMA cache_spill=OFF; BEGIN IMMEDIATE");
    for (const schema of ["main", "peer"]) {
      db.prepare(`UPDATE ${schema}.facts SET value='staged' WHERE id=1`).run();
      db.prepare(`UPDATE ${schema}.padding SET payload=randomblob(?) WHERE id=1`).run(32 * 1024 * 1024);
    }
    process.stdout.write("entering commit\n");
    db.exec("COMMIT");
    db.close();
    return;
  }
  db.exec("PRAGMA cache_size=8; PRAGMA cache_spill=ON; BEGIN IMMEDIATE");
  if (mode === "first") {
    db.exec("CREATE TABLE unfinished (payload BLOB NOT NULL)");
    db.prepare("INSERT INTO unfinished VALUES (randomblob(?))").run(8 * 1024 * 1024);
  } else if (mode === "host") {
    db.prepare(`INSERT INTO events (event_id, project_id, actor_id, type, object_type, object_id, reason, payload_json, at)
      SELECT 'n12-uncommitted', project_id, 'fixture', 'test.write', 'test', 'n12', 'fixture', hex(randomblob(?)), '2026-11-09T00:00:00Z'
      FROM project_root`).run(4 * 1024 * 1024);
  } else {
    db.prepare("UPDATE facts SET owner=?, value='staged' WHERE id=1").run(owner);
    db.exec(`PRAGMA user_version=${Number(version)}`);
    db.prepare("UPDATE padding SET payload=randomblob(?) WHERE id=1").run(8 * 1024 * 1024);
  }
  process.stdout.write("staged\n");
  setInterval(() => {}, 1000);
}
