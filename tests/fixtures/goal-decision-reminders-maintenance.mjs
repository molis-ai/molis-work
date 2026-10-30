#!/usr/bin/env node
// BL-780 offline cleanup. Coordinator 6516315418: v10 deletes only, v11 also assigns surviving unowned reminders.
import { lstatSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { GOALS_PLUGIN_ID, goalTreeProposalNeedsDecision, goalTreeProposalAttentionGoalId } from "@molis-ai/molis-work-plugin-goals";
import { validateProject } from "./project-maintenance.mjs";

function readPlan(db) {
  const version = Number(db.prepare("PRAGMA user_version").get().user_version);
  const roots = db.prepare(version === 7 ? "SELECT project_id FROM boards" : "SELECT project_id FROM project_root").all();
  if (roots.length !== 1) throw new Error("expected exactly one project root");
  const project = roots[0].project_id, goals = new Set(db.prepare("SELECT goal_id FROM goals WHERE project_id=?").all(project).map(row => row.goal_id));
  if (db.prepare("SELECT 1 FROM goal_tree_proposal_items WHERE project_id=? AND NOT json_valid(payload_json)").get(project)) throw new Error("invalid proposal metadata JSON");
  const pending = new Set();
  for (const proposal of db.prepare("SELECT proposal_id,state,root_goal_id FROM goal_tree_proposals WHERE project_id=?").all(project)) {
    const items = db.prepare("SELECT state,json_extract(payload_json,'$.goal_id') AS goal_id,json_extract(payload_json,'$.from_goal_id') AS from_goal_id,json_extract(payload_json,'$.to_goal_id') AS to_goal_id FROM goal_tree_proposal_items WHERE proposal_id=? ORDER BY ordinal,item_id").all(proposal.proposal_id)
      .map(row => ({ state: row.state, payload: { goal_id: row.goal_id, from_goal_id: row.from_goal_id, to_goal_id: row.to_goal_id } }));
    const value = { ...proposal, items };
    if (goalTreeProposalNeedsDecision(value)) {
      const goal = goalTreeProposalAttentionGoalId(value, id => goals.has(id)); if (goal) pending.add(goal);
    }
  }
  const ownedColumn = db.prepare("PRAGMA table_info(inbox_entries)").all().some(row => row.name === "owner_plugin_id");
  const owned = ownedColumn ? db.prepare("SELECT subject_id,reason FROM inbox_entries WHERE project_id=? AND subject_type='goal_decision' AND owner_plugin_id=?").all(project, GOALS_PLUGIN_ID) : [];
  const ownedKeys = new Set(owned.map(row => JSON.stringify([row.subject_id, row.reason])));
  const unowned = db.prepare("SELECT entry_id,subject_id,reason,status FROM inbox_entries WHERE project_id=? AND subject_type='goal_decision'" + (ownedColumn ? " AND owner_plugin_id IS NULL" : "") + " ORDER BY entry_id").all(project);
  const report = { version, unowned: unowned.length, already_owned: owned.length, assign: 0, duplicate: 0, settled: 0, unknown_subject: 0, unexpected_reason: 0, dismissed_pending: 0 };
  const remove = [], assign = [];
  for (const entry of unowned) {
    if (entry.reason !== "goal_decision") { report.unexpected_reason++; continue; }
    if (!goals.has(entry.subject_id)) { report.unknown_subject++; continue; }
    if (!pending.has(entry.subject_id)) { report.settled++; remove.push(entry.entry_id); continue; }
    if (ownedKeys.has(JSON.stringify([entry.subject_id, entry.reason]))) { report.duplicate++; remove.push(entry.entry_id); }
    else { report.assign++; assign.push(entry.entry_id); }
    if (entry.status === "dismissed") report.dismissed_pending++;
  }
  const preV11Owners = ownedColumn ? Number(db.prepare("SELECT count(*) AS n FROM inbox_entries WHERE owner_plugin_id IS NOT NULL").get().n) : 0;
  let eventOwners = 0;
  if (version === 11) for (const entry of [...remove, ...assign]) eventOwners += Number(db.prepare("SELECT count(*) AS n FROM attention_events WHERE project_id=? AND entry_id=? AND subject_type='goal_decision' AND owner_plugin_id IS NULL").get(project, entry).n);
  return { report, project, remove, assign, preV11Owners, proposed: { entries_deleted: remove.length, entries_assigned: version === 11 ? assign.length : 0,
    event_owner_updates: eventOwners, pending_owner_deferred_to_v11: version === 11 ? 0 : assign.length } };
}
export function maintainGoalDecisionReminders(file, apply = false) {
  if (!lstatSync(file).isFile() || lstatSync(file).nlink !== 1) throw new Error("project must be an ordinary unlinked file");
  const db = new DatabaseSync(file, { readOnly: !apply });
  try {
    if (apply) db.exec("BEGIN IMMEDIATE");
    const version = Number(db.prepare("PRAGMA user_version").get().user_version), before = validateProject(db, version), plan = readPlan(db);
    const result = { ...plan.report, proposed: plan.proposed, pre_v11_owned_entries_blocking: version < 11 ? plan.preV11Owners : 0, changed: false };
    if (!apply) return result;
    if (![10, 11].includes(version)) throw new Error("cleanup applies only after project 10, before 11, or on an existing project 11");
    if (plan.report.unknown_subject || plan.report.unexpected_reason) throw new Error("unrecognized Goal reminder; report it for a separate decision");
    if (version === 10 && plan.preV11Owners) throw new Error("project 10 already has owned entries; the unchanged v11 guard must refuse, so stop before cleanup");
    for (const entry of plan.remove) {
      if (db.prepare("DELETE FROM inbox_entries WHERE project_id=? AND entry_id=? AND owner_plugin_id IS NULL").run(plan.project, entry).changes !== 1) throw new Error("reminder count differs from preflight");
    }
    if (version === 11) {
      for (const entry of plan.assign) if (db.prepare("UPDATE inbox_entries SET owner_plugin_id=? WHERE project_id=? AND entry_id=? AND owner_plugin_id IS NULL").run(GOALS_PLUGIN_ID, plan.project, entry).changes !== 1) throw new Error("reminder owner changed since preflight");
      let changedEvents = 0;
      for (const entry of [...plan.remove, ...plan.assign]) changedEvents += Number(db.prepare("UPDATE attention_events SET owner_plugin_id=? WHERE project_id=? AND entry_id=? AND subject_type='goal_decision' AND owner_plugin_id IS NULL").run(GOALS_PLUGIN_ID, plan.project, entry).changes);
      if (changedEvents !== plan.proposed.event_owner_updates) throw new Error("attention owner count differs from preflight");
    }
    const after = validateProject(db, version);
    if (Object.entries(before).some(([table, count]) => after[table] !== count - (table === "inbox_entries" ? plan.remove.length : 0))) throw new Error("reminder cleanup changed unrelated row counts");
    db.exec("COMMIT");
    return { ...result, changed: plan.proposed.entries_deleted + plan.proposed.entries_assigned + plan.proposed.event_owner_updates > 0 };
  } catch (error) { if (db.isTransaction) db.exec("ROLLBACK"); throw error; }
  finally { db.close(); }
}
function main(args) {
  const command = args.shift(), at = args.indexOf("--database"), given = at < 0 ? undefined : args.splice(at, 2)[1];
  const window = args.includes("--maintenance-window"); if (window) args.splice(args.indexOf("--maintenance-window"), 1);
  if (!["list", "apply"].includes(command) || !given || args.length) throw new Error("list|apply --database <explicit copy file> [--maintenance-window]");
  if (!lstatSync(given).isFile()) throw new Error("project must be an ordinary file");
  const file = realpathSync(given), inside = root => file === root || file.startsWith(root + path.sep);
  if (inside(path.join(homedir(), ".molis-work")) && (command === "list" || !window)) throw new Error("list needs a copy; real apply needs its approved maintenance window");
  if (command === "apply" && !inside(realpathSync(tmpdir())) && !window) throw new Error("apply outside temporary Home needs --maintenance-window");
  process.stdout.write(JSON.stringify(maintainGoalDecisionReminders(file, command === "apply")) + "\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(process.argv.slice(2)); } catch (error) { process.stderr.write(error.message + "\n"); process.exitCode = 1; }
}
