import type { PluginWiringDatabase } from "./wiring-repository.js";

/** What one project's wiring still names under a retired source, and why it cannot move as it is. */
export interface WiringReassignmentPlan {
  readonly outputs: number;
  readonly bindings: number;
  /** The artifact each moving output hands on, so the caller can prove it moves with its producer. */
  readonly handed: readonly { readonly port: string; readonly artifact_id: string }[];
  /** Each refusal names the row and the reason; any refusal keeps the whole library as it is. */
  readonly refused: readonly string[];
}

/**
 * Read-only preflight of moving a retired source's output ports and the bindings that read them to the source that replaces it, port for
 * port (Files retirement, specs/batch-06-shared-tools/spec.md「旧默认」table). Only ports the new source offers move; an output the new
 * source already holds for the same port is a collision. A binding moves only when it was made by a default (`origin: "default"`):
 * whether it still applies is then decided by the consent ledger, as for any default. A binding the person made by hand has no record
 * here that a protected entry made it, so it stops the project before adoption and stays as it is until the person picks again.
 * Fixed version inputs (`plugin_port_artifact_bindings`) name no source and are not touched.
 */
export function planWiringReassignment(db: PluginWiringDatabase, from: string, to: string, ports: readonly string[]): WiringReassignmentPlan {
  const offered = new Set(ports), refused: string[] = [];
  const outputs = db.prepare("SELECT project_id, port, artifact_id FROM plugin_port_outputs WHERE plugin_id=? ORDER BY project_id, port").all(from) as
    { project_id: string; port: string; artifact_id: string | null }[];
  for (const row of outputs) {
    if (!offered.has(row.port)) refused.push(`output ${row.project_id}/${row.port}: ${to} has no such port`);
    else if (db.prepare("SELECT 1 FROM plugin_port_outputs WHERE project_id=? AND plugin_id=? AND port=?").get(row.project_id, to, row.port)) {
      refused.push(`output ${row.project_id}/${row.port}: ${to} already holds this port`);
    }
  }
  const bindings = db.prepare("SELECT project_id, target_plugin_id, target_port, source_port, origin FROM plugin_port_bindings WHERE source_plugin_id=? ORDER BY project_id, target_plugin_id, target_port")
    .all(from) as { project_id: string; target_plugin_id: string; target_port: string; source_port: string; origin: string }[];
  for (const row of bindings) {
    const at = `binding ${row.project_id}/${row.target_plugin_id}.${row.target_port}`;
    if (!offered.has(row.source_port)) refused.push(`${at}: ${to} has no port ${row.source_port}`);
    if (row.origin !== "default") refused.push(`${at}: chosen by hand (${row.origin}); the person picks the new source again`);
  }
  const handed = outputs.flatMap(row => row.artifact_id === null ? [] : [{ port: row.port, artifact_id: row.artifact_id }]);
  return { outputs: outputs.length, bindings: bindings.length, handed, refused };
}

/**
 * Move the planned rows inside the caller's transaction. Outputs keep their reference, invalidation, scope key and time; bindings keep
 * their target, port, origin and times. Returns the rows moved; the caller compares them with its plan.
 */
export function reassignWiringSource(db: PluginWiringDatabase, from: string, to: string): { outputs: number; bindings: number } {
  const changes = (result: unknown) => Number((result as { changes: number | bigint }).changes);
  return {
    outputs: changes(db.prepare("UPDATE plugin_port_outputs SET plugin_id=? WHERE plugin_id=?").run(to, from)),
    bindings: changes(db.prepare("UPDATE plugin_port_bindings SET source_plugin_id=? WHERE source_plugin_id=?").run(to, from)),
  };
}
