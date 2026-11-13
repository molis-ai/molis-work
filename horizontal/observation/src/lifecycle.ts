import type { DatabaseSync } from "node:sqlite";
import type { ObservationEvidence } from "@molis-ai/molis-work-contracts/services/observation";

/** Which plugin's data the person cleared, and the ids its calls carry: its installations, and the provider ids its actions answer under. */
export interface PluginPurge {
  readonly plugin_id: string;
  readonly install_ids: readonly string[];
  readonly provider_ids: readonly string[];
}

/** Delete one project's records, their evidence links, its coverage rows and stretches (contract-design §6). Bodies are collected after. */
export function clearProjectRows(db: DatabaseSync, projectId: string): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM record_evidence WHERE seq IN (SELECT seq FROM records WHERE project_id = ?)").run(projectId);
    db.prepare("DELETE FROM records WHERE project_id = ?").run(projectId);
    db.prepare("DELETE FROM coverage WHERE project_id = ?").run(projectId);
    db.prepare("DELETE FROM coverage_gaps WHERE project_id = ?").run(projectId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Clear a plugin's data (contract-design §6): the records it owns go; the action-call records of calls it answered (`provider_id`) or made
 * (`install_id`) stay as who called what and how it ended, with every piece of evidence turned into `missing: purged`. The stretch is kept in
 * the coverage register under the plugin, so a reader sees the content was cleared, not lost or expired.
 */
export function purgePluginRows(db: DatabaseSync, purge: PluginPurge, now: string): void {
  const owner = `plugin:${purge.plugin_id}`;
  const marks = (values: readonly string[]) => values.map(() => "?").join(", ") || "NULL";
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM record_evidence WHERE seq IN (SELECT seq FROM records WHERE owner_kind = 'plugin' AND owner_id = ?)").run(purge.plugin_id);
    const owned = db.prepare("DELETE FROM records WHERE owner_kind = 'plugin' AND owner_id = ?").run(purge.plugin_id).changes;
    const calls = db.prepare(`SELECT seq, evidence FROM records WHERE provider_id IN (${marks(purge.provider_ids)}) OR install_id IN (${marks(purge.install_ids)})`)
      .all(...purge.provider_ids, ...purge.install_ids) as { seq: number; evidence: string }[];
    const update = db.prepare("UPDATE records SET evidence = ? WHERE seq = ?"), unlink = db.prepare("DELETE FROM record_evidence WHERE seq = ?");
    for (const call of calls) {
      const evidence = (JSON.parse(call.evidence) as ObservationEvidence[]).map(item => ({ role: item.role, ref: { kind: "missing", reason: "purged" } }));
      update.run(JSON.stringify(evidence), call.seq);
      unlink.run(call.seq);
    }
    db.prepare("DELETE FROM coverage WHERE owner = ?").run(owner);
    db.prepare("INSERT INTO coverage_gaps (owner, fact, entry, project_id, state, started_at, ended_at, count, reason) VALUES (?, '*', 'plugin', '', 'purged', ?, ?, ?, 'plugin_data_cleared')")
      .run(owner, now, now, Number(owned) + calls.length);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
