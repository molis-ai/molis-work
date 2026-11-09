// The SQLite compile options of the official Node build this repository locks (`.nvmrc`), recorded so a Node upgrade shows what
// changed (specs/sqlite-driver-switch §3.7, SQLD-04). On its own because the whole list is compared only on macOS, where it was read;
// the rest of the conformance cases run everywhere and stay in the product subset.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const OFFICIAL_LOCKED_NODE = process.release.sourceUrl?.startsWith("https://nodejs.org/") && process.version === `v${readFileSync(".nvmrc", "utf8").trim()}`;

/** The options of the official build this repository locks (`.nvmrc`), so a Node upgrade shows what changed. `COMPILER=` names the toolchain and says nothing about SQLite. */
const OFFICIAL_COMPILE_OPTIONS = [
  "ATOMIC_INTRINSICS=1", "DEFAULT_AUTOVACUUM", "DEFAULT_CACHE_SIZE=-2000", "DEFAULT_FILE_FORMAT=4", "DEFAULT_JOURNAL_SIZE_LIMIT=-1", "DEFAULT_MEMSTATUS=0",
  "DEFAULT_MMAP_SIZE=0", "DEFAULT_PAGE_SIZE=4096", "DEFAULT_PCACHE_INITSZ=20", "DEFAULT_RECURSIVE_TRIGGERS", "DEFAULT_SECTOR_SIZE=4096", "DEFAULT_SYNCHRONOUS=2",
  "DEFAULT_WAL_AUTOCHECKPOINT=1000", "DEFAULT_WAL_SYNCHRONOUS=2", "DEFAULT_WORKER_THREADS=0", "DIRECT_OVERFLOW_READ", "ENABLE_COLUMN_METADATA", "ENABLE_DBSTAT_VTAB",
  "ENABLE_FTS3", "ENABLE_FTS3_PARENTHESIS", "ENABLE_FTS5", "ENABLE_GEOPOLY", "ENABLE_MATH_FUNCTIONS", "ENABLE_PREUPDATE_HOOK", "ENABLE_RBU", "ENABLE_RTREE", "ENABLE_SESSION",
  "MALLOC_SOFT_LIMIT=1024", "MAX_ATTACHED=10", "MAX_COLUMN=2000", "MAX_COMPOUND_SELECT=500", "MAX_DEFAULT_PAGE_SIZE=8192", "MAX_EXPR_DEPTH=1000", "MAX_FUNCTION_ARG=1000",
  "MAX_LENGTH=1000000000", "MAX_LIKE_PATTERN_LENGTH=50000", "MAX_MMAP_SIZE=0x7fff0000", "MAX_PAGE_COUNT=0xfffffffe", "MAX_PAGE_SIZE=65536", "MAX_SQL_LENGTH=1000000000",
  "MAX_TRIGGER_DEPTH=1000", "MAX_VARIABLE_NUMBER=32766", "MAX_VDBE_OP=250000000", "MAX_WORKER_THREADS=8", "MUTEX_PTHREADS", "SYSTEM_MALLOC", "TEMP_STORE=1", "THREADSAFE=1",
];

test("SQLD-04 the official build's compile options, recorded", t => {
  const db = new DatabaseSync(":memory:");
  const options = (db.prepare("PRAGMA compile_options").all() as { compile_options: string }[]).map(row => row.compile_options).filter(option => !option.startsWith("COMPILER="));
  db.close();
  if (!OFFICIAL_LOCKED_NODE) { t.diagnostic(`this Node ${process.version} is not the locked official build`); return; }
  // On every platform: what the code relies on. On the macOS build these were read from: the whole list.
  for (const needed of ["ENABLE_FTS5", "ENABLE_MATH_FUNCTIONS", "DEFAULT_MEMSTATUS=0"]) assert.ok(options.includes(needed), needed);
  if (process.platform === "darwin") assert.deepEqual(options, OFFICIAL_COMPILE_OPTIONS);
});
