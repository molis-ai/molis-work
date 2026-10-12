#!/usr/bin/env node
// W3-06 C maintenance (specs/repository-anti-corruption/spec.md section 1, "迁到 Runtime 的内置插件，能力的来源编号", 2026-10-10;
// docs/releases/CHECKLIST.md 4.3 "维护七"): the seven built-in plugins that run on the Plugin Runtime (Characters, Shelf, Coding,
// Files, Diff, Git, Text Stats) used to register their actions under the id of their installation, `plugin-install-<hash>`, and now
// register under their plugin_id. A stored reference that pins the old provider id meets `actions.provider_changed`, so this lists
// the records that hold one and rewrites them. Delete this file and tests/provider-identity-maintenance.test.ts together once the
// real Home has been done (they stay in Git history).
//
//   node tests/fixtures/provider-identity-maintenance.mjs list    --home <copy of the Home> [--json]
//       READ ONLY. Lists every place that holds an old provider id, by what it is and what the rewrite would do with it.
//   node tests/fixtures/provider-identity-maintenance.mjs rewrite --home <Home or copy> [--json] [--maintenance-window]
//       Reads everything first and stops at the first problem without writing; then rewrites the records of the rules below in
//       place, one transaction per database and one atomic rename per JSON file, and reads again. The real Home (~/.molis-work,
//       ~/.goalboard, $MOLIS_WORK_HOME) is refused unless --maintenance-window says the user approved the window; `list` never
//       accepts it, run `list` on a copy. Nothing may hold the files (lsof is asked), and on the real Home the ports 4173, 4207 and 4208 must be
//       quiet. Running it twice changes nothing the second time.
//   Exit code: 0 nothing left to decide, 3 the report names records that are only listed (fixed versions, unclassified), 1 a
//   problem (nothing was written when it was found while reading), 2 a bad command or the real Home without the flag.
//
// WHAT IS REWRITTEN (a `provider_id` whose value is one of the seven old ids becomes the plugin id; nothing else is touched):
//   mcp-grants            config/mcp-tools.json                 the per-client MCP grants (action_grants[].provider_id)
//   workflow-steps        workflows/workflows.db                workflows.chain_json, instances.chain_json, instances.steps_json
//   character-drafts      characters/characters.sqlite          character_drafts.record (action_tools of a draft)
//   coding-selections     projects/*/molis-work.db              plugin_private_values 'actions:<session>' of the Coding installation
//   assistant-*           assistant/assistant.db                cards, undos, background jobs, and the settings disabled_actions and
//                                                               confirm_always (action keys: a JSON array of [capability, version, provider])
// WHAT IS ONLY LISTED:
//   fixed                 projects/*/molis-work.db              library_artifact_versions.payload_json: a published Character version is a
//                                                               fixed 成果 and is never rewritten; the person publishes the Character again
//   derived               search/                               the search index checks itself against the directory and rebuilds
//   history               logs/                                 the call log keeps the id each row was written with; nobody has to decide
//   unclassified          every other text column of every SQLite file, and every *.json / *.jsonl file, of the Home: a reference the rules
//                         above do not know (listed for a decision, left alone). A file is read as text, so a mention counts wherever it stands.
// WHAT THE TOOL CANNOT SEE (named in the report as NOT READ so that the blind spot is on the page; it never stops a run and never changes
// the exit code):
//   encrypted bodies      a record with a `secure` body (the envelope Prologue's NodeStorage writes under agent-runtime/records/<kind>/<id>.json
//                         and under the other storage roots) is counted per directory. The body is sealed with agent-runtime/storage.key, which
//                         this tool never opens. The exact action references a Coding round froze (the molis-agent-index-* records,
//                         attempts[].frozen.action_tools) are in there, so a round that was frozen with an old id and resumes after the window
//                         is not in this report: no round may be paused or waiting for approval when the window opens (CHECKLIST.md 4.3).
//   too large             a *.json / *.jsonl file over 64 MiB is named and not read.
// WHAT IS NEVER ENTERED OR OPENED: a symbolic link, anything that is not a regular file, releases/ (the installed programs), node_modules,
// .git and feed/secrets.json (the secret store). The old id as the installation's own identity (an install_id column or key,
// `sdk.artifacts.<install id>`) is not a reference and is not listed. The projects are the project databases found under
// <home>/projects/*/molis-work.db: the paths the catalog stores point at the real Home when this runs on a copy, so the catalog is never
// used to find a database.
import { createHash } from "node:crypto";
import { chmodSync, existsSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

/** The seven plugins, as `[plugin_id, publisher.signature]`; their old provider id is derived the way the Runtime derives an install id. */
export const PLUGINS = [
  ["io.molis.work.characters", "official-characters-binding"], ["io.molis.work.shelf", "official-shelf-binding"],
  ["io.molis.work.coding", "official-coding-binding"], ["io.molis.work.files", "official-files-binding"],
  ["io.molis.work.diff", "official-diff-binding"], ["io.molis.work.git", "official-git-binding"],
  ["io.molis.work.text-stats", "official-text-stats-binding"],
];
export const installIdentity = (pluginId, signature) => `plugin-install-${createHash("sha256").update(`${pluginId}\u0000${signature}`).digest("hex").slice(0, 32)}`;
/** Old provider id -> plugin id. */
export const MAPPING = new Map(PLUGINS.map(([pluginId, signature]) => [installIdentity(pluginId, signature), pluginId]));
const CODING_INSTALL = installIdentity(...PLUGINS.find(([pluginId]) => pluginId === "io.molis.work.coding"));
const OLD = [...MAPPING.keys()].join("|");
const PROVIDER_RE = () => new RegExp(`("provider_id"\\s*:\\s*")(${OLD})(")`, "g");
const ANY_RE = () => new RegExp(`(${OLD})`, "g");
/** What stands right before an old id that is the installation's own identity, not a reference to a provider. */
const OWN_BEFORE = /(?:sdk\.artifacts\.|"[a-z_]*install(?:ation)?_id"\s*:\s*")$/u;
const OWN_COLUMN = /install(?:ation)?_id$/u;
const AS_PROVIDER = /"provider_id"\s*:\s*"$/u;

/** Replaces the old provider ids of `provider_id` fields in a JSON text without touching anything else; `[text, count]`. */
export function rewriteReferences(text) {
  let count = 0;
  const out = text.replace(PROVIDER_RE(), (_all, before, id, after) => { count++; return `${before}${MAPPING.get(id)}${after}`; });
  return [out, count];
}

/** The action keys of assistant settings are JSON arrays of JSON-encoded [capability, version, provider]; `[text, count]`. */
export function rewriteActionKeys(text, sorted) {
  let list;
  try { list = JSON.parse(text); } catch { return [text, 0]; }
  if (!Array.isArray(list)) return [text, 0];
  let count = 0;
  const keys = list.map(entry => {
    try {
      const key = JSON.parse(entry);
      if (Array.isArray(key) && typeof key[2] === "string" && MAPPING.has(key[2])) { count++; return JSON.stringify([key[0], key[1], MAPPING.get(key[2])]); }
    } catch { /* not an action key: left as it is */ }
    return entry;
  });
  if (!count) return [text, 0];
  const unique = [...new Set(keys)];
  return [JSON.stringify(sorted ? unique.sort() : unique), count];
}

/** The mentions of an old id in `text` that are not the installation's own identity: `{ references, others, samples }`. */
function strays(text, column) {
  const found = { references: 0, others: 0, samples: [] };
  for (const match of text.matchAll(ANY_RE())) {
    const before = text.slice(Math.max(0, match.index - 48), match.index);
    if (OWN_BEFORE.test(before) || OWN_COLUMN.test(column) && text === match[0]) continue;
    if (AS_PROVIDER.test(before)) found.references++; else found.others++;
    if (found.samples.length < 2) found.samples.push(text.slice(Math.max(0, match.index - 40), match.index + match[0].length + 4));
  }
  return found;
}

// ---- what to look at ------------------------------------------------------------------------------------------------------
const quote = name => `"${String(name).replaceAll('"', '""')}"`;
const PROJECT_DB = /^projects\/[^/]+\/molis-work\.db$/u;
/** A column whose old provider ids are rewritten: `{ rule, file(rel), table, column, where, keys }`; `keys` is the assistant's action-key array. */
const SQL_RULES = [
  { rule: "workflow-steps", file: rel => rel === "workflows/workflows.db", table: "workflows", column: "chain_json", where: "1" },
  { rule: "workflow-steps", file: rel => rel === "workflows/workflows.db", table: "instances", column: "chain_json", where: "1" },
  { rule: "workflow-steps", file: rel => rel === "workflows/workflows.db", table: "instances", column: "steps_json", where: "1" },
  { rule: "character-drafts", file: rel => rel === "characters/characters.sqlite", table: "character_drafts", column: "record", where: "1" },
  { rule: "coding-selections", file: rel => PROJECT_DB.test(rel), table: "plugin_private_values", column: "item_value", where: `install_id = '${CODING_INSTALL}' AND item_key LIKE 'actions:%'` },
  { rule: "assistant-cards", file: rel => rel === "assistant/assistant.db", table: "assistant_cards", column: "body", where: "1" },
  { rule: "assistant-undos", file: rel => rel === "assistant/assistant.db", table: "assistant_undos", column: "body", where: "1" },
  { rule: "assistant-jobs", file: rel => rel === "assistant/assistant.db", table: "assistant_jobs", column: "body", where: "1" },
  { rule: "assistant-settings", file: rel => rel === "assistant/assistant.db", table: "assistant_settings", column: "value", where: "\"key\" IN ('disabled_actions', 'confirm_always')", keys: true },
];
const FIXED = { rule: "published-character-versions", file: rel => PROJECT_DB.test(rel), table: "library_artifact_versions", column: "payload_json" };
const isDerived = rel => rel.startsWith("search/");
const isHistory = rel => rel.startsWith("logs/");

const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git"]);
/** Secret stores: ciphertext by design, never a place for an action reference, so they are not opened at all. */
const NEVER_OPENED = new Set(["feed/secrets.json"]);
const DATABASE = /\.(?:db|sqlite)$/u;
const TEXT = /\.jsonl?$/u;
const MAX_TEXT_BYTES = 64 * 1024 * 1024;
const ENCRYPTED = "encrypted body";

/** Every regular file under the Home, relative to it. A symbolic link is never followed, releases/ (the installed programs) is not entered, and a directory that cannot be listed is a problem. */
function* walk(home, problems, directory = "") {
  let entries;
  try { entries = readdirSync(path.join(home, directory), { withFileTypes: true }); }
  catch (error) { problems.push({ file: directory || ".", message: `cannot be listed: ${String(error.message).slice(0, 160)}` }); return; }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = path.posix.join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;   // never leave the Home
    if (entry.isDirectory()) { if (!SKIPPED_DIRECTORIES.has(entry.name) && rel !== "releases") yield* walk(home, problems, rel); }
    else if (entry.isFile() && !NEVER_OPENED.has(rel)) yield rel;
  }
}

const tablesOf = db => db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => String(row.name));
const textColumns = (db, table) => db.prepare(`PRAGMA table_info(${quote(table)})`).all()
  .filter(column => !/INT|REAL|FLOA|DOUB|BLOB|NUM/iu.test(String(column.type))).map(column => String(column.name));

