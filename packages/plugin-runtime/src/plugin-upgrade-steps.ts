import { rollbackPreservingError } from "@molis-ai/molis-work-plugin-sdk";
import { ActionError, defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabaseDeclaration, PluginManifest, PluginSqlValue } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginTrustLevel } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import { canonicalJsonText } from "@molis-ai/molis-work-plugin-sdk";
import { inspectPluginProjectSchema, platformDeclaration, pluginProjectDatabaseErrors, statements, type DeclaredSchema, type PluginProjectSchemaInspector } from "./project-database.js";
import type { PluginRuntimeDatabase } from "./repository.js";

// A plugin's upgrade steps (specs/upgrade-continuity/upgrade-chain-design.md §2.4, S-147): SQL from its Manifest that takes its tables from
// one version to the next, in a project's library or in its own library of the Home. Every plugin's steps go through the same three layers
// and the same run; the one difference is the switch below, which refuses an installed plugin's steps until U4. Nothing here knows the Host:
// SQLite is lent, with its authorizer, through `PluginUpgradeInspector`, and the run takes one connection the caller opened and will close.
//
// 1. When the steps are declared, by their shape only: each statement is one a step may be, read word by word.
// 2. When a statement runs, SQLite's own authorizer over the tables this plugin has at that moment: a schema change may touch only those,
//    a statement of rows only their rows, by deterministic SQL.
// 3. Before the commit, the library as a whole: nothing of anyone else changed, and this plugin's tables are exactly what its declaration makes.

export const pluginUpgradeErrors = defineErrorCodes("plugin", {
  /** An installed plugin declared upgrade steps; until U4 only a plugin of the Host's own build may (user 2026-11-06). */
  upgrade_steps_unsupported: "invalid",
});

/** SQLite folds only ASCII letters when it compares names. */
const fold = (name: string) => name.replace(/[A-Z]/gu, letter => letter.toLowerCase());
const canonical = (value: unknown) => canonicalJsonText(value, "null");
const quoted = (name: string) => `"${name.replaceAll('"', '""')}"`;

// ---- Layer 1: the shape of each statement. ----

type Token = { readonly kind: "word"; readonly folded: string } | { readonly kind: "name" } | { readonly kind: "literal" } | { readonly kind: "symbol"; readonly text: string };

/** What SQLite takes as white space. JavaScript's `\s` takes more (U+00A0 among them), which SQLite reads as part of a name. */
const SPACE = new Set([" ", "\t", "\n", "\f", "\r"]);
const NAME_QUOTES: Readonly<Record<string, string>> = { '"': '"', "`": "`", "[": "]" };

/** Where the quoted text at `at` ends, after its closing quote; a doubled quote stays inside it, and `[…]` has no such escape. -1: never closed. */
function afterQuote(text: string, at: number, close: string): number {
  for (let index = text.indexOf(close, at + 1); index >= 0; index = text.indexOf(close, index + 2)) {
    if (close === "]" || text[index + 1] !== close) return index + 1;
  }
  return -1;
}

/**
 * The words of one statement, straight from its text: comments skipped, the four kinds of quoted name kept as names, a word only of ASCII
 * letters, digits, `_` and `$`. Anything else outside quotes (a letter that is not ASCII, a control character) cannot be read, because SQLite
 * would read it as part of a name: such a name has to be quoted. Stricter than SQLite on purpose.
 */
