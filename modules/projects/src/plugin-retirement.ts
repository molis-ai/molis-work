import type { ProjectsSqliteDatabase } from "./sqlite.js";

const HOLDERS = `SELECT project_id FROM project_plugins WHERE plugin_id = ?
  UNION SELECT project_id FROM project_portable_plugins WHERE plugin_id = ? ORDER BY project_id`;

/** Read-only: the projects whose membership (local or portable) still names a plugin the Host no longer ships. */
export function projectsHoldingPlugin(db: Pick<ProjectsSqliteDatabase, "prepare">, pluginId: string): string[] {
  return (db.prepare(HOLDERS).all(pluginId, pluginId) as { project_id: string }[]).map(row => row.project_id);
}

/**
 * Take a retired plugin out of every project's membership, local and portable, each with the `project.plugin_removed` event an ordinary
 * removal records (so account sync carries it). Not the user-facing removal: no catalog lookup (the plugin is gone, it would refuse with
 * plugin_not_found), no companions, no exclusion row (nothing is left to offer). Runs inside the caller's transaction; returns the projects.
 */
export function retireProjectPlugin(db: Pick<ProjectsSqliteDatabase, "prepare">, input: {
  readonly plugin_id: string; readonly actor_id: string; readonly at: string; eventId(): string;
}): string[] {
  const projects = projectsHoldingPlugin(db, input.plugin_id);
  const active = db.prepare("DELETE FROM project_plugins WHERE project_id = ? AND plugin_id = ?");
  const portable = db.prepare("DELETE FROM project_portable_plugins WHERE project_id = ? AND plugin_id = ?");
  const event = db.prepare("INSERT INTO project_events (event_id, project_id, type, actor_id, payload_json, created_at) VALUES (?, ?, 'project.plugin_removed', ?, ?, ?)");
  for (const projectId of projects) {
    active.run(projectId, input.plugin_id);
    portable.run(projectId, input.plugin_id);
    event.run(input.eventId(), projectId, input.actor_id, JSON.stringify({ plugin_id: input.plugin_id }), input.at);
  }
  return projects;
}