/** The rows of the rule columns, rewritten in memory (and written when `apply`); a stray mention left in a rewritten row is reported. */
function applyRules(db, rel, tables, apply, result) {
  const rules = SQL_RULES.filter(rule => rule.file(rel) && tables.includes(rule.table));
  if (!rules.length) return;
  if (apply) db.exec("BEGIN IMMEDIATE");
  try {
    for (const rule of rules) {
      const rows = db.prepare(`SELECT rowid AS r, ${rule.keys ? "\"key\" AS k, " : ""}${quote(rule.column)} AS v FROM ${quote(rule.table)} WHERE (${rule.where}) AND ${quote(rule.column)} LIKE '%plugin-install-%'`).all();
      let touched = 0, references = 0;
      for (const row of rows) {
        const [next, count] = rule.keys ? rewriteActionKeys(String(row.v), row.k === "disabled_actions") : rewriteReferences(String(row.v));
        const left = strays(next, rule.column);
        if (left.references + left.others) result.unclassified.push({ file: rel, table: rule.table, column: rule.column, rows: 1, ...left });
        if (!count) continue;
        touched++; references += count;
        if (apply) db.prepare(`UPDATE ${quote(rule.table)} SET ${quote(rule.column)} = ? WHERE rowid = ?`).run(next, row.r);
      }
      if (touched) result.rewritable.push({ rule: rule.rule, file: rel, table: rule.table, column: rule.column, rows: touched, references });
    }
    if (apply) db.exec("COMMIT");
  } catch (error) { if (apply) db.exec("ROLLBACK"); throw error; }
}