function words(text: string): Token[] | undefined {
  const found: Token[] = [];
  for (let at = 0; at < text.length;) {
    const character = text[at]!;
    if (SPACE.has(character)) { at += 1; continue; }
    if (character === "-" && text[at + 1] === "-") { const end = text.indexOf("\n", at); at = end < 0 ? text.length : end + 1; continue; }
    if (character === "/" && text[at + 1] === "*") { const end = text.indexOf("*/", at + 2); if (end < 0) return undefined; at = end + 2; continue; }
    if (character === "'" || character in NAME_QUOTES) {
      const end = afterQuote(text, at, character === "'" ? "'" : NAME_QUOTES[character]!);
      if (end < 0) return undefined;
      found.push(character === "'" ? { kind: "literal" } : { kind: "name" });
      at = end;
      continue;
    }
    if (/[A-Za-z_0-9]/u.test(character)) {
      let end = at + 1;
      while (end < text.length && /[A-Za-z0-9_$]/u.test(text[end]!)) end += 1;
      found.push(/[0-9]/u.test(character) ? { kind: "literal" } : { kind: "word", folded: fold(text.slice(at, end)) });
      at = end;
      continue;
    }
    if (character < " " || character > "~") return undefined;
    found.push({ kind: "symbol", text: character });
    at += 1;
  }
  return found;
}

/** A statement of a step, by what the second layer has to ask about it. */
export interface PluginUpgradeStatement { readonly kind: "schema" | "rows"; readonly text: string }

/**
 * Which statement a step may hold, by its shape (§2.4, first layer). `INSERT`, `UPDATE` and `DELETE` are not read further: the second layer
 * asks SQLite what they would touch. A schema change must be one of a few exact shapes, so a library's name before a table's (`main . t`),
 * `IF [NOT] EXISTS` (an unquoted `IF` where a name goes), `AS SELECT`, and every other kind of statement are not.
 */
function shapeOf(text: string): PluginUpgradeStatement["kind"] | undefined {
  const tokens = words(text);
  if (!tokens?.length) return undefined;
  const word = (at: number, ...candidates: string[]) => { const token = tokens[at]; return token?.kind === "word" && candidates.includes(token.folded); };
  const symbol = (at: number, text: string) => { const token = tokens[at]; return token?.kind === "symbol" && token.text === text; };
  const name = (at: number) => {
    const token = tokens[at];
    return (token?.kind === "name" || (token?.kind === "word" && token.folded !== "if")) && !symbol(at + 1, ".");
  };
  const last = (at: number) => at === tokens.length;
  if (word(0, "insert", "update", "delete")) return "rows";
  if (word(0, "alter") && word(1, "table") && name(2)) {
    const column = (at: number) => (word(at, "column") ? at + 1 : at);
    if (word(3, "add")) return name(column(4)) ? "schema" : undefined;
    if (word(3, "drop")) return name(column(4)) && last(column(4) + 1) ? "schema" : undefined;
    if (word(3, "rename") && word(4, "to")) return name(5) && last(6) ? "schema" : undefined;
    if (word(3, "rename")) { const at = column(4); return name(at) && word(at + 1, "to") && name(at + 2) && last(at + 3) ? "schema" : undefined; }
    return undefined;
  }
  if (word(0, "drop") && word(1, "table", "index")) return name(2) && last(3) ? "schema" : undefined;
  if (word(0, "create") && word(1, "table")) return name(2) && symbol(3, "(") ? "schema" : undefined;
  const index = word(1, "unique") ? 2 : 1;
  if (word(0, "create") && word(index, "index")) return name(index + 1) && word(index + 2, "on") && name(index + 3) && symbol(index + 4, "(") ? "schema" : undefined;
  return undefined;
}

export interface PluginUpgradeStepStatements {
  readonly from: number;
  readonly reduces_rows: readonly string[];
  readonly statements: readonly PluginUpgradeStatement[];
}

const outOfScope = (message: string) => pluginProjectDatabaseErrors.upgrade_out_of_scope(message);

