import { randomUUID } from "node:crypto";
import type { ActionSceneBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { inboxErrors } from "@molis-ai/molis-work-contracts/modules/attention-resumption";

/** The two statements the binding needs, synchronous like the transaction it runs in (a host connection today, the plugin's project database next). */
export interface InboxSql {
  get(statement: string, ...parameters: unknown[]): unknown;
  run(statement: string, ...parameters: unknown[]): { changes: number | bigint };
}

interface BindingRow { action_binding_json: string; binding_revision: string }

/** One project's bindings of the scenes Inbox declares. A binding is its function and whether it is on; the revision is the row's, never the caller's. */
export class InboxSceneBindings {
  constructor(private readonly sql: InboxSql, private readonly now: () => string = () => new Date().toISOString()) {}

  get(projectId: string, sceneId: string): ActionSceneBinding | null {
    const row = this.sql.get("SELECT action_binding_json, binding_revision FROM inbox_scene_bindings WHERE project_id = ? AND scene_id = ?", projectId, sceneId) as BindingRow | undefined;
    return row ? { ...JSON.parse(row.action_binding_json) as ActionSceneBinding, revision: row.binding_revision } : null;
  }

  /**
   * Writes the binding. Without `expectedRevision` it replaces; with `null` it creates only if there is none; with a revision it replaces only
   * that revision. Anything else is a conflict: the person is told to reload, never overwritten.
   */
  save(projectId: string, binding: ActionSceneBinding, expectedRevision?: string | null): ActionSceneBinding {
    const stored: ActionSceneBinding = { binding_id: binding.binding_id, scene_id: binding.scene_id, scene_version: binding.scene_version,
      project_id: binding.project_id, function: { capability_id: binding.function.capability_id, version: binding.function.version,
        ...(binding.function.provider_id ? { provider_id: binding.function.provider_id } : {}) },
      enabled: binding.enabled, title: binding.title, ...(binding.href ? { href: binding.href } : {}) };
    const revision = randomUUID(), at = this.now(), json = JSON.stringify(stored);
    const insert = "INSERT INTO inbox_scene_bindings (project_id, scene_id, action_binding_json, binding_revision, updated_at) VALUES (?, ?, ?, ?, ?)";
    const written = expectedRevision === undefined
      ? this.sql.run(`${insert} ON CONFLICT(project_id, scene_id) DO UPDATE SET action_binding_json = excluded.action_binding_json, binding_revision = excluded.binding_revision, updated_at = excluded.updated_at`,
        projectId, binding.scene_id, json, revision, at)
      : expectedRevision === null ? this.sql.run(`${insert} ON CONFLICT(project_id, scene_id) DO NOTHING`, projectId, binding.scene_id, json, revision, at)
        : this.sql.run("UPDATE inbox_scene_bindings SET action_binding_json = ?, binding_revision = ?, updated_at = ? WHERE project_id = ? AND scene_id = ? AND binding_revision = ?",
          json, revision, at, projectId, binding.scene_id, expectedRevision);
    if (Number(written.changes) !== 1) throw inboxErrors.revision_conflict("配置已变化，请刷新后再试");
    return { ...stored, revision };
  }
}
