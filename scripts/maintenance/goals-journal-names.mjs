#!/usr/bin/env node
// PG-094 S9-2 (specs/repository-anti-corruption/slices/goals-s10-s11-runtime-switch.md §5.3): puts Goals' id on the old, bare names it
// left in the project libraries before it ran as a Plugin Runtime plugin, so its history, cursor and idempotency records are still its own.
//
//   node scripts/maintenance/goals-journal-names.mjs list   --home <dir>
//   node scripts/maintenance/goals-journal-names.mjs rename --home <dir> [--maintenance-window]
//
// Goals now reads and writes the shared journal and the Context Ledger only through the platform's bindings, which store every name it
// writes as `io.molis.work.goals:<name>` and show it nothing else. What an older build wrote has the bare name, so without this the rows
// stay in the library but Goals cannot see them: the event history and the event cursor, the idempotency records (a retry with an old key
// would run again), and the edges of its inputs and deliverables. Nothing reads the old names at run time; this is the one place.
//
// `list` reads and writes nothing. `rename` goes project by project (`projects/<id>/molis-work.db`), one transaction each: it renames the
// rows below, reads the library back, and only then commits; a library where a name is already taken is left as it was. Run again, it finds
// nothing and changes nothing. A Home that is not under the system's temp directory is a real one: `rename` then needs
// `--maintenance-window` (the person has stopped Molis Work) and refuses a library another process holds.
import { existsSync, lstatSync, readdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { validateProject } from "../../tests/fixtures/project-maintenance.mjs";

export const GOALS_PLUGIN_ID = "io.molis.work.goals";
/** The name a plugin's rows carry in the shared tables: its id and a colon (`apps/local-host/src/plugin-namespace.ts`). */
export const NAMESPACE = `${GOALS_PLUGIN_ID}:`;
/** What Goals and Governance wrote in an event's `object_type`; every Goals event has one of these and no other writer uses them. */
export const EVENT_OBJECT_TYPES = ["board", "goal", "goal_event_config", "goal_tree_proposal", "goal_tree_proposal_item", "goal_work_event",
  "planning_method", "policy_binding", "project_guidance", "relation"];
/** Goals' Context Ledger edges: the input and deliverable links of a Goal and their proposals (`deliverable-actions.ts`). */
export const EDGE_RELATION_TYPES = ["goal.input", "goal.input.proposal", "goal.output", "goal.output.proposal"];

const marks = list => list.map(() => "?").join(", ");
const TABLES = ["events", "idempotency_records", "context_edges", "project_root"];

/** What is still bare in one library, by the three tables; `null` for a database that is not a Molis Work project library. */
export function pendingIn(db) {
  const version = Number(db.prepare("PRAGMA user_version").get().user_version);
  validateProject(db, version);
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name));
  if (!TABLES.filter(name => name !== "project_root").every(name => tables.has(name)) || !tables.has(version === 7 ? "boards" : "project_root")) return null;
  const count = (sql, ...values) => Number(db.prepare(sql).get(...values).n);
  return {
    events: count(`SELECT COUNT(*) AS n FROM events WHERE object_type IN (${marks(EVENT_OBJECT_TYPES)})`, ...EVENT_OBJECT_TYPES),
    idempotency: count("SELECT COUNT(*) AS n FROM idempotency_records WHERE instr(operation, ':') = 0"),
    edges: count(`SELECT COUNT(*) AS n FROM context_edges WHERE relation_type IN (${marks(EDGE_RELATION_TYPES)}) AND substr(edge_key, 1, ?) <> ?`,
      ...EDGE_RELATION_TYPES, NAMESPACE.length, NAMESPACE),
  };
}

const total = pending => pending.events + pending.idempotency + pending.edges;

/** The project libraries of a Home: `projects/<id>/molis-work.db`, staging and backup directories (dot-named) left out. */
export function projectLibraries(home) {
  const projects = path.join(home, "projects");
  if (!existsSync(projects)) return [];
  return readdirSync(projects, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith("."))
    .map(entry => ({ project: entry.name, file: path.join(projects, entry.name, "molis-work.db") }))
    .filter(library => {
      if (!existsSync(library.file)) return false;
      const file = lstatSync(library.file);
      if (!file.isFile() || file.nlink !== 1) throw new Error("project library must be an ordinary unlinked file");
      return true;
    });
}