/** The first layer over a declaration's steps: each statement read and sorted, or `plugin.project_database.upgrade_out_of_scope`. Runs no SQL. */
export function pluginUpgradeSteps(declaration: PluginDatabaseDeclaration): readonly PluginUpgradeStepStatements[] {
  return (declaration.upgrades ?? []).map(step => {
    if (!Number.isSafeInteger(step.from) || step.from < 1 || step.from >= declaration.version || typeof step.sql !== "string") {
      throw pluginProjectDatabaseErrors.declaration_invalid(`库 ${declaration.store_name} 有一段升级的 from 或 sql 不对`);
    }
    // The whole step is read first, word by word: `statements()` trims each statement as JavaScript does, and JavaScript takes U+00A0 for
    // white space where SQLite takes it for part of a name, so a statement must not end on one. Outside quotes and comments a step is ASCII.
    let parts: ReturnType<typeof statements> | undefined;
    try { parts = words(step.sql) ? statements(step.sql) : undefined; }
    catch { parts = undefined; }
    if (!parts) throw outOfScope(`库 ${declaration.store_name} 从第 ${step.from} 版起的升级段读不出来：有没闭合的引号或注释，或引号外有不是 ASCII 的字符（名字里有这种字符要加引号）`);
    if (parts.length === 0) throw outOfScope(`库 ${declaration.store_name} 从第 ${step.from} 版起的升级段没有语句`);
    return {
      from: step.from, reduces_rows: step.reduces_rows ?? [],
      statements: parts.map(({ text }, index) => {
        const kind = shapeOf(text);
        if (!kind) {
          throw outOfScope(`库 ${declaration.store_name} 从第 ${step.from} 版起的升级段第 ${index + 1} 句不是升级段能写的语句：只能改、建、删这个插件自己的表和索引（不带库名、不写 IF [NOT] EXISTS），或增删改它们的行`);
        }
        return { kind, text };
      }),
    };
  });
}

// ---- The switch. ----

/**
 * The one place that tells a plugin of the Host's own build from an installed one about upgrade steps (§2.4; 2026-10-18 改, user 2026-11-06).
 * Every plugin's steps go through the first layer first, so a step no plugin may write is refused as that; then an installed plugin whose
 * Manifest declares `upgrades` at all is refused, until U4 lets installed plugins upgrade their tables. Called on install and on a version change.
 */
export function assertPluginUpgradeStepsAdmitted(manifest: PluginManifest, trust: PluginTrustLevel): void {
  const declarations = [manifest.databases?.project, manifest.databases?.home].filter((declaration): declaration is PluginDatabaseDeclaration => declaration !== undefined);
  for (const declaration of declarations) pluginUpgradeSteps(declaration);
  if (trust !== "host" && declarations.some(declaration => declaration.upgrades !== undefined)) {
    throw pluginUpgradeErrors.upgrade_steps_unsupported(`插件 ${manifest.plugin_id} 的 Manifest 写了升级段（databases 的 upgrades）。装上的插件现在还不能升级自己的表，去掉 upgrades 后再装`);
  }
}

// ---- Layers 2 and 3: the run. ----

/** One statement under SQLite's authorizer: `execute` runs while it is on, so what it prepares is asked about. */
export type PluginUpgradeExecution = <T>(sql: string, parameters: readonly PluginSqlValue[], mode: "read" | "write", execute: () => T) => T;

/**
 * What the Host lends a run, beside what it lends an open: SQLite's own authorizer over `tables`, the tables in scope at that statement,
 * for a statement of rows (storage's `nativeSqliteOwnerBoundary`) and for a schema change (`nativeSqliteSchemaBoundary`).
 */
export interface PluginUpgradeInspector extends PluginProjectSchemaInspector {
  rows(db: PluginRuntimeDatabase, tables: ReadonlySet<string>): PluginUpgradeExecution;
  schema(db: PluginRuntimeDatabase, tables: ReadonlySet<string>): PluginUpgradeExecution;
}

/**
 * The scalar functions whose answer differs from device to device (§2.4 point 5): what `pragma_function_list` marks as not deterministic on
 * SQLite 3.51.3, and the date and time functions it marks as deterministic though `'now'` or `'localtime'` reads the clock. A step's rows
 * change on every device by itself, never through a sync journal, so it must give every device the same rows.
 */
