#!/usr/bin/env node
// The retired Sessions store, `<home>/sessions/` (Sessions cleanup SC-4/SC-5, D6): nothing in the product opens it any more.
//
//   node scripts/retired-sessions-store.mjs report --home <Home>
//       Read-only. What is in the directory: files and sizes, the library's tables and row counts, the content blocks. It
//       copies the library to a temporary directory before it opens it, so the Home is never written to (not even a WAL or
//       shm file), and it prints counts only, never the content of a message, event or handoff.
//   node scripts/retired-sessions-store.mjs remove --home <Home> [--apply --confirm <the directory's absolute path>]
//       Without --apply it only says what it would remove. With --apply it removes the directory, and only if --confirm is
//       exactly its absolute path, nothing in it changed in the last minute (a running Molis Work is stopped first), and it
//       is a real directory (not a link). Running it on a real Home is the person's own decision: it deletes user data.
//
// --home is always required: no default Home is guessed. Exit codes: 0 done, 1 refused or failed, 2 wrong arguments.
import { copyFileSync, existsSync, lstatSync, mkdtempSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const QUIET_SECONDS = 60;

/** Every file under `directory` with its size, relative to it; links are listed and never followed. */
function listing(directory, relative = "") {
  const found = [];
  for (const entry of readdirSync(join(directory, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(relative, entry.name), stat = lstatSync(join(directory, path));
    if (entry.isDirectory()) found.push(...listing(directory, path));
    else found.push({ path, bytes: stat.size, modified: stat.mtime.toISOString(), link: entry.isSymbolicLink() });
  }
  return found;
}

/** The library's tables and row counts, read from a copy so the original is untouched. */
function library(directory) {
  const source = join(directory, "sessions.db");
  if (!existsSync(source)) return { present: false };
  const scratch = mkdtempSync(join(tmpdir(), "retired-sessions-"));
  try {
    for (const suffix of ["", "-wal", "-shm"]) if (existsSync(source + suffix)) copyFileSync(source + suffix, join(scratch, `sessions.db${suffix}`));
    const db = new DatabaseSync(join(scratch, "sessions.db"), { readOnly: true });
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => row.name);
      return { present: true, user_version: db.prepare("PRAGMA user_version").get().user_version,
        tables: Object.fromEntries(tables.map(name => [name, db.prepare(`SELECT COUNT(*) AS n FROM "${name.replaceAll('"', '""')}"`).get().n])) };
    } finally { db.close(); }
  } catch (error) { return { present: true, unreadable: String(error instanceof Error ? error.message : error) }; }
  finally { rmSync(scratch, { recursive: true, force: true }); }
}

export function report(home) {
  const directory = join(resolve(home), "sessions");
  if (!existsSync(directory)) return { directory, present: false };
  const files = listing(directory);
  const blocks = files.filter(file => file.path.startsWith(join("content", "blobs") + "/"));
  return { directory, present: true, files: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    library: library(directory), content_blocks: { files: blocks.length, bytes: blocks.reduce((sum, file) => sum + file.bytes, 0) },
    content_key: files.some(file => file.path === join("content", "content.key")), links: files.filter(file => file.link).map(file => file.path),
    newest_change: files.map(file => file.modified).sort().at(-1) ?? null };
}

/** Refusals come first and are named; the removal itself is one recursive delete of the one directory. */
export function remove(home, { apply = false, confirm = "", now = Date.now() } = {}) {
  const summary = report(home);
  if (!summary.present) return { ...summary, removed: false, reason: "there is no sessions directory" };
  const stat = lstatSync(summary.directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) return { ...summary, removed: false, reason: "the sessions entry is not a real directory" };
  if (summary.links.length) return { ...summary, removed: false, reason: `links inside the directory: ${summary.links.join(", ")}` };
  const recent = summary.newest_change && now - Date.parse(summary.newest_change) < QUIET_SECONDS * 1000;
  if (!apply) return { ...summary, removed: false, reason: "dry run: nothing was removed; --apply with --confirm removes the directory" };
  if (confirm !== realpathSync(summary.directory)) return { ...summary, removed: false, reason: `--confirm must be exactly ${realpathSync(summary.directory)}` };
  if (recent) return { ...summary, removed: false, reason: `something in it changed in the last ${QUIET_SECONDS} seconds: stop Molis Work first` };
  rmSync(summary.directory, { recursive: true });
  return { ...summary, removed: true };
}

function argument(name) {
  const at = process.argv.indexOf(name);
  return at < 0 ? undefined : process.argv[at + 1];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2], home = argument("--home");
  if (!["report", "remove"].includes(command) || !home) {
    process.stderr.write("usage: retired-sessions-store.mjs report|remove --home <Home> [--apply --confirm <directory>]\n");
    process.exit(2);
  }
  const result = command === "report" ? report(home) : remove(home, { apply: process.argv.includes("--apply"), confirm: argument("--confirm") ?? "" });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  // A refused --apply is a failure; nothing to remove, or a dry run, is not.
  process.exit(command === "remove" && process.argv.includes("--apply") && result.present && !result.removed ? 1 : 0);
}