/** Every library of the Home that still holds bare Goals names: `[{ project, file, pending }]`, read only. */
export function pendingGoalsNames(home) {
  const found = [];
  for (const library of projectLibraries(home)) {
    const db = new DatabaseSync(library.file, { readOnly: true });
    try {
      const pending = pendingIn(db);
      if (pending && total(pending) > 0) found.push({ ...library, pending });
    } finally { db.close(); }
  }
  return found;
}

function renameIn(db) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const counts = validateProject(db, 11), before = pendingIn(db);
    if (!before || total(before) === 0) { db.exec("ROLLBACK"); return null; }
    db.prepare(`UPDATE events SET type = ? || type, object_type = ? || object_type WHERE object_type IN (${marks(EVENT_OBJECT_TYPES)})`)
      .run(NAMESPACE, NAMESPACE, ...EVENT_OBJECT_TYPES);
    db.prepare("UPDATE idempotency_records SET operation = ? || operation WHERE instr(operation, ':') = 0").run(NAMESPACE);
    db.prepare(`UPDATE context_edges SET edge_key = ? || edge_key WHERE relation_type IN (${marks(EDGE_RELATION_TYPES)}) AND substr(edge_key, 1, ?) <> ?`)
      .run(NAMESPACE, ...EDGE_RELATION_TYPES, NAMESPACE.length, NAMESPACE);
    const after = pendingIn(db);
    if (total(after) !== 0) throw new Error("改名之后还有没改到的行，没有提交");
    const afterCounts = validateProject(db, 11);
    if (Object.entries(counts).some(([table, count]) => afterCounts[table] !== count)) throw new Error("row count changed; nothing committed");
    db.exec("COMMIT");
    return before;
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

function fail(message) {
  console.error(`goals-journal-names: ${message}`);
  process.exit(1);
}

function parse(argv) {
  const [command, ...rest] = argv;
  const options = { command, home: null, window: false };
  for (let index = 0; index < rest.length; index++) {
    if (rest[index] === "--home") options.home = rest[++index] ?? null;
    else if (rest[index] === "--maintenance-window") options.window = true;
    else fail(`不认识的参数 ${rest[index]}`);
  }
  if (!["list", "rename"].includes(command ?? "")) fail("用法: list|rename --home <目录> [--maintenance-window]");
  if (!options.home) fail("必须用 --home 指明 Home 目录，不猜默认位置");
  return options;
}

const insideTemp = home => {
  const temp = realpathSync(tmpdir());
  const resolved = existsSync(home) ? realpathSync(home) : path.resolve(home);
  return resolved === temp || resolved.startsWith(temp + path.sep);
};

const describe = pending => `事件 ${pending.events}、幂等记录 ${pending.idempotency}、引用关系 ${pending.edges}`;

function main() {
  const options = parse(process.argv.slice(2));
  const home = path.resolve(options.home);
  if (options.command === "list") {
    const found = pendingGoalsNames(home);
    if (found.length === 0) return console.log("没有项目库里还留着 Goals 的旧名，什么都没改。");
    console.log(`${found.length} 个项目库里还留着 Goals 的旧名:`);
    for (const library of found) console.log(`  ${library.project}  ${describe(library.pending)}`);
    return;
  }

  const real = !insideTemp(home);
  if (real && !options.window) fail("这是真实 Home：先退出 Molis Work，再加 --maintenance-window 运行");
  const found = pendingGoalsNames(home);
  if (found.length === 0) return console.log("没有项目库里还留着 Goals 的旧名，什么都没改。");
  for (const library of found) {
    const db = new DatabaseSync(library.file);
    try {
      if (real) {
        try { db.exec("PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE; ROLLBACK;"); }
        catch { fail(`项目库 ${library.project} 正被别的进程占用，先退出 Molis Work；已处理的项目库保持改好的样子，再运行一次接着做`); }
      }
      const done = renameIn(db);
      if (done) console.log(`${library.project}: 已改 ${describe(done)}`);
    } catch (error) {
      fail(`项目库 ${library.project} 没有改动: ${error instanceof Error ? error.message : String(error)}`);
    } finally { db.close(); }
  }
  console.log(`已处理 ${found.length} 个项目库。`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(); } catch (error) { fail(error instanceof Error ? error.message : String(error)); }
}
