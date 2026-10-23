import { PROJECT_ROOT_REFERENCE, pluginProjectDatabaseErrors, type PluginProjectDatabaseRecord } from "./project-database.js";
import type { PluginRuntimeDatabase } from "./repository.js";

// Every statement a plugin runs in a project's library, checked against what the ledger says is its own (PLIB-06,
// specs/plugin-project-database §2.4). The Host's SQLite library has no authorizer, so the check reads the statement's program:
// `EXPLAIN` lists every step SQLite will take, foreign-key and cascade sub-programs included, and a statement is refused for a
// step outside the list below, a b-tree that is not the plugin's own (beside the project's root row, which it may read), a
// database other than the library itself, a write step in a read, or a virtual table other than the two JSON functions.
// It comes after the client's keyword filters (a read is `SELECT` or `WITH`, a write `INSERT`, `UPDATE` or `DELETE`), never in
// their place: SQLite applies some statements while it prepares them, before any step runs (a pragma that sets a flag, `REINDEX`),
// and `EXPLAIN` prepares the statement on the connection itself.
//
// A statement also runs on the Host's own thread, and neither SQLite driver the Host has can interrupt one that is running, so a
// recursive query (a CTE that reads itself, with or without the `RECURSIVE` keyword) is refused: nothing bounds how long it goes
// on (specs/repository-anti-corruption/slices/sandbox-project-database-limits.md). `EXPLAIN QUERY PLAN` names it; a step list does not.

/** The SQLite the step list was read against. A Host on another version refuses every statement until the list is read again. */
export const PLUGIN_STATEMENT_SQLITE_VERSION = "3.51.3";

export type PluginStatementMode = "read" | "write";

/** Steps that compute, jump, or work through cursors the checked steps opened (and private sorters and scratch tables). */
const STEPS = new Set([
  "Init", "Goto", "Gosub", "Return", "InitCoroutine", "Yield", "EndCoroutine", "BeginSubrtn", "Once", "Jump", "If", "IfNot", "IsType",
  "Not", "IfNullRow", "IfPos", "IfNotZero", "DecrJumpZero", "IfNotOpen", "IfNoHope", "IfEmpty", "IfSizeBetween", "IsNull", "NotNull",
  "IsTrue", "ZeroOrNull", "Ne", "Eq", "Gt", "Le", "Lt", "Ge", "ElseEq", "Compare", "Permutation", "Or", "And", "BitAnd", "BitOr",
  "BitNot", "ShiftLeft", "ShiftRight", "Add", "Subtract", "Multiply", "Divide", "Remainder", "Concat", "MustBeInt", "RealAffinity",
  "Cast", "Affinity", "TypeCheck", "AddImm", "MemMax", "Offset", "OffsetLimit", "Integer", "Int64", "Real", "String", "String8",
  "Null", "SoftNull", "Blob", "Variable", "Param", "Move", "Copy", "SCopy", "IntCopy", "CollSeq", "Function", "PureFunc", "AggStep",
  "AggStep1", "AggInverse", "AggValue", "AggFinal", "ClrSubtype", "GetSubtype", "SetSubtype", "Filter", "FilterAdd", "ResultRow",
  "HaltIfNull", "Halt", "Abortable", "Noop", "ReleaseReg", "CursorHint", "ColumnsUsed", "OpenDup", "OpenAutoindex", "OpenEphemeral",
  "OpenPseudo", "SorterOpen", "Close", "Rewind", "Last", "Next", "Prev", "SeekLT", "SeekLE", "SeekGE", "SeekGT", "SeekScan", "SeekHit",
  "SeekEnd", "SeekRowid", "NotExists", "NoConflict", "NotFound", "Found", "DeferredSeek", "FinishSeek", "IdxLE", "IdxGT", "IdxLT",
  "IdxGE", "IdxRowid", "IdxInsert", "IdxDelete", "Column", "Rowid", "RowData", "RowCell", "NullRow", "Count", "MakeRecord",
  "NewRowid", "Insert", "Delete", "ResetCount", "Sequence", "SequenceTest", "SorterInsert", "SorterSort", "Sort", "SorterNext",
  "SorterData", "SorterCompare", "ResetSorter", "RowSetAdd", "RowSetRead", "RowSetTest", "FkCheck", "FkCounter", "FkIfZero",
  // A foreign key's action runs as a sub-program; `EXPLAIN` lists its steps after the main program, and they are checked the same.
  "Program",
  // Cursors over a virtual table that `VOpen` opened, and only `VOpen` is checked: it must be one of the JSON functions.
  "VFilter", "VColumn", "VNext", "VInitIn",
]);
/** Steps that name a b-tree by its root page, and where they keep it and the database it is in. */
const ROOTED: Readonly<Record<string, { readonly page: "p1" | "p2"; readonly database: "p2" | "p3"; readonly writes: boolean }>> = {
  OpenRead: { page: "p2", database: "p3", writes: false },
  ReopenIdx: { page: "p2", database: "p3", writes: false },
  OpenWrite: { page: "p2", database: "p3", writes: true },
  Clear: { page: "p1", database: "p2", writes: true },
};
/** `OpenRead`/`OpenWrite` with the root page in a register: only a statement that makes a table does that. */
const PAGE_IN_REGISTER = 0x10;
/** The table-valued functions a statement may read from: each reads only its argument. */
const FUNCTIONS = ["json_each", "json_tree"] as const;
/** What `EXPLAIN QUERY PLAN` calls the part of a recursive query that feeds on its own rows. */
const RECURSIVE_PLAN = "RECURSIVE STEP";

