#!/usr/bin/env node
// BL-780 metadata preflight only. Write ordering with project v11 requires the coordinator's decision.
import { lstatSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { GOALS_PLUGIN_ID, goalTreeProposalNeedsDecision, goalTreeProposalAttentionGoalId } from "@molis-ai/molis-work-plugin-goals";
import { validateProject } from "./project-maintenance.mjs";

export function inspectGoalDecisionReminders(file) {
  if (!lstatSync(file).isFile() || lstatSync(file).nlink !== 1) throw new Error("project must be an ordinary unlinked file");
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const version = Number(db.prepare("PRAGMA user_version").get().user_version); validateProject(db, version);
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
    const unowned = db.prepare("SELECT subject_id,reason,status FROM inbox_entries WHERE project_id=? AND subject_type='goal_decision'" + (ownedColumn ? " AND owner_plugin_id IS NULL" : "")).all(project);
    const report = { version, unowned: unowned.length, already_owned: owned.length, assign: 0, duplicate: 0, settled: 0, unknown_subject: 0, unexpected_reason: 0, dismissed_pending: 0 };
    for (const entry of unowned) {
      if (entry.reason !== "goal_decision") { report.unexpected_reason++; continue; }
      if (!goals.has(entry.subject_id)) { report.unknown_subject++; continue; }
      if (!pending.has(entry.subject_id)) { report.settled++; continue; }
      if (ownedKeys.has(JSON.stringify([entry.subject_id, entry.reason]))) report.duplicate++;
      else report.assign++;
      if (entry.status === "dismissed") report.dismissed_pending++;
    }
    return report;
  } finally { db.close(); }
}
function main(args) {
  if (args.length !== 3 || args[0] !== "list" || args[1] !== "--database") throw new Error("list --database <explicit copy file>; apply awaits the coordinator's ordering decision");
  const file = realpathSync(args[2]), home = path.join(homedir(), ".molis-work");
  if (file === home || file.startsWith(home + path.sep)) throw new Error("list requires a copy outside the real Home");
  process.stdout.write(JSON.stringify(inspectGoalDecisionReminders(file)) + "\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(process.argv.slice(2)); } catch (error) { process.stderr.write(error.message + "\n"); process.exitCode = 1; }
}