/** Everything one database holds: the rule rewrites, the fixed versions, and every other mention that is not an installation's own id. */
function inspectDatabase(home, rel, apply) {
  const result = { rewritable: [], fixed: [], derived: [], unclassified: [], error: null };
  let db;
  try {
    // Only a database with a rule is opened for writing; every other one is read and left exactly as it is.
    db = new DatabaseSync(path.join(home, rel), apply && SQL_RULES.some(rule => rule.file(rel)) ? {} : { readOnly: true });
    const tables = tablesOf(db);
    applyRules(db, rel, tables, apply, result);
    const covered = (table, column) => SQL_RULES.filter(rule => rule.file(rel) && rule.table === table && rule.column === column).map(rule => `NOT (${rule.where})`);
    if (FIXED.file(rel) && tables.includes(FIXED.table)) {
      for (const row of db.prepare(`SELECT artifact_id, version, artifact_type_id, title, ${quote(FIXED.column)} AS v FROM ${quote(FIXED.table)} WHERE ${quote(FIXED.column)} LIKE '%plugin-install-%'`).all()) {
        const found = strays(String(row.v), FIXED.column);
        if (found.references) result.fixed.push({ rule: FIXED.rule, file: rel, artifact_id: row.artifact_id, version: Number(row.version), artifact_type_id: row.artifact_type_id, title: row.title, references: found.references });
      }
    }
    for (const table of tables) for (const column of textColumns(db, table)) {
      if (FIXED.file(rel) && table === FIXED.table && column === FIXED.column) continue;
      const rows = db.prepare(`SELECT ${quote(column)} AS v FROM ${quote(table)} WHERE ${quote(column)} LIKE '%plugin-install-%' ${covered(table, column).map(clause => `AND ${clause}`).join(" ")}`).all();
      const total = { rows: 0, references: 0, others: 0, samples: [] };
      for (const { v } of rows) {
        const found = strays(String(v), column);
        if (!found.references && !found.others) continue;
        total.rows++; total.references += found.references; total.others += found.others; total.samples.push(...found.samples.slice(0, 2 - total.samples.length));
      }
      if (total.rows) (isDerived(rel) ? result.derived : result.unclassified).push({ file: rel, table, column, ...total });
    }
  } catch (error) { result.error = { file: rel, message: String(error.message).slice(0, 200) }; }
  finally { try { db?.close(); } catch { /* closing a failed open */ } }
  return result;
}

