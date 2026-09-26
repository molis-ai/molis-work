import { randomUUID } from "node:crypto";
import type { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { DEFAULT_ASSISTANT_PREFERENCES, type AssistantPreferences, type AssistantSuggestion } from "./personal-assistant-types.js";

/** Owned tables only. Host injects its chosen database; no global migration or hidden memory. */
export const PERSONAL_ASSISTANT_SCHEMA = `
CREATE TABLE IF NOT EXISTS personal_assistant_preferences (
  scope TEXT PRIMARY KEY, revision INTEGER NOT NULL, body TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS personal_assistant_suggestions (
  scope TEXT NOT NULL, id TEXT NOT NULL, fingerprint TEXT NOT NULL, revision INTEGER NOT NULL,
  status TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(scope,id), UNIQUE(scope,fingerprint)
);
CREATE TABLE IF NOT EXISTS personal_assistant_checks (
  scope TEXT NOT NULL, fingerprint TEXT NOT NULL, preferences_revision INTEGER NOT NULL, expires_at TEXT NOT NULL,
  PRIMARY KEY(scope,fingerprint)
);`;
export class PersonalAssistantStore {
  readonly scope: string;
  constructor(private db: ReturnType<typeof openHomeSqliteDatabase>, projectId: string, actorId: string) {
    this.scope = JSON.stringify([projectId, actorId]);
    db.exec(PERSONAL_ASSISTANT_SCHEMA);
  }
  preferences(): AssistantPreferences {
    const row = this.db.prepare("SELECT body FROM personal_assistant_preferences WHERE scope=?").get(this.scope);
    return row ? JSON.parse(String(row.body)) : structuredClone(DEFAULT_ASSISTANT_PREFERENCES);
  }
  savePreferences(value: AssistantPreferences, expected: number): AssistantPreferences {
    const next = { ...value, revision: expected + 1 };
    const result = this.db.prepare(`INSERT INTO personal_assistant_preferences(scope,revision,body) SELECT ?,?,? WHERE ?=0
      ON CONFLICT(scope) DO UPDATE SET revision=excluded.revision, body=excluded.body WHERE personal_assistant_preferences.revision=?`)
      .run(this.scope, next.revision, JSON.stringify(next), expected, expected);
    // For existing revisions, use a direct optimistic update.
    if (!result.changes && expected > 0) {
      if (!this.db.prepare("UPDATE personal_assistant_preferences SET revision=?,body=? WHERE scope=? AND revision=?")
        .run(next.revision, JSON.stringify(next), this.scope, expected).changes) throw new ActionError("assistant.conflict", "偏好已变化，请重新读取");
    } else if (!result.changes) throw new ActionError("assistant.conflict", "偏好已变化，请重新读取");
    return next;
  }
  checked(fingerprint: string, preferenceRevision: number, now: string): boolean {
    return !!this.db.prepare("SELECT 1 FROM personal_assistant_checks WHERE scope=? AND fingerprint=? AND preferences_revision=? AND expires_at>?")
      .get(this.scope, fingerprint, preferenceRevision, now);
  }
  rememberCheck(fingerprint: string, preferenceRevision: number, expiresAt: string): void {
    this.db.prepare("INSERT INTO personal_assistant_checks VALUES (?,?,?,?) ON CONFLICT(scope,fingerprint) DO UPDATE SET preferences_revision=excluded.preferences_revision,expires_at=excluded.expires_at")
      .run(this.scope, fingerprint, preferenceRevision, expiresAt);
  }
  list(): AssistantSuggestion[] {
    return this.db.prepare("SELECT body FROM personal_assistant_suggestions WHERE scope=? ORDER BY rowid DESC").all(this.scope).map(row => JSON.parse(String(row.body)));
  }
  get(id: string): AssistantSuggestion {
    const row = this.db.prepare("SELECT body FROM personal_assistant_suggestions WHERE scope=? AND id=?").get(this.scope, id);
    if (!row) throw new ActionError("assistant.missing", "这条建议不在当前项目或用户范围内");
    return JSON.parse(String(row.body));
  }
  byFingerprint(fingerprint: string): AssistantSuggestion | null {
    const row = this.db.prepare("SELECT body FROM personal_assistant_suggestions WHERE scope=? AND fingerprint=?").get(this.scope, fingerprint);
    return row ? JSON.parse(String(row.body)) : null;
  }
  add(value: Omit<AssistantSuggestion, "id" | "revision">): AssistantSuggestion {
    const suggestion: AssistantSuggestion = { ...value, id: randomUUID(), revision: 1 };
    this.db.prepare("INSERT OR IGNORE INTO personal_assistant_suggestions VALUES (?,?,?,?,?,?)")
      .run(this.scope, suggestion.id, suggestion.fingerprint, 1, suggestion.status, JSON.stringify(suggestion));
    return this.byFingerprint(value.fingerprint)!;
  }
  update(id: string, revision: number, patch: Partial<AssistantSuggestion>): AssistantSuggestion {
    const current = this.get(id);
    if (current.revision !== revision) throw new ActionError("assistant.conflict", "建议已变化，请重新读取");
    const next = { ...current, ...patch, id, fingerprint: current.fingerprint, request_id: current.request_id, revision: revision + 1 };
    if (!this.db.prepare("UPDATE personal_assistant_suggestions SET revision=?,status=?,body=? WHERE scope=? AND id=? AND revision=?")
      .run(next.revision, next.status, JSON.stringify(next), this.scope, id, revision).changes) throw new ActionError("assistant.conflict", "建议已变化，请重新读取");
    return next;
  }
}
