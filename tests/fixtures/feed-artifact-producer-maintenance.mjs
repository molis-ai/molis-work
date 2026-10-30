#!/usr/bin/env node
// R-69: explicit producer correction, project v11 only. No payload, title, actor, content digest or event is read or rewritten.
import { lstatSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { validateProject } from "./project-maintenance.mjs";

const OLD_IDS = ["io.molis.work.native.feed", "io.molis.work.feed"];
const CURRENT = { id: "io.molis.work.feed", signature: "official-feed-binding", version: "0.3.0" };
function preflight(db) {
  const rows = db.prepare("SELECT artifact_id,producer_plugin_id FROM library_artifacts WHERE producer_binding_signature='native:feed' ORDER BY artifact_id").all();
  const eligible = rows.filter(row => OLD_IDS.includes(row.producer_plugin_id));
  let blocked = rows.length - eligible.length, versions = 0;
  for (const row of eligible) {
    const own = db.prepare("SELECT producer_plugin_version FROM library_artifact_versions WHERE artifact_id=?").all(row.artifact_id);
    if (own.length === 0 || own.some(version => version.producer_plugin_version !== "0.0.0")) blocked++;
    versions += own.length;
  }
  return { eligible, blocked, versions };
}
const report = state => ({ lines: state.eligible.length, versions: state.versions, blocked: state.blocked });

export function maintainFeedProducer(file, apply = false) {
  const info = lstatSync(file);
  if (!info.isFile() || info.nlink !== 1) throw new Error("project must be an ordinary unlinked file");
  const db = new DatabaseSync(file, { readOnly: !apply });
  try {
    if (apply) db.exec("BEGIN IMMEDIATE");
    const version = Number(db.prepare("PRAGMA user_version").get().user_version);
    const counts = validateProject(db, apply ? 11 : version), before = preflight(db);
    if (!apply) return { ...report(before), changed: false };
    if (before.blocked) throw new Error("unrecognized Feed producer or mixed version line; nothing committed");
    for (const row of before.eligible) {
      const identity = db.prepare("UPDATE library_artifacts SET producer_plugin_id=?,producer_binding_signature=? WHERE artifact_id=? AND producer_binding_signature='native:feed'")
        .run(CURRENT.id, CURRENT.signature, row.artifact_id);
      if (identity.changes !== 1) throw new Error("producer line changed since preflight");
      db.prepare("UPDATE library_artifact_versions SET producer_plugin_version=? WHERE artifact_id=? AND producer_plugin_version='0.0.0'")
        .run(CURRENT.version, row.artifact_id);
    }
    if (preflight(db).eligible.length !== 0) throw new Error("producer correction incomplete");
    const after = validateProject(db, 11);
    if (Object.entries(counts).some(([name, count]) => after[name] !== count)) throw new Error("producer correction changed row counts");
    db.exec("COMMIT");
    return { ...report(before), changed: before.eligible.length > 0 };
  } catch (error) { if (db.isTransaction) db.exec("ROLLBACK"); throw error; }
  finally { db.close(); }
}

function main(args) {
  const command = args.shift(), at = args.indexOf("--database"), given = at >= 0 ? args.splice(at, 2)[1] : undefined;
  const window = args.includes("--maintenance-window");
  if (window) args.splice(args.indexOf("--maintenance-window"), 1);
  if (!["list", "apply"].includes(command) || !given || args.length) throw new Error("list|apply --database <explicit copy file> [--maintenance-window]");
  const file = realpathSync(given), inside = (candidate, root) => candidate === root || candidate.startsWith(root + path.sep);
  if (inside(file, path.join(homedir(), ".molis-work")) && (command === "list" || !window)) throw new Error("list needs a copy; real apply needs its approved window");
  if (command === "apply" && !inside(file, realpathSync(tmpdir())) && !window) throw new Error("apply outside temporary Home needs --maintenance-window");
  process.stdout.write(JSON.stringify(maintainFeedProducer(file, command === "apply")) + "\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(process.argv.slice(2)); } catch (error) { process.stderr.write(error.message + "\n"); process.exitCode = 1; }
}