/** config/mcp-tools.json: the per-client grants are rewritten; a mention of an old id anywhere else in the file is listed and left. */
function inspectMcpGrants(home, apply) {
  const rel = "config/mcp-tools.json", full = path.join(home, rel);
  const none = { rewritable: [], unclassified: [], problems: [] };
  if (!existsSync(full)) return none;
  const text = readFileSync(full, "utf8");
  let grants;
  try { grants = JSON.parse(text).action_grants; } catch { return { ...none, problems: [{ file: rel, message: "not JSON" }] }; }
  const [next, count] = Array.isArray(grants) ? rewriteReferences(text) : [text, 0];
  const left = strays(next, "");
  const unclassified = left.references + left.others ? [{ file: rel, rows: 1, ...left }] : [];
  if (!count) return { ...none, unclassified };
  // The loader drops every record of a key that appears twice (a revocation must not lose to an older grant), so a rewrite that makes
  // two records one key would silently remove both: refuse it.
  const key = grant => JSON.stringify([grant.client_id, grant.project_id, grant.capability_id, grant.version, MAPPING.get(grant.provider_id) ?? grant.provider_id]);
  const seen = new Map();
  for (const grant of grants) seen.set(key(grant), (seen.get(key(grant)) ?? 0) + 1);
  const clash = [...seen].find(([, n]) => n > 1);
  if (clash) return { ...none, unclassified, problems: [{ file: rel, message: `a grant would collide with a record that already holds the plugin id: ${clash[0]}` }] };
  if (apply) {
    const temporary = `${full}.maintenance-${process.pid}.tmp`;
    writeFileSync(temporary, next, "utf8");
    chmodSync(temporary, statSync(full).mode & 0o777);
    renameSync(temporary, full);
  }
  return { ...none, rewritable: [{ rule: "mcp-grants", file: rel, rows: count, references: count }], unclassified };
}