export const PLUGIN_UPGRADE_NONDETERMINISTIC_FUNCTIONS: ReadonlySet<string> = new Set([
  "bm25", "changes", "current_date", "current_time", "current_timestamp", "fts3_tokenizer", "fts5", "fts5_get_locale", "fts5_insttoken",
  "fts5_locale", "geopoly_debug", "highlight", "last_insert_rowid", "load_extension", "match", "matchinfo", "offsets", "optimize", "random",
  "randomblob", "rtreecheck", "rtreedepth", "rtreenode", "snippet", "sqlite_compileoption_get", "sqlite_compileoption_used",
  "sqlite_source_id", "sqlite_version", "total_changes",
  "date", "time", "datetime", "julianday", "unixepoch", "strftime", "timediff",
]);

type Reason = "missing_step" | "version_changed" | "begin_failed" | "foreign_keys_state" | "out_of_scope" | "nondeterministic" | "step_failed"
  | "transaction_ended" | "foreign_keys" | "structure" | "rows_reduced";

/** Fixed text only: what a step or SQLite said can quote the library's rows, so it travels as `cause`, never in the message. */
const REASONS: Readonly<Record<Reason, string>> = {
  missing_step: "缺少从这个版本起的升级段",
  version_changed: "升级途中版本变了",
  begin_failed: "拿不到写事务",
  foreign_keys_state: "外键开关没有切到要的状态",
  out_of_scope: "升级段碰了不归这个插件的表，或写了升级段不能写的语句",
  nondeterministic: "升级段用了每台设备结果不同的函数（时间、随机数）",
  step_failed: "升级段执行失败",
  transaction_ended: "升级段自己结束了事务",
  foreign_keys: "外键检查没有通过",
  structure: "升完的表、索引或触发器与声明不同",
  rows_reduced: "有表的行数变少了，而升级段没有声明",
};

interface Run {
  /** Which plugin and library, for messages: a label, never an absolute path. */
  readonly where: string;
  readonly from: number;
  readonly to: number;
  readonly steps: readonly PluginUpgradeStepStatements[];
  /** What the current declaration makes, the platform's objects and triggers with it. */
  readonly target: DeclaredSchema;
  /** The platform's technical tables of this plugin (folded), never in scope. */
  readonly technical: ReadonlySet<string>;
  /** Inside the transaction, before anything: the version is still `from`, and these are this plugin's tables now (folded). */
  readonly start: (db: PluginRuntimeDatabase) => ReadonlySet<string>;
  /** Inside the transaction, after every check: the new version is written. */
  readonly finish: (db: PluginRuntimeDatabase) => void;
}

const OWN = Symbol("plugin upgrade failure");

function failure(run: Pick<Run, "where" | "from" | "to">, reason: Reason, options: { readonly step?: number; readonly cause?: unknown } = {}): ActionError {
  const raise = reason === "out_of_scope" ? pluginProjectDatabaseErrors.upgrade_out_of_scope
    : reason === "nondeterministic" ? pluginProjectDatabaseErrors.upgrade_nondeterministic : pluginProjectDatabaseErrors.upgrade_failed;
  const error = raise(`${run.where} 从第 ${run.from} 版升到第 ${run.to} 版没有成功：${REASONS[reason]}。这个插件的表回到升级之前，只有它停用。`,
    { reason, from: run.from, to: run.to, ...(options.step === undefined ? {} : { step: options.step }) });
  // Not enumerable, as in `ActionError`'s own constructor, so serializing the error leaves out what the cause may quote.
  if (options.cause !== undefined) Object.defineProperty(error, "cause", { value: options.cause, writable: true, configurable: true });
  return Object.assign(error, { [OWN]: true });
}
const ownFailure = (error: unknown) => error instanceof ActionError && (Reflect.get(error, OWN) === true || error.code.startsWith("plugin.project_database."));
/** SQLite's own refusal (`SQLITE_AUTH`), or the boundary's before SQLite was asked. */
const refused = (error: unknown) => ((Number((error as { errcode?: unknown } | null)?.errcode) & 0xff) === 23)
  || (error instanceof ActionError && error.code === "actions.forbidden");

