import { existsSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import type { ObservationEvidence } from "@molis-ai/molis-work-contracts/services/observation";
import { homeSqlitePath, openBaselineHomeSqlite } from "@molis-ai/molis-work-storage";
import { collectUnreferenced } from "./evidence.js";
import { OBSERVATION_BASELINE, OBSERVATION_STORE } from "./schema.js";

/** Which plugin's data the person cleared, and the ids its calls carry: its installations, and the provider ids its actions answer under. */
export interface PluginPurge {
  readonly plugin_id: string;
  readonly install_ids: readonly string[];
  readonly provider_ids: readonly string[];
  /** A project-level installation: only that project's records. Absent: a Home-level installation, every project. */
  readonly project_id?: string;
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
  const scope = purge.project_id === undefined ? "" : " AND project_id = ?", scoped = purge.project_id === undefined ? [] : [purge.project_id];
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`DELETE FROM record_evidence WHERE seq IN (SELECT seq FROM records WHERE owner_kind = 'plugin' AND owner_id = ?${scope})`).run(purge.plugin_id, ...scoped);
    const owned = db.prepare(`DELETE FROM records WHERE owner_kind = 'plugin' AND owner_id = ?${scope}`).run(purge.plugin_id, ...scoped).changes;
    const calls = db.prepare(`SELECT seq, evidence FROM records WHERE (provider_id IN (${marks(purge.provider_ids)}) OR install_id IN (${marks(purge.install_ids)}))${scope}`)
      .all(...purge.provider_ids, ...purge.install_ids, ...scoped) as { seq: number; evidence: string }[];
    const update = db.prepare("UPDATE records SET evidence = ? WHERE seq = ?"), unlink = db.prepare("DELETE FROM record_evidence WHERE seq = ?");
    for (const call of calls) {
      const evidence = (JSON.parse(call.evidence) as ObservationEvidence[]).map(item => ({ role: item.role, ref: { kind: "missing", reason: "purged" } }));
      update.run(JSON.stringify(evidence), call.seq);
      unlink.run(call.seq);
    }
    db.prepare(`DELETE FROM coverage WHERE owner = ?${scope}`).run(owner, ...scoped);
    db.prepare("INSERT INTO coverage_gaps (owner, fact, entry, project_id, state, started_at, ended_at, count, reason) VALUES (?, '*', 'plugin', ?, 'purged', ?, ?, ?, 'plugin_data_cleared')")
      .run(owner, purge.project_id ?? "", now, now, Number(owned) + calls.length);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/**
 * The same clean-ups for a process that runs no observation layer (the command line, the uninstaller): straight on the library file, when
 * there is one. A running Host registers its own layer's owner under the same id, which also drops what waits in its queue.
 */
export function clearObservationProjectFile(home: string, projectId: string): void {
  withExistingLibrary(home, db => clearProjectRows(db, projectId));
}

export function purgeObservationPluginFile(home: string, purge: PluginPurge, now: string): void {
  withExistingLibrary(home, db => purgePluginRows(db, purge, now));
}

function withExistingLibrary(home: string, run: (db: DatabaseSync) => void): void {
  if (!existsSync(homeSqlitePath(home, OBSERVATION_STORE))) return;
  const db = openBaselineHomeSqlite(home, OBSERVATION_STORE, OBSERVATION_BASELINE);
  try { run(db); collectUnreferenced(db); } finally { db.close(); }
}