/** A record in the envelope Prologue's NodeStorage writes for a sealed body: { version, metadata, tombstoned, secure: { iv, tag, body } }. */
function sealedRecord(text) {
  if (!text.includes('"secure"')) return false;
  try {
    const secure = JSON.parse(text)?.secure;
    return Boolean(secure) && typeof secure === "object" && ["iv", "tag", "body"].every(name => typeof secure[name] === "string");
  } catch { return false; }
}

/**
 * One *.json or *.jsonl file read as text: a mention of an old id anywhere in it is unclassified (history under logs/), whatever its
 * shape. A sealed record is counted as not read, because its body is encrypted; its plain part is read like the rest. A line of a JSON
 * Lines file is one row, a JSON file is one.
 */
function inspectTextFile(home, rel, limit) {
  const result = { unclassified: [], history: [], unread: [], error: null };
  const full = path.join(home, rel);
  try {
    if (rel === "config/mcp-tools.json") return result;   // its own rule
    if (statSync(full).size > limit) { result.unread.push({ file: rel, reason: `larger than ${limit} bytes` }); return result; }
    const text = readFileSync(full, "utf8");
    if (sealedRecord(text)) result.unread.push({ file: path.posix.dirname(rel), reason: ENCRYPTED, records: 1 });
    const total = { rows: 0, references: 0, others: 0, samples: [] };
    for (const row of rel.endsWith(".jsonl") ? text.split("\n") : [text]) {
      if (!row.includes("plugin-install-")) continue;
      const found = strays(row, "");
      if (!found.references && !found.others) continue;
      total.rows++; total.references += found.references; total.others += found.others; total.samples.push(...found.samples.slice(0, 2 - total.samples.length));
    }
    if (total.rows) (isHistory(rel) ? result.history : result.unclassified).push({ file: rel, ...total });
  } catch (error) { result.error = { file: rel, message: String(error.message).slice(0, 200) }; }
  return result;
}

// ---- the command ----------------------------------------------------------------------------------------------------------
const realHomes = () => [path.join(homedir(), ".molis-work"), path.join(homedir(), ".goalboard"), process.env.MOLIS_WORK_HOME ?? ""].filter(Boolean)
  .flatMap(candidate => { try { return [realpathSync(candidate)]; } catch { return []; } });

/** Which of the Host's ports something listens on, or null when lsof is not there to ask. */
function listening() {
  const found = [];
  for (const port of [4173, 4207, 4208]) {
    const asked = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" });
    if (asked.error) return null;
    if (asked.stdout.trim()) found.push(port);
  }
  return found;
}

/** Process ids holding any of the files, or null when lsof is not there to ask. */
function holders(files) {
  if (!files.length) return [];   // `lsof -t --` with no file lists every process of the machine
  const asked = spawnSync("lsof", ["-t", "--", ...files], { encoding: "utf8" });
  return asked.error ? null : asked.stdout.split("\n").filter(Boolean);
}

function collect(home, plan, apply, limit) {
  const report = { rewritable: [], fixed: [], derived: [], unclassified: [], history: [], unread: [], problems: [] };
  const grants = inspectMcpGrants(home, apply);
  report.rewritable.push(...grants.rewritable); report.unclassified.push(...grants.unclassified); report.problems.push(...grants.problems);
  for (const rel of plan.databases) {
    const found = inspectDatabase(home, rel, apply);
    for (const key of ["rewritable", "fixed", "derived", "unclassified"]) report[key].push(...found[key]);
    if (found.error) report.problems.push(found.error);
  }
  const sealed = new Map();
  for (const rel of apply ? [] : plan.texts) {   // the files of this loop are only read: the writing pass has no use for them
    const found = inspectTextFile(home, rel, limit);
    report.unclassified.push(...found.unclassified); report.history.push(...found.history);
    for (const row of found.unread) {
      if (row.reason === ENCRYPTED) sealed.set(row.file, (sealed.get(row.file) ?? 0) + row.records);
      else report.unread.push(row);
    }
    if (found.error) report.problems.push(found.error);
  }
  report.unread.push(...[...sealed].map(([file, records]) => ({ file, reason: ENCRYPTED, records })));
  report.unread.sort((a, b) => a.file.localeCompare(b.file));
  return report;
}

