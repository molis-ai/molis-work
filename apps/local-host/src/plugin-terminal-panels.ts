import type { SqliteDatabase } from "@molis-ai/molis-work-storage";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";

/**
 * The records of the terminals plugins start through `services.terminal` (S-103), in the project catalog: one row per installation,
 * project (none for a Home call), person and key, under the panel id the service derives from those four. The folder is not kept (it is
 * resolved again on every start) and neither is whether the process runs (asked of the terminal host when listed). Aliases are the
 * runtime work contexts a terminal answers to, so the runtime's own session can be resumed in it.
 */
export function createPluginTerminalPanelTables(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS plugin_terminal_panels (
      panel_id TEXT PRIMARY KEY,
      install_id TEXT NOT NULL,
      project_id TEXT REFERENCES projects(project_id),
      actor_id TEXT NOT NULL,
      key TEXT NOT NULL,
      subject TEXT,
      runtime TEXT NOT NULL,
      launch_command TEXT NOT NULL,
      launch_args TEXT NOT NULL,
      title TEXT NOT NULL,
      host_session_id TEXT,
      tab_index INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS plugin_terminal_panels_owner_idx
      ON plugin_terminal_panels(install_id, project_id, actor_id, subject, tab_index);
    CREATE TABLE IF NOT EXISTS plugin_terminal_panel_aliases (
      panel_id TEXT NOT NULL REFERENCES plugin_terminal_panels(panel_id) ON DELETE CASCADE,
      runtime_id TEXT NOT NULL,
      stable_work_context_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (runtime_id, stable_work_context_id)
    );
  `);
}

/** Whose terminal: the call's installation, project and person (never from input). */
export interface TerminalOwner { install_id: string; project_id: string | null; actor_id: string }

export interface PluginTerminalPanelRecord extends TerminalOwner {
  panel_id: string;
  key: string;
  subject: string | null;
  /** A recipe id, or `command` for a program the plugin chose. */
  runtime: string;
  /** The command as the plugin named it (an absolute path or a bare name), resolved again on every start; a recipe's command name. */
  launch_command: string;
  launch_args: string[];
  title: string;
  host_session_id: string | null;
  tab_index: number;
  created_at: string;
  updated_at: string;
}

export interface PluginTerminalPanelPorts {
  /** Binds the runtime work context to the project, so the runtime's calls from this terminal resolve to it. */
  bind(input: { runtime_id: string; stable_work_context_id: string; project_id: string; actor_id: string; cwd?: string }): void;
  appendProjectEvent(projectId: string, type: string, actorId: string, payload: Record<string, unknown>): void;
  now?: () => string;
}

/** The catalog's terminal records; every write runs inside the catalog's commit. */
export class PluginTerminalPanels {
  private readonly now: () => string;

  constructor(private readonly db: SqliteDatabase, private readonly ports: PluginTerminalPanelPorts) {
    this.now = ports.now ?? (() => new Date().toISOString());
  }

  get(panelId: string): PluginTerminalPanelRecord | null {
    const row = this.db.prepare("SELECT * FROM plugin_terminal_panels WHERE panel_id = ?").get(panelId) as Record<string, unknown> | undefined;
    return row ? record(row) : null;
  }

  /** The owner's terminals, of one subject when given, in the order they were opened. */
  list(owner: TerminalOwner, subject?: string): PluginTerminalPanelRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM plugin_terminal_panels
      WHERE install_id = ? AND project_id IS ? AND actor_id = ? AND (? IS NULL OR subject = ?)
      ORDER BY subject, tab_index, created_at, panel_id
    `).all(owner.install_id, owner.project_id, owner.actor_id, subject ?? null, subject ?? null) as Array<Record<string, unknown>>;
    return rows.map(record);
  }

  /** Every terminal of a project, whoever opened it: project deletion asks whether one still runs. */
  listIds(projectId: string): string[] {
    return (this.db.prepare("SELECT panel_id FROM plugin_terminal_panels WHERE project_id = ? ORDER BY panel_id").all(projectId) as Array<{ panel_id: string }>)
      .map(row => row.panel_id);
  }

  /** Records a new terminal, with its own work context as an alias; in a project, binds that context and journals the opening. */
  insert(input: Omit<PluginTerminalPanelRecord, "tab_index" | "created_at" | "updated_at" | "host_session_id">, cwd: string): PluginTerminalPanelRecord {
    const now = this.now();
    const { tab_index } = this.db.prepare(`
      SELECT COALESCE(MAX(tab_index), -1) + 1 AS tab_index FROM plugin_terminal_panels
      WHERE install_id = ? AND project_id IS ? AND actor_id = ? AND subject IS ?
    `).get(input.install_id, input.project_id, input.actor_id, input.subject) as { tab_index: number };
    const row: PluginTerminalPanelRecord = { ...input, host_session_id: null, tab_index: Number(tab_index), created_at: now, updated_at: now };
    this.db.prepare(`
      INSERT INTO plugin_terminal_panels (panel_id, install_id, project_id, actor_id, key, subject, runtime, launch_command, launch_args, title,
        host_session_id, tab_index, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(row.panel_id, row.install_id, row.project_id, row.actor_id, row.key, row.subject, row.runtime, row.launch_command,
      JSON.stringify(row.launch_args), row.title, null, row.tab_index, now, now);
    this.addAlias(row.panel_id, row.runtime, row.panel_id, now);
    if (row.project_id) {
      this.ports.bind({ runtime_id: row.runtime, stable_work_context_id: row.panel_id, project_id: row.project_id, actor_id: row.actor_id, cwd });
      this.ports.appendProjectEvent(row.project_id, "project.terminal_opened", row.actor_id,
        { panel_id: row.panel_id, install_id: row.install_id, subject: row.subject, runtime: row.runtime });
    }
    return row;
  }

  /** Forgets a terminal and its aliases; in a project, journals the closing. */
  remove(panel: PluginTerminalPanelRecord): void {
    this.db.prepare("DELETE FROM plugin_terminal_panel_aliases WHERE panel_id = ?").run(panel.panel_id);
    this.db.prepare("DELETE FROM plugin_terminal_panels WHERE panel_id = ?").run(panel.panel_id);
    if (panel.project_id) this.ports.appendProjectEvent(panel.project_id, "project.terminal_closed", panel.actor_id,
      { panel_id: panel.panel_id, install_id: panel.install_id, subject: panel.subject, runtime: panel.runtime });
  }

  /**
   * The runtime reported its own session for a terminal: keep it, so the terminal resumes it when it starts again, and answer to it as a
   * work context of the same project.
   */
  aliasSession(input: { panel_id: string; runtime_id: string; host_session_id: string }): PluginTerminalPanelRecord {
    const current = this.get(input.panel_id.trim());
    if (!current) throw new ActionError("actions.missing", "找不到这个终端面板");
    const session = input.host_session_id.trim(), runtime = input.runtime_id.trim();
    if (!session || !runtime) throw new ActionError("actions.input_invalid", "Runtime 与它的 Session 标识不能为空");
    const now = this.now();
    this.addAlias(current.panel_id, runtime, session, now);
    if (current.host_session_id !== session) this.db.prepare("UPDATE plugin_terminal_panels SET host_session_id = ?, updated_at = ? WHERE panel_id = ?")
      .run(session, now, current.panel_id);
    // The session is the person's who opened the terminal, as its own work context is.
    if (current.project_id) this.ports.bind({ runtime_id: runtime, stable_work_context_id: session, project_id: current.project_id, actor_id: current.actor_id });
    return { ...current, host_session_id: session, updated_at: current.host_session_id === session ? current.updated_at : now };
  }

  deleteForProject(projectId: string): void {
    this.db.prepare("DELETE FROM plugin_terminal_panel_aliases WHERE panel_id IN (SELECT panel_id FROM plugin_terminal_panels WHERE project_id = ?)").run(projectId);
    this.db.prepare("DELETE FROM plugin_terminal_panels WHERE project_id = ?").run(projectId);
  }

  private addAlias(panelId: string, runtimeId: string, workContextId: string, createdAt: string): void {
    this.db.prepare(`
      INSERT INTO plugin_terminal_panel_aliases (panel_id, runtime_id, stable_work_context_id, created_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(runtime_id, stable_work_context_id) DO UPDATE SET panel_id = excluded.panel_id
    `).run(panelId, runtimeId, workContextId, createdAt);
  }
}

function record(row: Record<string, unknown>): PluginTerminalPanelRecord {
  const args: unknown = JSON.parse(String(row.launch_args));
  if (!Array.isArray(args) || !args.every(arg => typeof arg === "string")) throw new ActionError("actions.execution_failed", "终端面板的启动参数记录无效");
  return {
    panel_id: String(row.panel_id), install_id: String(row.install_id), project_id: row.project_id == null ? null : String(row.project_id),
    actor_id: String(row.actor_id), key: String(row.key), subject: row.subject == null ? null : String(row.subject), runtime: String(row.runtime),
    launch_command: String(row.launch_command), launch_args: args, title: String(row.title),
    host_session_id: row.host_session_id == null ? null : String(row.host_session_id), tab_index: Number(row.tab_index),
    created_at: String(row.created_at), updated_at: String(row.updated_at),
  };
}
