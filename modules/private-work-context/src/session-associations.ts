import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { ContextAccess, ContextLedgerApi, ObjectRef } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import type { MolisWorkSessionGoalLink } from "./contract-aliases.js";
import { MolisWorkSessionError } from "./errors.js";
import { mapGoalLink, optionalText } from "./session-schema.js";

const scope = { kind: "personal", id: "private-work-context" } as const;
const access = (actor = "module:private-work-context"): ContextAccess => ({ actor_id: actor, scope });
const source = (sessionId: string): ObjectRef => ({ module: "private-work-context", id: sessionId, version: null, scope });
const target = (module: "goals" | "projects", id: string, projectId: string | null, objectType?: string): ObjectRef =>
  ({ module, id, version: null, scope, project_id: projectId, ...(objectType ? { object_type: objectType } : {}) });

export interface SessionAssociations {
  project_id: string | null;
  current_goal_id: string | null;
  workspace_id: string | null;
}

/** Owns Session association semantics; persistence belongs exclusively to the injected Ledger. */
export class SessionAssociationRepository {
  constructor(private readonly ledger: ContextLedgerApi) {}

  read(sessionId: string): SessionAssociations {
    const active = this.ledger.query.list(access(), { type: "work.goal", source: source(sessionId) });
    return {
      project_id: this.ledger.query.get(access(), `work.project:${sessionId}`)?.target.id ?? null,
      current_goal_id: active[0]?.target.id ?? null,
      workspace_id: this.ledger.query.get(access(), `work.workspace:${sessionId}`)?.target.id ?? null,
    };
  }

  history(sessionId: string): MolisWorkSessionGoalLink[] {
    return this.ledger.query.list(access(), { type: "work.goal", source: source(sessionId), include_removed: true })
      .map((latest): MolisWorkSessionGoalLink => {
        const first = this.ledger.query.history(access(), latest.key)[0]!;
        return { link_id: latest.key, session_id: sessionId, goal_id: latest.target.id,
          relation: latest.state === "active" ? "current" : "history", linked_by: first.actor_id,
          created_at: first.recorded_at, ended_at: latest.state === "active" || latest.cause === "work.legacy_end_unknown"
            ? null : latest.recorded_at };
      }).sort((a, b) => Number(b.relation === "current") - Number(a.relation === "current")
        || (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0)
        || (a.link_id < b.link_id ? 1 : a.link_id > b.link_id ? -1 : 0));
  }

  set(sessionId: string, value: SessionAssociations, actor: string, at: string): void {
    const current = this.ledger.query.list(access(), { type: "work.goal", source: source(sessionId) });
    const sameGoal = current.length === 1 && current[0]!.target.id === value.current_goal_id
      && (current[0]!.target.project_id ?? null) === value.project_id;
    if (!sameGoal) {
      for (const edge of current) this.ledger.commands.remove(access(actor), edge.key, "work.goal_changed", at);
      if (value.current_goal_id) this.putGoal(sessionId, value.current_goal_id, value.project_id, actor, at);
    }
    this.setReference(sessionId, "project", value.project_id, value.project_id, actor, at);
    this.setReference(sessionId, "workspace", value.workspace_id, value.project_id, actor, at);
  }

  private setReference(sessionId: string, kind: "project" | "workspace", id: string | null,
    projectId: string | null, actor: string, at: string): void {
    const key = `work.${kind}:${sessionId}`;
    if (id === null) { this.ledger.commands.remove(access(actor), key, `work.${kind}_unlinked`, at); return; }
    this.ledger.commands.put(access(actor), { key, type: `work.${kind}`, source: source(sessionId),
      target: target("projects", id, projectId, kind), cause: `work.${kind}_associated`, recorded_at: at });
  }

  private putGoal(sessionId: string, goalId: string, projectId: string | null, actor: string, at: string,
    key = `session-goal-${randomUUID()}`, cause = "work.goal_associated"): void {
    this.ledger.commands.put(access(actor), { key, type: "work.goal", source: source(sessionId),
      target: target("goals", goalId, projectId), cause, recorded_at: at });
  }

  /** Reads only this owner's old schema. A failed import leaves all old facts recoverable. */
  migrate(db: Database.Database): void {
    const version = (db.prepare("SELECT value FROM session_meta WHERE key = 'schema_version'").get() as { value: string }).value;
    if (Number(version) >= 4) return;
    db.transaction(() => {
      const sessions = db.prepare("SELECT session_id, project_id, workspace_id, current_goal_id, updated_at FROM sessions")
        .all() as Array<Record<string, unknown>>;
      for (const session of sessions) {
        const id = String(session.session_id);
        const links = (db.prepare("SELECT * FROM session_goal_links WHERE session_id = ? ORDER BY created_at, link_id")
          .all(id) as Array<Record<string, unknown>>).map(mapGoalLink);
        const current = links.filter((link) => link.relation === "current");
        const goalId = optionalText(session.current_goal_id);
        if (current.length > 1 || (current[0]?.goal_id ?? null) !== goalId) {
          throw new MolisWorkSessionError("session.invalid_input", "旧 Session 当前 Goal 与历史关联不一致，关联迁移已回滚");
        }
        for (const link of links) {
          this.putGoal(id, link.goal_id, link.relation === "current" ? optionalText(session.project_id) : null,
            link.linked_by, link.created_at, link.link_id, "work.legacy_goal_link");
          if (link.relation === "history") this.ledger.commands.remove(access("legacy-session-migration"), link.link_id,
            link.ended_at === null ? "work.legacy_end_unknown" : "work.legacy_goal_ended", link.ended_at ?? link.created_at);
        }
        this.setReference(id, "project", optionalText(session.project_id), optionalText(session.project_id),
          "legacy-session-migration", String(session.updated_at));
        this.setReference(id, "workspace", optionalText(session.workspace_id), optionalText(session.project_id),
          "legacy-session-migration", String(session.updated_at));
      }
      db.exec("DELETE FROM session_goal_links; UPDATE sessions SET project_id = NULL, workspace_id = NULL, current_goal_id = NULL;");
      db.prepare("UPDATE session_meta SET value = '4' WHERE key = 'schema_version'").run();
    }).immediate();
  }
}