const readForeignKeys = (db: PluginRuntimeDatabase) => Number((db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys);

/** Only outside a transaction does the pragma take; inside one SQLite ignores it and says nothing, so it is read back. */
function switchForeignKeys(db: PluginRuntimeDatabase, value: 0 | 1, run: Run): void {
  db.exec(`PRAGMA foreign_keys = ${value}`);
  if (readForeignKeys(db) !== value) throw failure(run, "foreign_keys_state");
}

/** Driver-neutral: SQLite refuses a nested BEGIN and changes nothing. */
function transactionOpen(db: PluginRuntimeDatabase): boolean {
  try { db.exec("BEGIN"); }
  catch { return true; }
  db.exec("ROLLBACK");
  return false;
}

/** The tables of the library now, by folded name, beside SQLite's own. */
function tablesNow(db: PluginRuntimeDatabase): ReadonlyMap<string, string> {
  const rows = db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all() as Array<{ name: string }>;
  return new Map(rows.filter(({ name }) => !fold(name).startsWith("sqlite_")).map(({ name }) => [fold(name), name]));
}

/** §2.4 second layer, after each statement: every table there is now, but those that were someone else's when the run began. */
function scopeNow(db: PluginRuntimeDatabase, others: ReadonlySet<string>): ReadonlyMap<string, string> {
  return new Map([...tablesNow(db)].filter(([name]) => !others.has(name)));
}

/** What is not this plugin's in the schema table, as SQLite keeps it: belonging goes by the table an object is on, as the scope does. */
function othersOf(db: PluginRuntimeDatabase, scope: ReadonlySet<string>): string {
  const rows = db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_schema ORDER BY type, name").all() as Array<{ tbl_name: string }>;
  return canonical(rows.filter(row => !scope.has(fold(row.tbl_name))));
}

function countRows(db: PluginRuntimeDatabase, table: string): number {
  return Number((db.prepare(`SELECT count(*) AS n FROM ${quoted(table)}`).get() as { n: number | bigint }).n);
}

/** The steps from `found` to the declaration's version, in order, each through the first layer. */
function chain(declaration: PluginDatabaseDeclaration, found: number, run: Pick<Run, "where" | "from" | "to">): readonly PluginUpgradeStepStatements[] {
  const declared = new Map(pluginUpgradeSteps(declaration).map(step => [step.from, step]));
  const steps: PluginUpgradeStepStatements[] = [];
  for (let from = found; from < declaration.version; from += 1) {
    const step = declared.get(from);
    if (!step) throw failure(run, "missing_step", { step: from });
    steps.push(step);
  }
  return steps;
}

/**
 * One statement of a step, under the authorizer over the scope of that moment. It is first compiled without the authorizer, which runs
 * nothing: a statement that does not compile is the step's own failure, and one that compiles then but not under the authorizer was
 * refused by it, whatever code SQLite gives (a function it refuses comes back as `SQLITE_ERROR`). A statement of rows is also read for what
 * differs by device, before anything of it runs.
 */
function execute(db: PluginRuntimeDatabase, statement: PluginUpgradeStatement, scope: ReadonlyMap<string, string>, inspector: PluginUpgradeInspector, run: Run, step: number): void {
  let program: Array<{ opcode: string; p4: unknown }>;
  try { program = db.prepare(`EXPLAIN ${statement.text}`).all() as typeof program; }
  catch (cause) { throw failure(run, "step_failed", { step, cause }); }
  const clock = statement.kind === "rows" && program.some(({ opcode, p4 }) => opcode === "Function" && PLUGIN_UPGRADE_NONDETERMINISTIC_FUNCTIONS.has(fold(String(p4).replace(/\(.*$/su, ""))));
  if (clock) throw failure(run, "nondeterministic", { step });
  const tables = new Set(scope.values());
  const boundary = statement.kind === "schema" ? inspector.schema(db, tables) : inspector.rows(db, tables);
  try {
    boundary(statement.text, [], "write", () => {
      let prepared: ReturnType<PluginRuntimeDatabase["prepare"]>;
      try { prepared = db.prepare(statement.text); }
      catch (cause) { throw failure(run, "out_of_scope", { step, cause }); }
      prepared.run();
    });
  } catch (error) {
    if (ownFailure(error)) throw error;
    throw failure(run, refused(error) ? "out_of_scope" : "step_failed", { step, cause: error });
  }
}

/** §2.4 third layer: nothing of anyone else changed, and this plugin's objects are exactly what the declaration makes. */
function compare(db: PluginRuntimeDatabase, run: Run, scope: ReadonlyMap<string, string>, before: string, inspector: PluginUpgradeInspector): void {
  const final = new Set(scope.keys());
  if (othersOf(db, final) !== before) throw failure(run, "out_of_scope");
  const rows = db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_schema").all() as Array<{ type: string; name: string; tbl_name: string; sql: string | null }>;
  // The platform's triggers of this plugin may sit on a shared table of the platform (`events`, `context_edges`): they are its objects too,
  // kept as they were by the comparison above.
  const declared = new Set(run.target.objects);
  const mine = rows.filter(row => final.has(fold(row.tbl_name)) || run.technical.has(fold(row.tbl_name)) || declared.has(row.name));
  const objects = mine.filter(row => row.sql !== null && !fold(row.name).startsWith("sqlite_")).map(row => row.name).sort();
  const shape = inspector.shape(db).tables;
  // `AUTOINCREMENT` writes `sqlite_sequence`, which every table of the library shares; a declaration may not have it (PLIB-03), nor may a
  // step leave it on a table. The platform's own technical tables do have it.
  const autoincrement = mine.some(row => row.type === "table" && final.has(fold(row.tbl_name))
    && (words(row.sql ?? "") ?? []).some(token => token.kind === "word" && token.folded === "autoincrement"));
  if (canonical(objects) !== canonical([...run.target.objects].sort()) || autoincrement
    || run.target.tables.some(table => canonical(shape[table] ?? null) !== canonical(run.target.shape[table] ?? null))
    || [...run.target.triggers ?? []].some(([name, sql]) => rows.find(row => row.type === "trigger" && row.name === name)?.sql !== sql)) {
    throw failure(run, "structure");
  }
}

function inTransaction(db: PluginRuntimeDatabase, run: Run, inspector: PluginUpgradeInspector): void {
  try { db.exec("BEGIN IMMEDIATE"); }
  catch (cause) { throw failure(run, "begin_failed", { cause }); }
  try {
    const start = run.start(db);
    const others = new Set([...tablesNow(db).keys()].filter(name => !start.has(name)));
    const before = othersOf(db, start);
    const counts = new Map([...scopeNow(db, others)].map(([name, table]) => [name, countRows(db, table)]));
    // The platform's own statements, not the plugin's: triggers on these tables would stop a column from going, or be rewritten by a rename.
    const triggers = db.prepare("SELECT name, tbl_name FROM sqlite_schema WHERE type = 'trigger'").all() as Array<{ name: string; tbl_name: string }>;
    for (const { name } of triggers.filter(row => start.has(fold(row.tbl_name)))) db.exec(`DROP TRIGGER ${quoted(name)}`);
    for (const step of run.steps) for (const statement of step.statements) {
      const scope = scopeNow(db, others);
      execute(db, statement, scope, inspector, run, step.from);
      if (!transactionOpen(db)) throw failure(run, "transaction_ended", { step: step.from });
      // A renamed table keeps its rows: only `RENAME TO` takes one table away and gives one in a single statement.
      const after = scopeNow(db, others), gone = [...scope.keys()].filter(name => !after.has(name)), made = [...after.keys()].filter(name => !scope.has(name));
      if (gone.length === 1 && made.length === 1 && counts.has(gone[0]!) && !counts.has(made[0]!)) { counts.set(made[0]!, counts.get(gone[0]!)!); counts.delete(gone[0]!); }
    }
    // Only after the last step: a trigger of the current declaration may name a column an earlier version does not have yet.
    for (const [name, sql] of run.target.triggers ?? []) {
      if (!db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'trigger' AND name = ?").get(name)) db.exec(sql);
    }
    const final = scopeNow(db, others);
    for (const table of final.values()) if (db.prepare(`PRAGMA foreign_key_check(${quoted(table)})`).all().length) throw failure(run, "foreign_keys");
    compare(db, run, final, before, inspector);
    const reduces = new Set(run.steps.flatMap(step => step.reduces_rows).map(fold));
    for (const [name, count] of counts) {
      const after = final.has(name) ? countRows(db, final.get(name)!) : 0;
      if (after < count && !reduces.has(name)) throw failure(run, "rows_reduced");
    }
    run.finish(db);
    db.exec("COMMIT");
  } catch (error) {
    rollbackPreservingError(error, () => { if (transactionOpen(db)) db.exec("ROLLBACK"); });
    throw ownFailure(error) ? error : failure(run, "step_failed", { cause: error });
  }
}

/**
 * The run both kinds of library share (§2.4). Foreign keys go off outside the transaction, so a rebuilt parent does not empty its children's
 * columns, and come back on after it, read back, on success and on failure alike: the caller closes the connection after a throw.
 */
function runSteps(db: PluginRuntimeDatabase, run: Run, inspector: PluginUpgradeInspector): void {
  switchForeignKeys(db, 0, run);
  let failed: unknown;
  try { inTransaction(db, run, inspector); }
  catch (error) { failed = error; }
  try { switchForeignKeys(db, 1, run); }
  catch (error) { failed ??= error; }
  if (failed !== undefined) throw failed;
}

export interface PluginUpgradeResult { readonly from: number; readonly to: number }

/** The plugin's version in a project's library, by its row in the ledger; undefined when it has no tables there, or there is no ledger yet. Only reads. */
export function pluginProjectTablesVersion(connection: PluginRuntimeDatabase, pluginId: string): number | undefined {
  if (!connection.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'plugin_project_databases'").get()) return undefined;
  const row = connection.prepare("SELECT version FROM plugin_project_databases WHERE plugin_id = ?").get(pluginId) as { version: number } | undefined;
  return row === undefined ? undefined : Number(row.version);
}

/**
 * A plugin's tables in a project's library, from the version its ledger row records to its declaration's (§2.4), in one transaction of
 * their own on `connection`, which the caller holds alone and closes. The scope starts from the ledger: the objects it recorded that are
 * tables, less the platform's technical ones. Nothing to do when the plugin has no row or is current; a row newer than the declaration is
 * refused untouched. A failure rolls back only this plugin's transaction and throws `plugin.project_database.*`.
 */
export function upgradePluginProjectTables(connection: PluginRuntimeDatabase,
  owner: { readonly plugin_id: string; readonly publisher_signature: string; readonly declaration: PluginDatabaseDeclaration },
  inspector: PluginUpgradeInspector, options: { readonly path: string; readonly platformSchema?: string; readonly platformPrelude?: string }): PluginUpgradeResult | undefined {
  const { declaration } = owner, found = pluginProjectTablesVersion(connection, owner.plugin_id), to = declaration.version;
  if (found === undefined || found === to) return found === undefined ? undefined : { from: to, to };
  const where = `项目库 ${options.path} 里插件 ${owner.plugin_id} 的表`;
  if (found > to) throw pluginProjectDatabaseErrors.version_mismatch(`${where} 是第 ${found} 版，比这次声明的第 ${to} 版新，不读也不写`);
  // The first layer before anything else: a step no plugin may write is refused as that, without opening a scratch database for it.
  const label = { where, from: found, to }, steps = chain(declaration, found, label);
  const target = platformDeclaration(declaration, inspector, options.platformSchema, options.platformPrelude);
  const business = new Set(inspectPluginProjectSchema(declaration, inspector).tables.map(fold));
  const technical = new Set(target.tables.map(fold).filter(table => !business.has(table)));
  runSteps(connection, {
    ...label, steps, target, technical,
    start: db => {
      const row = db.prepare("SELECT publisher_signature, version, tables_json FROM plugin_project_databases WHERE plugin_id = ?").get(owner.plugin_id) as
        { publisher_signature: string; version: number; tables_json: string } | undefined;
      if (row?.publisher_signature !== owner.publisher_signature) throw pluginProjectDatabaseErrors.publisher_mismatch(`${where} 是另一个发布者建的`);
      if (Number(row.version) !== found) throw failure(label, "version_changed");
      let recorded: unknown;
      try { recorded = JSON.parse(row.tables_json); } catch { recorded = undefined; }
      if (!Array.isArray(recorded)) throw pluginProjectDatabaseErrors.shape_mismatch(`${where} 的账本记录读不出来`);
      const objects = new Set(recorded.map(name => fold(String(name))));
      return new Set([...tablesNow(db).keys()].filter(table => objects.has(table) && !technical.has(table)));
    },
    finish: db => {
      db.prepare("UPDATE plugin_project_databases SET version = ?, tables_json = ? WHERE plugin_id = ?").run(to, JSON.stringify(target.objects), owner.plugin_id);
    },
  }, inspector);
  return { from: found, to };
}

/** What a library's complete statements make, tried on the scratch database: the same terms as `platformDeclaration`, for a library that is the plugin's alone. */
function libraryTarget(schema: string, inspector: PluginProjectSchemaInspector): DeclaredSchema {
  const scratch = inspector.scratch();
  try {
    scratch.exec(schema);
    const objects = inspector.objects(scratch).filter(object => !fold(object.name).startsWith("sqlite_"));
    return { tables: objects.filter(object => object.type === "table").map(object => object.name), objects: objects.filter(object => !object.automatic).map(object => object.name).sort(),
      shape: inspector.shape(scratch).tables,
      triggers: new Map((scratch.prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'trigger'").all() as Array<{ name: string; sql: string }>).map(row => [row.name, row.sql])) };
  } finally { scratch.close(); }
}

/**
 * A plugin's own library in the Home, from its `user_version` to its declaration's (§2.4), by the same run: the file is this plugin's alone,
 * so the scope starts from every table but the platform's technical ones and the Home's binding, and the third layer has only those to keep
 * as they were. `schema` is the library's complete current statements, the platform's tables and triggers with the plugin's; `declaration`
 * is the plugin's own, with its steps. The caller has the file's snapshot and puts it back when this throws.
 */
export function upgradePluginHomeLibrary(connection: PluginRuntimeDatabase,
  owner: { readonly plugin_id: string; readonly declaration: PluginDatabaseDeclaration; readonly schema: string },
  inspector: PluginUpgradeInspector, options: { readonly path: string }): PluginUpgradeResult {
  const { declaration } = owner, to = declaration.version;
  const found = Number((connection.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);
  if (found === to) return { from: to, to };
  const where = `Home 库 ${options.path} 里插件 ${owner.plugin_id} 的表`;
  if (found < 1 || found > to) throw pluginProjectDatabaseErrors.version_mismatch(`${where} 是第 ${found} 版，这个程序不能从它升到第 ${to} 版，没有动它`);
  const label = { where, from: found, to }, steps = chain(declaration, found, label);
  const target = libraryTarget(owner.schema, inspector), business = new Set(libraryTarget(declaration.schema, inspector).tables.map(fold));
  const technical = new Set(target.tables.map(fold).filter(table => !business.has(table)));
  runSteps(connection, {
    ...label, steps, target, technical,
    start: db => {
      if (Number((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version) !== found) throw failure(label, "version_changed");
      // The Home's binding is not the plugin's, nor in its declaration: out of scope, and kept as it was by the third layer.
      return new Set([...tablesNow(db).keys()].filter(table => !technical.has(table) && table !== "molis_storage_space"));
    },
    finish: db => { db.exec(`PRAGMA user_version = ${to}`); },
  }, inspector);
  return { from: found, to };
}
