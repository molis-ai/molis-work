import type {
  PluginInputGroupSelectionRecord,
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
  readonly #groups = new Map<string, PluginInputGroupSelectionRecord>();
  readonly #outputs = new Map<string, PluginPortOutputRecord>();

  listBindings(boardId: string, targetPluginId?: string): PluginPortBindingRecord[] {
    return [...this.#bindings.values()]
      .filter((record) => record.board_id === boardId
        && (targetPluginId === undefined || record.target_plugin_id === targetPluginId))
      .map((record) => ({ ...record }))
      .sort((left, right) => left.target_plugin_id.localeCompare(right.target_plugin_id)
        || left.target_port.localeCompare(right.target_port));
  }

  getBinding(
    boardId: string,
    targetPluginId: string,
    targetPort: string,
  ): PluginPortBindingRecord | null {
    const record = this.#bindings.get(key(boardId, targetPluginId, targetPort));
    return record ? { ...record } : null;
  }

  saveBinding(record: PluginPortBindingRecord): void {
    this.#bindings.set(
      key(record.board_id, record.target_plugin_id, record.target_port),
      { ...record },
    );
  }

  deleteBinding(boardId: string, targetPluginId: string, targetPort: string): void {
    this.#bindings.delete(key(boardId, targetPluginId, targetPort));
  }

  deleteBindingsForPlugin(boardId: string, pluginId: string): void {
    for (const [mapKey, record] of [...this.#bindings]) {
      if (record.board_id !== boardId) continue;
      if (record.target_plugin_id === pluginId || record.source_plugin_id === pluginId) {
        this.#bindings.delete(mapKey);
      }
    }
  }

  getInputGroup(boardId: string, pluginId: string): PluginInputGroupSelectionRecord | null {
    const record = this.#groups.get(key(boardId, pluginId));
    return record ? { ...record } : null;
  }

  saveInputGroup(record: PluginInputGroupSelectionRecord): void {
    this.#groups.set(key(record.board_id, record.plugin_id), { ...record });
  }

  listInputGroups(boardId: string): PluginInputGroupSelectionRecord[] {
    return [...this.#groups.values()]
      .filter((record) => record.board_id === boardId)
      .map((record) => ({ ...record }));
  }

  getOutput(boardId: string, pluginId: string, port: string): PluginPortOutputRecord | null {
    const record = this.#outputs.get(key(boardId, pluginId, port));
    return record ? { ...record } : null;
  }

  listOutputs(boardId: string): PluginPortOutputRecord[] {
    return [...this.#outputs.values()]
      .filter((record) => record.board_id === boardId)
      .map((record) => ({ ...record }));
  }

  saveOutput(record: PluginPortOutputRecord): void {
    this.#outputs.set(key(record.board_id, record.plugin_id, record.port), { ...record });
  }

  deleteOutputsForPlugin(boardId: string, pluginId: string): void {
    for (const [mapKey, record] of [...this.#outputs]) {
      if (record.board_id === boardId && record.plugin_id === pluginId) {
        this.#outputs.delete(mapKey);
      }
    }
  }
}

/**
 * Durable wiring owned by Plugin Runtime: who is connected to whom, which input
 * group the user picked, and each output port's current version.
 */
export class SqlitePluginWiringRepository implements PluginWiringRepository {
  constructor(private readonly db: PluginWiringDatabase) {
    db.exec(`CREATE TABLE IF NOT EXISTS plugin_port_bindings (
      board_id TEXT NOT NULL,
      target_plugin_id TEXT NOT NULL,
      target_port TEXT NOT NULL,
      source_plugin_id TEXT NOT NULL,
      source_port TEXT NOT NULL,
      origin TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (board_id, target_plugin_id, target_port)
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS plugin_input_groups (
      board_id TEXT NOT NULL,
      plugin_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (board_id, plugin_id)
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS plugin_port_outputs (
      board_id TEXT NOT NULL,
      plugin_id TEXT NOT NULL,
      port TEXT NOT NULL,
      artifact_id TEXT,
      version INTEGER,
      invalidated_reason TEXT,
      scope_key TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (board_id, plugin_id, port)
    )`);
  }

  listBindings(boardId: string, targetPluginId?: string): PluginPortBindingRecord[] {
    const rows = targetPluginId === undefined
      ? this.db.prepare(`SELECT * FROM plugin_port_bindings WHERE board_id = ?
          ORDER BY target_plugin_id, target_port`).all(boardId)
      : this.db.prepare(`SELECT * FROM plugin_port_bindings WHERE board_id = ? AND target_plugin_id = ?
          ORDER BY target_port`).all(boardId, targetPluginId);
    return rows.map((row) => ({ ...(row as PluginPortBindingRecord) }));
  }

  getBinding(
    boardId: string,
    targetPluginId: string,
    targetPort: string,
  ): PluginPortBindingRecord | null {
    const row = this.db.prepare(`SELECT * FROM plugin_port_bindings
      WHERE board_id = ? AND target_plugin_id = ? AND target_port = ?`)
      .get(boardId, targetPluginId, targetPort) as PluginPortBindingRecord | undefined;
    return row ? { ...row } : null;
  }

  saveBinding(record: PluginPortBindingRecord): void {
    this.db.prepare(`INSERT INTO plugin_port_bindings (
      board_id, target_plugin_id, target_port, source_plugin_id, source_port, origin, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (board_id, target_plugin_id, target_port) DO UPDATE SET
      source_plugin_id = excluded.source_plugin_id, source_port = excluded.source_port,
      origin = excluded.origin, updated_at = excluded.updated_at`).run(
      record.board_id,
      record.target_plugin_id,
      record.target_port,
      record.source_plugin_id,
      record.source_port,
      record.origin,
      record.created_at,
      record.updated_at,
    );
  }

  deleteBinding(boardId: string, targetPluginId: string, targetPort: string): void {
    this.db.prepare(`DELETE FROM plugin_port_bindings
      WHERE board_id = ? AND target_plugin_id = ? AND target_port = ?`)
      .run(boardId, targetPluginId, targetPort);
  }

  deleteBindingsForPlugin(boardId: string, pluginId: string): void {
    this.db.prepare(`DELETE FROM plugin_port_bindings
      WHERE board_id = ? AND (target_plugin_id = ? OR source_plugin_id = ?)`)
      .run(boardId, pluginId, pluginId);
  }

  getInputGroup(boardId: string, pluginId: string): PluginInputGroupSelectionRecord | null {
    const row = this.db.prepare("SELECT * FROM plugin_input_groups WHERE board_id = ? AND plugin_id = ?")
      .get(boardId, pluginId) as PluginInputGroupSelectionRecord | undefined;
    return row ? { ...row } : null;
  }

  saveInputGroup(record: PluginInputGroupSelectionRecord): void {
    this.db.prepare(`INSERT INTO plugin_input_groups (board_id, plugin_id, group_id, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (board_id, plugin_id) DO UPDATE SET
        group_id = excluded.group_id, updated_at = excluded.updated_at`).run(
      record.board_id,
      record.plugin_id,
      record.group_id,
      record.updated_at,
    );
  }

  listInputGroups(boardId: string): PluginInputGroupSelectionRecord[] {
    return this.db.prepare("SELECT * FROM plugin_input_groups WHERE board_id = ? ORDER BY plugin_id")
      .all(boardId)
      .map((row) => ({ ...(row as PluginInputGroupSelectionRecord) }));
  }

  getOutput(boardId: string, pluginId: string, port: string): PluginPortOutputRecord | null {
    const row = this.db.prepare(`SELECT * FROM plugin_port_outputs
      WHERE board_id = ? AND plugin_id = ? AND port = ?`)
      .get(boardId, pluginId, port) as PluginPortOutputRecord | undefined;
    return row ? { ...row, version: row.version === null ? null : Number(row.version) } : null;
  }

  listOutputs(boardId: string): PluginPortOutputRecord[] {
    return this.db.prepare("SELECT * FROM plugin_port_outputs WHERE board_id = ? ORDER BY plugin_id, port")
      .all(boardId)
      .map((row) => {
        const record = row as PluginPortOutputRecord;
        return { ...record, version: record.version === null ? null : Number(record.version) };
      });
  }

  saveOutput(record: PluginPortOutputRecord): void {
    this.db.prepare(`INSERT INTO plugin_port_outputs (
      board_id, plugin_id, port, artifact_id, version, invalidated_reason, scope_key, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (board_id, plugin_id, port) DO UPDATE SET
      artifact_id = excluded.artifact_id, version = excluded.version,
      invalidated_reason = excluded.invalidated_reason, scope_key = excluded.scope_key,
      updated_at = excluded.updated_at`).run(
      record.board_id,
      record.plugin_id,
      record.port,
      record.artifact_id,
      record.version,
      record.invalidated_reason,
      record.scope_key,
      record.updated_at,
    );
  }

  deleteOutputsForPlugin(boardId: string, pluginId: string): void {
    this.db.prepare("DELETE FROM plugin_port_outputs WHERE board_id = ? AND plugin_id = ?")
      .run(boardId, pluginId);
  }
}
