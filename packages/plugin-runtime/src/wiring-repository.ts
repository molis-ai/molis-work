import type {
  PluginInputGroupSelectionRecord,
  PluginPortArtifactBindingRecord,
  PluginPortBindingRecord,
  PluginPortOutputRecord,
  PluginWiringRepository,
} from "@molis-ai/molis-work-contracts/platform/plugin";

export interface PluginWiringDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): {
    get(...parameters: unknown[]): unknown;
    all(...parameters: unknown[]): unknown[];
    run(...parameters: unknown[]): unknown;
  };
}

function key(...parts: string[]): string {
  return parts.join("\u0000");
}

/** Reference repository for tests and project-less reference runs. */
export class MemoryPluginWiringRepository implements PluginWiringRepository {
  readonly #bindings = new Map<string, PluginPortBindingRecord>();
  readonly #fixed = new Map<string, PluginPortArtifactBindingRecord>();
  readonly #groups = new Map<string, PluginInputGroupSelectionRecord>();
  readonly #outputs = new Map<string, PluginPortOutputRecord>();

  listBindings(projectId: string, targetPluginId?: string): PluginPortBindingRecord[] {
    return [...this.#bindings.values()]
      .filter((record) => record.project_id === projectId
        && (targetPluginId === undefined || record.target_plugin_id === targetPluginId))
      .map((record) => ({ ...record }))
      .sort((left, right) => left.target_plugin_id.localeCompare(right.target_plugin_id)
        || left.target_port.localeCompare(right.target_port));
  }

  getBinding(
    projectId: string,
    targetPluginId: string,
    targetPort: string,
  ): PluginPortBindingRecord | null {
    const record = this.#bindings.get(key(projectId, targetPluginId, targetPort));
    return record ? { ...record } : null;
  }

  saveBinding(record: PluginPortBindingRecord): void {
    const port = key(record.project_id, record.target_plugin_id, record.target_port);
    this.#fixed.delete(port);
    this.#bindings.set(port, { ...record });
  }

  getArtifactBinding(projectId: string, targetPluginId: string, targetPort: string): PluginPortArtifactBindingRecord | null {
    const record = this.#fixed.get(key(projectId, targetPluginId, targetPort));
    return record ? { ...record } : null;
  }

  saveArtifactBinding(record: PluginPortArtifactBindingRecord): void {
    const port = key(record.project_id, record.target_plugin_id, record.target_port);
    this.#bindings.delete(port);
    this.#fixed.set(port, { ...record });
  }

  deleteBinding(projectId: string, targetPluginId: string, targetPort: string): void {
    this.#bindings.delete(key(projectId, targetPluginId, targetPort));
    this.#fixed.delete(key(projectId, targetPluginId, targetPort));
  }

  deleteBindingsForPlugin(projectId: string, pluginId: string): void {
    for (const [mapKey, record] of [...this.#bindings]) {
      if (record.project_id !== projectId) continue;
      if (record.target_plugin_id === pluginId || record.source_plugin_id === pluginId) {
        this.#bindings.delete(mapKey);
      }
    }
    for (const [mapKey, record] of [...this.#fixed]) {
      if (record.project_id === projectId && record.target_plugin_id === pluginId) this.#fixed.delete(mapKey);
    }
  }

  getInputGroup(projectId: string, pluginId: string): PluginInputGroupSelectionRecord | null {
    const record = this.#groups.get(key(projectId, pluginId));
    return record ? { ...record } : null;
  }

  saveInputGroup(record: PluginInputGroupSelectionRecord): void {
    this.#groups.set(key(record.project_id, record.plugin_id), { ...record });
  }

  listInputGroups(projectId: string): PluginInputGroupSelectionRecord[] {
    return [...this.#groups.values()]
      .filter((record) => record.project_id === projectId)
      .map((record) => ({ ...record }));
  }

  getOutput(projectId: string, pluginId: string, port: string): PluginPortOutputRecord | null {
    const record = this.#outputs.get(key(projectId, pluginId, port));
    return record ? { ...record } : null;
  }

  listOutputs(projectId: string): PluginPortOutputRecord[] {
    return [...this.#outputs.values()]
      .filter((record) => record.project_id === projectId)
      .map((record) => ({ ...record }));
  }

  saveOutput(record: PluginPortOutputRecord): void {
    this.#outputs.set(key(record.project_id, record.plugin_id, record.port), { ...record });
  }

  deleteOutputsForPlugin(projectId: string, pluginId: string): void {
    for (const [mapKey, record] of [...this.#outputs]) {
      if (record.project_id === projectId && record.plugin_id === pluginId) {
        this.#outputs.delete(mapKey);
      }
    }
  }
}

/** The port wiring tables, as one current schema; the host composes them into the project database baseline. */
export const PLUGIN_WIRING_SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS plugin_port_bindings (
      project_id TEXT NOT NULL,
      target_plugin_id TEXT NOT NULL,
      target_port TEXT NOT NULL,
      source_plugin_id TEXT NOT NULL,
      source_port TEXT NOT NULL,
      origin TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, target_plugin_id, target_port)
    );
    CREATE TABLE IF NOT EXISTS plugin_port_artifact_bindings (
      project_id TEXT NOT NULL,
      target_plugin_id TEXT NOT NULL,
      target_port TEXT NOT NULL,
      artifact_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      actor_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (project_id, target_plugin_id, target_port)
    );
    CREATE TABLE IF NOT EXISTS plugin_input_groups (
      project_id TEXT NOT NULL,
      plugin_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, plugin_id)
    );
    CREATE TABLE IF NOT EXISTS plugin_port_outputs (
      project_id TEXT NOT NULL,
      plugin_id TEXT NOT NULL,
      port TEXT NOT NULL,
      artifact_id TEXT,
      version INTEGER,
      invalidated_reason TEXT,
      scope_key TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, plugin_id, port)
    );
`;

/**
 * Durable wiring owned by Plugin Runtime: who is connected to whom, which input
 * group the user picked, and each output port's current version.
 */
export class SqlitePluginWiringRepository implements PluginWiringRepository {
  constructor(private readonly db: PluginWiringDatabase) {
    db.exec(PLUGIN_WIRING_SCHEMA_SQL);
  }

  listBindings(projectId: string, targetPluginId?: string): PluginPortBindingRecord[] {
    const rows = targetPluginId === undefined
      ? this.db.prepare(`SELECT * FROM plugin_port_bindings WHERE project_id = ?
          ORDER BY target_plugin_id, target_port`).all(projectId)
      : this.db.prepare(`SELECT * FROM plugin_port_bindings WHERE project_id = ? AND target_plugin_id = ?
          ORDER BY target_port`).all(projectId, targetPluginId);
    return rows.map((row) => ({ ...(row as PluginPortBindingRecord) }));
  }

  getBinding(
    projectId: string,
    targetPluginId: string,
    targetPort: string,
  ): PluginPortBindingRecord | null {
    const row = this.db.prepare(`SELECT * FROM plugin_port_bindings
      WHERE project_id = ? AND target_plugin_id = ? AND target_port = ?`)
      .get(projectId, targetPluginId, targetPort) as PluginPortBindingRecord | undefined;
    return row ? { ...row } : null;
  }

  saveBinding(record: PluginPortBindingRecord): void {
    this.db.prepare(`DELETE FROM plugin_port_artifact_bindings WHERE project_id = ? AND target_plugin_id = ? AND target_port = ?`)
      .run(record.project_id, record.target_plugin_id, record.target_port);
    this.db.prepare(`INSERT INTO plugin_port_bindings (
      project_id, target_plugin_id, target_port, source_plugin_id, source_port, origin, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (project_id, target_plugin_id, target_port) DO UPDATE SET
      source_plugin_id = excluded.source_plugin_id, source_port = excluded.source_port,
      origin = excluded.origin, updated_at = excluded.updated_at`).run(
      record.project_id,
      record.target_plugin_id,
      record.target_port,
      record.source_plugin_id,
      record.source_port,
      record.origin,
      record.created_at,
      record.updated_at,
    );
  }

  getArtifactBinding(projectId: string, targetPluginId: string, targetPort: string): PluginPortArtifactBindingRecord | null {
    const row = this.db.prepare(`SELECT * FROM plugin_port_artifact_bindings
      WHERE project_id = ? AND target_plugin_id = ? AND target_port = ?`)
      .get(projectId, targetPluginId, targetPort) as PluginPortArtifactBindingRecord | undefined;
    return row ? { ...row } : null;
  }

  saveArtifactBinding(record: PluginPortArtifactBindingRecord): void {
    this.db.prepare(`DELETE FROM plugin_port_bindings WHERE project_id = ? AND target_plugin_id = ? AND target_port = ?`)
      .run(record.project_id, record.target_plugin_id, record.target_port);
    this.db.prepare(`INSERT INTO plugin_port_artifact_bindings (project_id, target_plugin_id, target_port, artifact_id, version, actor_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (project_id, target_plugin_id, target_port) DO UPDATE SET
        artifact_id = excluded.artifact_id, version = excluded.version, actor_id = excluded.actor_id, created_at = excluded.created_at`).run(
      record.project_id, record.target_plugin_id, record.target_port, record.artifact_id, record.version, record.actor_id, record.created_at);
  }

  deleteBinding(projectId: string, targetPluginId: string, targetPort: string): void {
    for (const table of ["plugin_port_bindings", "plugin_port_artifact_bindings"]) {
      this.db.prepare(`DELETE FROM ${table} WHERE project_id = ? AND target_plugin_id = ? AND target_port = ?`)
        .run(projectId, targetPluginId, targetPort);
    }
  }

  deleteBindingsForPlugin(projectId: string, pluginId: string): void {
    this.db.prepare(`DELETE FROM plugin_port_bindings
      WHERE project_id = ? AND (target_plugin_id = ? OR source_plugin_id = ?)`)
      .run(projectId, pluginId, pluginId);
    this.db.prepare("DELETE FROM plugin_port_artifact_bindings WHERE project_id = ? AND target_plugin_id = ?").run(projectId, pluginId);
  }

  getInputGroup(projectId: string, pluginId: string): PluginInputGroupSelectionRecord | null {
    const row = this.db.prepare("SELECT * FROM plugin_input_groups WHERE project_id = ? AND plugin_id = ?")
      .get(projectId, pluginId) as PluginInputGroupSelectionRecord | undefined;
    return row ? { ...row } : null;
  }

  saveInputGroup(record: PluginInputGroupSelectionRecord): void {
    this.db.prepare(`INSERT INTO plugin_input_groups (project_id, plugin_id, group_id, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (project_id, plugin_id) DO UPDATE SET
        group_id = excluded.group_id, updated_at = excluded.updated_at`).run(
      record.project_id,
      record.plugin_id,
      record.group_id,
      record.updated_at,
    );
  }

  listInputGroups(projectId: string): PluginInputGroupSelectionRecord[] {
    return this.db.prepare("SELECT * FROM plugin_input_groups WHERE project_id = ? ORDER BY plugin_id")
      .all(projectId)
      .map((row) => ({ ...(row as PluginInputGroupSelectionRecord) }));
  }

  getOutput(projectId: string, pluginId: string, port: string): PluginPortOutputRecord | null {
    const row = this.db.prepare(`SELECT * FROM plugin_port_outputs
      WHERE project_id = ? AND plugin_id = ? AND port = ?`)
      .get(projectId, pluginId, port) as PluginPortOutputRecord | undefined;
    return row ? { ...row, version: row.version === null ? null : Number(row.version) } : null;
  }

  listOutputs(projectId: string): PluginPortOutputRecord[] {
    return this.db.prepare("SELECT * FROM plugin_port_outputs WHERE project_id = ? ORDER BY plugin_id, port")
      .all(projectId)
      .map((row) => {
        const record = row as PluginPortOutputRecord;
        return { ...record, version: record.version === null ? null : Number(record.version) };
      });
  }

  saveOutput(record: PluginPortOutputRecord): void {
    this.db.prepare(`INSERT INTO plugin_port_outputs (
      project_id, plugin_id, port, artifact_id, version, invalidated_reason, scope_key, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (project_id, plugin_id, port) DO UPDATE SET
      artifact_id = excluded.artifact_id, version = excluded.version,
      invalidated_reason = excluded.invalidated_reason, scope_key = excluded.scope_key,
      updated_at = excluded.updated_at`).run(
      record.project_id,
      record.plugin_id,
      record.port,
      record.artifact_id,
      record.version,
      record.invalidated_reason,
      record.scope_key,
      record.updated_at,
    );
  }

  deleteOutputsForPlugin(projectId: string, pluginId: string): void {
    this.db.prepare("DELETE FROM plugin_port_outputs WHERE project_id = ? AND plugin_id = ?")
      .run(projectId, pluginId);
  }
}