/** `options.maxTextBytes`: the size above which a JSON file is named as not read (the rehearsal lowers it; the command line cannot). */
export function run(argv, options = {}) {
  const limit = options.maxTextBytes ?? MAX_TEXT_BYTES;
  const [mode, ...rest] = argv;
  const index = rest.indexOf("--home");
  const usage = "usage: provider-identity-maintenance.mjs <list|rewrite> --home <Home copy> [--json] [--maintenance-window]";
  if (!["list", "rewrite"].includes(mode) || index < 0 || !rest[index + 1]) return { code: 2, error: usage };
  let home;
  try { home = realpathSync(path.resolve(rest[index + 1])); } catch { return { code: 2, error: `${rest[index + 1]} is not a directory\n${usage}` }; }
  if (!statSync(home).isDirectory()) return { code: 2, error: `${home} is not a directory` };
  const real = realHomes().includes(home), apply = mode === "rewrite";
  if (real && (!apply || !rest.includes("--maintenance-window"))) {
    return { code: 2, error: `${home} is the real Home: ${apply ? "rewrite needs --maintenance-window (the user approved the window)" : "run list on a copy"}` };
  }
  const unlisted = [], found = [...walk(home, unlisted)];
  const plan = { databases: found.filter(rel => DATABASE.test(rel)), texts: found.filter(rel => TEXT.test(rel)) };
  const mapping = [...MAPPING].map(([old, pluginId]) => ({ plugin_id: pluginId, old_provider_id: old }));
  const planned = collect(home, plan, false, limit);   // read everything before writing anything
  planned.problems.push(...unlisted);
  const decided = report => report.problems.length ? 1 : report.unclassified.length || report.fixed.length ? 3 : 0;
  if (!apply || planned.problems.length || !planned.rewritable.length) return { code: decided(planned), report: { home, mode, mapping, ...planned } };
  const held = holders(plan.databases.filter(rel => SQL_RULES.some(rule => rule.file(rel))).flatMap(rel => [path.join(home, rel), `${path.join(home, rel)}-wal`].filter(existsSync)));
  if (held === null && real) return { code: 2, error: "lsof is needed to check that nothing holds the Home" };
  if (held?.length) return { code: 1, error: `a process holds the Home's databases: ${[...new Set(held)].join(" ")}` };
  const ports = real ? listening() : [];
  if (ports?.length) return { code: 1, error: `something listens on port ${ports.join(", ")}: stop the Host first` };
  const done = collect(home, plan, true, limit);
  const after = collect(home, plan, false, limit);
  const remaining = after.rewritable.length;
  const problems = [...done.problems, ...(remaining ? [{ file: "(all)", message: `${remaining} rewritable place(s) are left after the rewrite` }] : [])];
  return { code: decided({ ...after, problems }),
    report: { home, mode, mapping, rewritable: done.rewritable, fixed: after.fixed, derived: after.derived, unclassified: after.unclassified, history: after.history, unread: after.unread, problems, remaining } };
}

const lines = report => [
  `${report.mode} on ${report.home}`,
  ...report.rewritable.map(row => `  ${report.mode === "list" ? "would rewrite" : "rewrote"} ${row.rule}: ${row.file}${row.table ? ` ${row.table}.${row.column}` : ""} - ${row.rows} record(s), ${row.references} reference(s)`),
  ...report.fixed.map(row => `  FIXED (publish the Character again): ${row.file} ${row.artifact_id} v${row.version} ${row.artifact_type_id} "${row.title}" - ${row.references} reference(s)`),
  ...report.derived.map(row => `  derived (rebuilds itself): ${row.file} ${row.table}.${row.column} - ${row.rows} row(s)`),
  ...report.unclassified.map(row => `  UNCLASSIFIED: ${row.file}${row.table ? ` ${row.table}.${row.column}` : ""} - ${row.rows} row(s), ${row.references} provider_id reference(s), ${row.others} other mention(s): ${row.samples.join(" | ")}`),
  ...report.history.map(row => `  history (stays as it is): ${row.file} - ${row.rows} row(s), ${row.references} provider_id reference(s), ${row.others} other mention(s)`),
  ...report.unread.map(row => `  NOT READ (${row.reason}): ${row.file}${row.records ? ` - ${row.records} record(s); the references inside are not seen` : ""}`),
  ...report.problems.map(row => `  PROBLEM: ${row.file}: ${row.message}`),
].join("\n");

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outcome = run(process.argv.slice(2));
  if (outcome.error) process.stderr.write(`${outcome.error}\n`);
  else process.stdout.write(`${process.argv.includes("--json") ? JSON.stringify(outcome.report, null, 2) : lines(outcome.report)}\n`);
  process.exit(outcome.code);
}
