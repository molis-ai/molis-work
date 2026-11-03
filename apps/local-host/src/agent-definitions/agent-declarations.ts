import type { AgentDefinitionRegistration } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import { applySqliteBaseline, openHomeSqliteDatabase, type HomeStoreDeclaration, type SqliteBaseline } from "@molis-ai/molis-work-storage";

const AGENT_DECLARATIONS_STORE = "agent-declarations";
type DatabaseSync = ReturnType<typeof openHomeSqliteDatabase>;

/**
 * Each installation's last registered Agent declaration (PG-051 Q1 b): the register shows a plugin that is not running from it, so
 * the person can see and edit its prompts before it runs again. Written whole on each registration, removed when it is uninstalled.
 */
export const AGENT_DECLARATIONS_BASELINE: SqliteBaseline = { version: 1, schema: `
CREATE TABLE install_declarations (
  install_id TEXT NOT NULL, owner_id TEXT NOT NULL, registration TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY (install_id, owner_id)
);` };

/** This store in the Home's store registry (W4-11). */
export const AGENT_DECLARATIONS_HOME_STORE: HomeStoreDeclaration = { path: AGENT_DECLARATIONS_STORE, library: { baseline: AGENT_DECLARATIONS_BASELINE } };

export class AgentDeclarations {
  constructor(private readonly db: DatabaseSync, private readonly now = () => new Date()) {
    applySqliteBaseline(db, AGENT_DECLARATIONS_STORE, AGENT_DECLARATIONS_BASELINE);
  }

  static open(homeDirectory: string): AgentDeclarations {
    return new AgentDeclarations(openHomeSqliteDatabase(homeDirectory, AGENT_DECLARATIONS_STORE));
  }

  /** The installation's declaration for an owner, whole: a new version replaces the earlier one, nothing of it is kept. */
  remember(installId: string, registration: AgentDefinitionRegistration): void {
    this.db.prepare(`INSERT INTO install_declarations (install_id, owner_id, registration, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT (install_id, owner_id) DO UPDATE SET registration = excluded.registration, updated_at = excluded.updated_at`)
      .run(installId, registration.owner_id, JSON.stringify(registration), this.now().toISOString());
  }

  /** Whether the installation has a declaration remembered for an owner. */
  has(installId: string, ownerId: string): boolean {
    return this.db.prepare("SELECT 1 FROM install_declarations WHERE install_id = ? AND owner_id = ?").get(installId, ownerId) !== undefined;
  }

  /** Forget the installation's declaration for one owner: its newer version declares nothing. */
  forgetOwner(installId: string, ownerId: string): void {
    this.db.prepare("DELETE FROM install_declarations WHERE install_id = ? AND owner_id = ?").run(installId, ownerId);
  }

  /** Forget an uninstalled installation; returns the owners it had declared for. */
  forget(installId: string): string[] {
    const owners = this.db.prepare("SELECT owner_id FROM install_declarations WHERE install_id = ?").all(installId).map(row => String(row.owner_id));
    this.db.prepare("DELETE FROM install_declarations WHERE install_id = ?").run(installId);
    return owners;
  }

  all(): Array<{ install_id: string; registration: AgentDefinitionRegistration }> {
    return this.db.prepare("SELECT install_id, registration FROM install_declarations ORDER BY updated_at, install_id").all()
      .map(row => ({ install_id: String(row.install_id), registration: JSON.parse(String(row.registration)) as AgentDefinitionRegistration }));
  }
}

/** A remembered declaration as the register shows it while its installation does not run: visible and editable, never called. */
export function notRunning(registration: AgentDefinitionRegistration): AgentDefinitionRegistration {
  return registration.source.kind === "plugin" ? { ...registration, source: { ...registration.source, state: "disabled" } } : registration;
}
