#!/usr/bin/env node
// Offline only. Six-field behavior is frozen from main b87cf34d3b^:horizontal/memory/src/prefs.ts and service.ts.
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { isDeepStrictEqual } from "node:util";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { MEMORY_KINDS, MEMORY_CONSUMERS } from "@molis-ai/molis-work-contracts/services/memory";
import { describeSqliteBaseline, describeSqliteSchema, MEMORY_LEDGER_BASELINE } from "@molis-ai/molis-work-storage";
import { adoptMemoryHome } from "@molis-ai/molis-work-app-local-host";

const switches = ["form", "auto", "learn_from_work", "learn_from_ui"];
const fileOf = home => path.join(home, "memory", "memory.db");
const quote = name => '"' + name.replaceAll('"', '""') + '"';
function validate(db, version) {
  const frozen = describeSqliteBaseline({ version: 2, schema: readFileSync(new URL("./home-store-schemas/memory.sql", import.meta.url), "utf8") });
  if (Number(db.prepare("PRAGMA user_version").get().user_version) !== version) throw new Error("unexpected Memory maintenance version");
  if (MEMORY_LEDGER_BASELINE.version !== 4 || !isDeepStrictEqual(frozen, describeSqliteBaseline(MEMORY_LEDGER_BASELINE))
    || !isDeepStrictEqual(describeSqliteSchema(db), frozen)
    || db.prepare("SELECT 1 FROM sqlite_schema WHERE type NOT IN ('table','index')").get()) throw new Error("Memory maintenance structure mismatch");
  if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok" || db.prepare("PRAGMA foreign_key_check").all().length) throw new Error("Memory integrity check failed");
  return Object.fromEntries(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
    .map(row => [row.name, Number(db.prepare(`SELECT count(*) AS n FROM ${quote(row.name)}`).get().n)]));
}
function checkedLayer(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => ![...switches, "consumers", "plugins"].includes(key))) throw new Error("unrecognized pre-adoption preferences");
  if (switches.some(key => key in value && typeof value[key] !== "boolean")) throw new Error("invalid stored Memory switch");
  if (value.consumers !== undefined && (!value.consumers || typeof value.consumers !== "object" || Array.isArray(value.consumers)
    || Object.entries(value.consumers).some(([key, choice]) => !MEMORY_CONSUMERS.includes(key) || typeof choice !== "boolean"))) throw new Error("invalid stored Memory consumer");
  if (value.plugins !== undefined && (!value.plugins || typeof value.plugins !== "object" || Array.isArray(value.plugins)
    || Object.entries(value.plugins).some(([id, rule]) => !id || !rule || typeof rule !== "object" || Array.isArray(rule)
      || Object.keys(rule).some(key => !["allowed", "kinds"].includes(key)) || typeof rule.allowed !== "boolean"
      || (rule.kinds !== undefined && (!Array.isArray(rule.kinds) || rule.kinds.some(kind => !MEMORY_KINDS.includes(kind))))))) throw new Error("invalid stored Memory plugin restriction");
  return value;
}
function effective(scope, layers) {
  const out = { form: true, auto: true, learn_from_work: true, learn_from_ui: true,
    consumers: { assistant: true, agent: true, ui: true, plugin: true, mcp: scope === "project" }, plugins: Object.create(null) };
  for (const layer of layers) {
    if (!layer) continue;
    for (const key of switches) if (key in layer) out[key] = layer[key];
    Object.assign(out.consumers, layer.consumers);
    for (const [id, rule] of Object.entries(layer.plugins ?? {})) out.plugins[id] = { allowed: rule.allowed, kinds: [...new Set(rule.kinds ?? ["preference", "convention"])] };
  }
  return out;
}
function profiles(db) {
  const layers = new Map();
  for (const row of db.prepare("SELECT actor_id,key,body FROM memory_prefs ORDER BY actor_id,key").all()) {
    if (row.actor_id !== LOCAL_PERSON_ACTOR_ID || !["personal", "project-default"].includes(row.key) && !/^project:.+/.test(row.key)) throw new Error("unrecognized stored preference identity");
    let value; try { value = JSON.parse(row.body); } catch { throw new Error("invalid stored preference JSON"); }
    layers.set(row.key, checkedLayer(value));
  }
  const result = new Map([["personal", effective("personal", [layers.get("personal")])], ["project-default", effective("project", [layers.get("project-default")])]]);
  for (const [key, layer] of layers) if (key.startsWith("project:")) result.set(key, effective("project", [layers.get("project-default"), layer]));
  return result;
}
/** list reads only version, schema and counts. Preferences are interpreted only in the explicitly authorized offline apply. */
export function maintainMemoryPreferences(home, apply = false) {
  const file = fileOf(home), info = lstatSync(file);
  if (!info.isFile() || info.nlink !== 1) throw new Error("Memory must be an ordinary unlinked existing file");
  const db = new DatabaseSync(file, { readOnly: !apply });
  try {
    if (apply) db.exec("BEGIN IMMEDIATE");
    const before = validate(db, 2);
    if (db.prepare("SELECT 1 FROM memory_markers WHERE key='strategy-adoption'").get()) throw new Error("Memory 2 already has an adoption record; refuse");
    const existingDefaults = Number(db.prepare("SELECT count(*) AS n FROM memory_prefs WHERE actor_id=? AND key IN ('personal','project-default')").get(LOCAL_PERSON_ACTOR_ID).n);
    const result = { from: 2, target: 3, rows: before, preferences_inserted: 2 - existingDefaults, preferences_materialized: before.memory_prefs + 2 - existingDefaults, adoption_records_inserted: 1, changed: false };
    if (!apply) return result;
    const choices = profiles(db), at = new Date().toISOString();
    for (const [key, prefs] of choices) db.prepare("INSERT INTO memory_prefs(actor_id,key,body) VALUES(?,?,?) ON CONFLICT(actor_id,key) DO UPDATE SET body=excluded.body")
      .run(LOCAL_PERSON_ACTOR_ID, key, JSON.stringify(prefs));
    db.prepare("INSERT INTO memory_markers(actor_id,key,at,body) VALUES(?,?,?,?)").run(LOCAL_PERSON_ACTOR_ID, "strategy-adoption", at, JSON.stringify({ origin: "existing-home" }));
    db.exec("PRAGMA user_version=3");
    const after = validate(db, 3);
    if (Object.entries(before).some(([table, count]) => after[table] !== count + (table === "memory_prefs" ? result.preferences_inserted : table === "memory_markers" ? 1 : 0))) throw new Error("Memory adoption changed unrelated row counts");
    db.exec("COMMIT"); return { ...result, changed: true };
  } catch (error) { if (db.isTransaction) db.exec("ROLLBACK"); throw error; }
  finally { db.close(); }
}
/** The existing Host/SDK owns all 3 -> 4 conversion, blocking and verification. No replacement decoder or version shortcut. */
export async function maintainMemorySdk(home) { return adoptMemoryHome({ homeDirectory: home }); }
async function main(args) {
  const command = args.shift(), take = key => { const at = args.indexOf(key); return at < 0 ? undefined : args.splice(at, 2)[1]; };
  const home = take("--home"), step = take("--step"), window = args.includes("--maintenance-window");
  if (window) args.splice(args.indexOf("--maintenance-window"), 1);
  if (!["list", "apply"].includes(command) || !home || !path.isAbsolute(home) || !["preferences", "sdk"].includes(step) || args.length || command === "list" && step !== "preferences") throw new Error("list|apply --step preferences|sdk --home <absolute offline Home> [--maintenance-window]");
  const canonical = realpathSync(home), inside = root => canonical === root || canonical.startsWith(root + path.sep);
  if (inside(path.join(homedir(), ".molis-work")) && (command === "list" || !window)) throw new Error("list needs a copy; real apply needs its approved window");
  if (command === "apply" && !inside(realpathSync(tmpdir())) && !window) throw new Error("apply outside a disposable Home requires --maintenance-window");
  const result = step === "preferences" ? maintainMemoryPreferences(canonical, command === "apply") : await maintainMemorySdk(canonical);
  process.stdout.write(JSON.stringify(result) + "\n");
  if (result.outcome && result.outcome !== "completed") process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await main(process.argv.slice(2)); } catch { process.stderr.write("Memory maintenance refused; leave this Home stopped and review its backup and adoption state.\n"); process.exitCode = 1; }
}