interface Step { readonly addr: number; readonly opcode: string; readonly p1: number; readonly p2: number; readonly p3: number; readonly p4: unknown; readonly p5: number }
interface Scope {
  /** Root pages of the plugin's tables and of every index on them, SQLite's own included. */
  readonly own: ReadonlySet<number>;
  /** Root pages of the project's root row and its indexes: read by a foreign key, or by the plugin. */
  readonly root: ReadonlySet<number>;
  readonly names: ReadonlyMap<number, string>;
}

/** SQLite folds only ASCII letters when it compares names. */
const fold = (name: string) => name.replace(/[A-Z]/gu, letter => letter.toLowerCase());

function scopeOf(connection: PluginRuntimeDatabase, record: PluginProjectDatabaseRecord): Scope {
  const objects = new Set(record.objects.map(fold)), own = new Set<number>(), root = new Set<number>(), names = new Map<number, string>([[1, "sqlite_schema"]]);
  const rows = connection.prepare("SELECT name, tbl_name, rootpage FROM main.sqlite_schema WHERE type IN ('table', 'index')").all() as Array<{ name: string; tbl_name: string; rootpage: number }>;
  for (const row of rows) {
    const page = Number(row.rootpage);
    if (!page) continue;
    names.set(page, row.name);
    if (objects.has(fold(row.tbl_name))) own.add(page);
    else if (fold(row.tbl_name) === PROJECT_ROOT_REFERENCE.table) root.add(page);
  }
  return { own, root, names };
}

/** What this connection's `EXPLAIN` shows for a JSON function's cursor: SQLite keeps one instance of each for the connection's life. */
function functionInstance(connection: PluginRuntimeDatabase, name: (typeof FUNCTIONS)[number]): string {
  const step = (connection.prepare(`EXPLAIN SELECT * FROM ${name}('[]')`).all() as Step[]).find(item => item.opcode === "VOpen");
  if (!step) throw new Error(`SQLite 的 ${name} 不是虚表，逐句检查要重新核对`);
  return String(step.p4);
}

/** Whether the statement reads a CTE that reads itself; its row count, and so its running time, is not bounded by the library's data. */
function recurses(connection: PluginRuntimeDatabase, sql: string, parameters: readonly unknown[]): boolean {
  return (connection.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...parameters) as Array<{ detail: string }>).some(row => row.detail === RECURSIVE_PLAN);
}

function refusal(steps: readonly Step[], mode: PluginStatementMode, scope: Scope, functions: ReadonlySet<string>): string | null {
  for (const step of steps) {
    const rooted = ROOTED[step.opcode];
    if (rooted) {
      if (step.opcode !== "Clear" && (Number(step.p5) & PAGE_IN_REGISTER)) return `第 ${step.addr} 步 ${step.opcode} 要建表`;
      if (Number(step[rooted.database]) !== 0) return "只能用项目库本身，不能用 temp 或附加的库";
      if (rooted.writes && mode === "read") return "读取里不能写";
      const page = Number(step[rooted.page]);
      if (scope.own.has(page) || (!rooted.writes && scope.root.has(page))) continue;
      const name = scope.names.get(page) ?? `第 ${page} 页`;
      return rooted.writes ? `只能写本插件自己的表，${name} 不是` : `只能读本插件自己的表和 ${PROJECT_ROOT_REFERENCE.table}，${name} 不是`;
    }
    if (step.opcode === "Transaction") {
      if (Number(step.p1) !== 0) return "只能用项目库本身，不能用 temp 或附加的库";
      if (mode === "read" && Number(step.p2) !== 0) return "读取里不能写";
    } else if (step.opcode === "VOpen") {
      if (!functions.has(String(step.p4))) return `虚表只能读 ${FUNCTIONS.join("、")}`;
    } else if (!STEPS.has(step.opcode)) return `第 ${step.addr} 步 ${step.opcode} 不是插件语句能有的步骤`;
  }
  return null;
}

/**
 * The check for one plugin on one connection to the library, run after the keyword filters and before each of its statements,
 * with the statement's own parameters: a refusal throws `plugin.project_database.statement_refused` and the statement does not
 * run. What a statement can reach depends only on its text and the library's schema, so a statement that passed is not read
 * again until the schema changes.
 */
export function pluginStatementGuard(connection: PluginRuntimeDatabase, record: PluginProjectDatabaseRecord):
  (sql: string, parameters: readonly unknown[], mode: PluginStatementMode) => void {
  const { version } = connection.prepare("SELECT sqlite_version() AS version").get() as { version: string };
  if (version !== PLUGIN_STATEMENT_SQLITE_VERSION) {
    throw pluginProjectDatabaseErrors.statement_refused(`逐句检查按 SQLite ${PLUGIN_STATEMENT_SQLITE_VERSION} 写成，宿主的是 ${version}，要重新核对后才能用`);
  }
  const functions = new Set(FUNCTIONS.map(name => functionInstance(connection, name)));
  const passed = new Set<string>();
  let schema: number | undefined, scope: Scope | undefined;
  return (sql, parameters, mode) => {
    const current = Number((connection.prepare("PRAGMA schema_version").get() as { schema_version: number }).schema_version);
    if (current !== schema) { schema = current; scope = undefined; passed.clear(); }
    const key = `${mode}\0${sql}`;
    if (passed.has(key)) return;
    scope ??= scopeOf(connection, record);
    const reason = refusal(connection.prepare(`EXPLAIN ${sql}`).all(...parameters) as Step[], mode, scope, functions);
    if (reason) throw pluginProjectDatabaseErrors.statement_refused(`插件 ${record.plugin_id} 在项目库里的语句被拒：${reason}`);
    if (recurses(connection, sql, parameters)) {
      throw pluginProjectDatabaseErrors.statement_refused(`插件 ${record.plugin_id} 在项目库里的语句被拒：递归查询没有时间上限，请分层查询`);
    }
    passed.add(key);
  };
}
