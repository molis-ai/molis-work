#!/usr/bin/env node
// PG-094 S13 (specs/repository-anti-corruption/slices/goals-s10-s11-runtime-switch.md §5.3): moves the person's planning methods from the
// project catalog (`projects/catalog.db`, table `personal_planning_method_packs`) to Goals' own library in the Home (`goals/goals.db`).
//
//   node scripts/maintenance/goals-personal-planning-move.mjs list --home <dir>
//   node scripts/maintenance/goals-personal-planning-move.mjs move --home <dir> [--maintenance-window]
//
// `list` reads and writes nothing. `move` reads every row, writes them to the Home library (created at the baseline Goals declares, by the
// same function the platform opens it with), reads them back and compares each column, and only then drops the catalog's table in one
// transaction. Run again, it finds no table and changes nothing. A Home that is not under the system's temp directory is a real one:
// `move` then needs `--maintenance-window` (the person has stopped Molis Work) and refuses while another process holds the catalog.
//
// The catalog's table is the one thing every Home made before Goals ran as a Runtime plugin still has, so it is also what stops that build
// from opening such a Home before the other maintenance is done: Goals' old event, idempotency and ledger names in the project libraries
// (`goals-journal-names.mjs rename`, S9-2). `move` therefore writes nothing and keeps the table while any library still holds them.
import { existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { pendingGoalsNames } from "./goals-journal-names.mjs";
import { validatePlanningCatalog, validatePlanningHome } from "../../tests/fixtures/catalog-maintenance-checks.mjs";

const TABLE = "personal_planning_method_packs";
const COLUMNS = ["method_id", "version", "enabled", "pack_json", "created_at", "updated_at"];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const load = specifier => import(pathToFileURL(path.join(root, specifier)).href);

function fail(message) {
  console.error(`goals-personal-planning-move: ${message}`);
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
  if (!["list", "move"].includes(command ?? "")) fail("用法: list|move --home <目录> [--maintenance-window]");
  if (!options.home) fail("必须用 --home 指明 Home 目录，不猜默认位置");
  return options;
}

const insideTemp = home => {
  const temp = realpathSync(tmpdir());
  const resolved = existsSync(home) ? realpathSync(home) : path.resolve(home);
  return resolved === temp || resolved.startsWith(temp + path.sep);
};

function readRows(catalog) {
  if (!catalog.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(TABLE)) return null;
  return catalog.prepare(`SELECT ${COLUMNS.join(", ")} FROM ${TABLE} ORDER BY method_id`).all().map(row => ({ ...row }));
}

const sameRow = (left, right) => COLUMNS.every(column => left[column] === right[column]);

async function main() {
  const options = parse(process.argv.slice(2));
  const home = path.resolve(options.home);
  const catalogPath = path.join(home, "projects", "catalog.db");
  if (!existsSync(catalogPath)) return console.log("没有项目目录库，什么都没改。");

  const { LocalCatalogMetadata, openBaselineHomeSqlite } = await load("packages/storage/dist/index.js");
  const { isOwnedCatalogOwner } = await load("apps/local-host/dist/project-catalog-contract.js");
  const { GOALS_HOME_DATABASE } = await load("plugins/native/goals/dist/home-database.js");

  const catalog = new DatabaseSync(catalogPath, { readOnly: options.command === "list" });
  try {
    if (!isOwnedCatalogOwner(new LocalCatalogMetadata(catalog).owner())) fail(`${catalogPath} 不是 Molis Work 的项目目录库，不动它`);
    const personal = Boolean(catalog.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(TABLE));
    validatePlanningCatalog(catalog, personal);
    const targetFile = path.join(home, "goals", "goals.db");
    if (existsSync(targetFile)) {
      const existing = new DatabaseSync(targetFile, { readOnly: true });
      try { validatePlanningHome(existing); } finally { existing.close(); }
    }
    if (!personal) {
      // No table is left to hold the refusal, so the other maintenance would go unnoticed: say it here.
      const left = pendingGoalsNames(home);
      if (left.length > 0) fail(`目录库里已经没有个人规划表，但 ${left.length} 个项目库里还留着 Goals 的旧名：运行 node scripts/maintenance/goals-journal-names.mjs rename --home <Home 目录> --maintenance-window`);
      return console.log("目录库里已经没有个人规划表，什么都没改。");
    }
    if (options.command === "list") {
      const count = catalog.prepare(`SELECT count(*) AS n FROM ${TABLE}`).get().n;
      console.log(`目录库里有 ${count} 条个人规划方法；list 不读取或打印正文与方法编号。`);
      return;
    }
    const rows = readRows(catalog);

    if (!insideTemp(home)) {
      if (!options.window) fail("这是真实 Home：先退出 Molis Work，再加 --maintenance-window 运行");
      try { catalog.exec("PRAGMA busy_timeout = 0; BEGIN EXCLUSIVE; ROLLBACK;"); }
      catch { fail("目录库正被别的进程占用，先退出 Molis Work"); }
    }

    const unnamed = pendingGoalsNames(home);
    if (unnamed.length > 0) {
      fail(`${unnamed.length} 个项目库里还留着 Goals 的旧名（${unnamed.map(library => library.project).join("、")}）：先运行 node scripts/maintenance/goals-journal-names.mjs rename --home <Home 目录> --maintenance-window，再重新运行 move；这次什么都没写，目录库的表还在`);
    }

    const target = openBaselineHomeSqlite(home, "goals", { version: GOALS_HOME_DATABASE.version, schema: GOALS_HOME_DATABASE.schema });
    try {
      validatePlanningHome(target);
      target.exec("BEGIN IMMEDIATE");
      try {
        const beforeCount = Number(target.prepare(`SELECT count(*) AS n FROM ${TABLE}`).get().n); let inserted = 0;
        for (const row of rows) {
          const existing = target.prepare(`SELECT ${COLUMNS.join(", ")} FROM ${TABLE} WHERE method_id = ?`).get(row.method_id);
          if (existing) {
            if (!sameRow({ ...existing }, row)) throw new Error(`Home 的 Goals 库里已有不同的 ${row.method_id}，不覆盖`);
            continue;
          }
          inserted += Number(target.prepare(`INSERT INTO ${TABLE} (${COLUMNS.join(", ")}) VALUES (?, ?, ?, ?, ?, ?)`).run(...COLUMNS.map(column => row[column])).changes);
        }
        for (const row of rows) {
          const written = target.prepare(`SELECT ${COLUMNS.join(", ")} FROM ${TABLE} WHERE method_id = ?`).get(row.method_id);
          if (!written || !sameRow({ ...written }, row)) throw new Error("Goals 目标库读回与源记录不一致，不提交");
        }
        if (Number(target.prepare(`SELECT count(*) AS n FROM ${TABLE}`).get().n) !== beforeCount + inserted) throw new Error("Goals 目标库行数不符，不提交");
        validatePlanningHome(target);
        target.exec("COMMIT");
      } catch (error) { target.exec("ROLLBACK"); throw error; }
    } finally { target.close(); }

    catalog.exec("BEGIN IMMEDIATE");
    try { validatePlanningCatalog(catalog, true); catalog.exec(`DROP TABLE ${TABLE}`); validatePlanningCatalog(catalog, false); catalog.exec("COMMIT"); }
    catch (error) {
      if (catalog.isTransaction) catalog.exec("ROLLBACK");
      throw new Error("部分成功：Goals 目标库已提交，目录库旧表仍保留。停止并报统筹；不自动重试或撤销目标库。", { cause: error });
    }
    console.log(`已把 ${rows.length} 条个人规划方法搬到 ${path.join(home, "goals", "goals.db")}，并删除目录库里的表。`);
  } finally { catalog.close(); }
}

main().catch(error => fail(error instanceof Error ? error.message : String(error)));
