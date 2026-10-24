import type { PluginDatabase, PluginDatabaseReader } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { AgentSessionDecision, AgentSessionRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { CodingSessionRecord, CodingBeforeEffect } from "./store.js";
import type { CodingBeforeWrite } from "./route-entry.js";
import { codingStoreErrors } from "./store-errors.js";

export type CodingLifecycleObserved = Pick<CodingSessionRecord, "session_id" | "title" | "state" | "archived" | "goal_id" | "updated_at">;
export type CodingLifecycleDecision = { observed: CodingLifecycleObserved; previous_operation_id: string | null } & (
  { mode: "local"; runtime_id: string; operation_id: string } |
  { mode: "runtime"; binding: AgentSessionRef; decision: AgentSessionDecision }
);
/** One current decision, overwritten only by a subsequent confirmed lifecycle change. No conversation history. */
export interface CodingLifecycleRecord { archived: boolean; request: CodingLifecycleDecision; at: string; completed: boolean }

/** Object key order is not part of the confirmed original. */
export const sameLifecycleOriginal = (left: unknown, right: unknown): boolean => {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
  return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => Object.hasOwn(b, key) && sameLifecycleOriginal(a[key], b[key]));
};
const conflict = () => new ActionError("actions.conflict", "会话或当前生命周期决定已变化，请保留原请求核对");
const read = (reader: PluginDatabaseReader, projectId: string, sessionId: string): CodingLifecycleRecord | null => {
  const value = reader.get("SELECT lifecycle_json FROM coding_sessions WHERE project_id = ? AND session_id = ?", [projectId, sessionId])?.lifecycle_json;
  return typeof value === "string" ? JSON.parse(value) as CodingLifecycleRecord : null;
};

/** The same durable fact fences routes, jobs and the final business transaction. */
export const assertCodingSessionWritable = (reader: PluginDatabaseReader, projectId: string, sessionId: string): void => {
  const current = read(reader, projectId, sessionId);
  if (current && current.completed !== true) throw conflict();
};

/** Keep the caller's original authority and add admission; callers never regain an unfenced write control. */
export function codingSessionWrite(beforeWrite: CodingBeforeWrite, store: CodingSessionLifecycleStore, projectId: string, sessionId: string): CodingBeforeWrite {
  const assert_current = () => { beforeWrite.assert_current(); store.assertWritable(projectId, sessionId); };
  return Object.assign(async () => { await beforeWrite(); assert_current(); }, { assert_current,
    signal: beforeWrite.signal, original_input: beforeWrite.original_input });
}

/** Coding owns one current lifecycle original alongside its availability, over the same business transaction. */
export class CodingSessionLifecycleStore {
  constructor(private readonly db: PluginDatabase,
    private readonly session: (reader: PluginDatabaseReader, projectId: string, sessionId: string) => CodingSessionRecord,
    private readonly map: (row: Record<string, unknown>) => CodingSessionRecord) {}

  archived(projectId: string): CodingSessionRecord[] {
    return this.db.all("SELECT * FROM coding_sessions WHERE project_id = ? AND archived = 1 ORDER BY updated_at DESC, session_id", [projectId]).map(this.map);
  }

  current(projectId: string, sessionId: string): CodingLifecycleRecord | null {
    this.session(this.db, projectId, sessionId);
    return read(this.db, projectId, sessionId);
  }

  pending(projectId: string, sessionId: string): boolean {
    const current = this.current(projectId, sessionId);
    return current !== null && current.completed !== true;
  }

  assertWritable(projectId: string, sessionId: string): void {
    assertCodingSessionWritable(this.db, projectId, sessionId);
  }

  async prepare(beforeEffect: CodingBeforeEffect, projectId: string, sessionId: string, expected: CodingLifecycleRecord | null,
    next: CodingLifecycleRecord, guard: (current: CodingSessionRecord) => void): Promise<void> {
    return this.db.transaction(beforeEffect, tx => {
      guard(this.session(tx, projectId, sessionId));
      if (!sameLifecycleOriginal(read(tx, projectId, sessionId), expected)) throw conflict();
      tx.run("UPDATE coding_sessions SET lifecycle_json = ? WHERE project_id = ? AND session_id = ?", [JSON.stringify(next), projectId, sessionId]);
    });
  }

  /** The business availability and completion receipt commit together, or neither does. */
  async complete(beforeEffect: CodingBeforeEffect, projectId: string, sessionId: string, expected: CodingLifecycleRecord,
    guard: (current: CodingSessionRecord) => void): Promise<CodingSessionRecord> {
    return this.db.transaction(beforeEffect, tx => {
      const current = this.session(tx, projectId, sessionId);
      guard(current);
      if (!sameLifecycleOriginal(read(tx, projectId, sessionId), expected)) throw conflict();
      if (expected.completed) return current;
      tx.run("UPDATE coding_sessions SET archived = ?, updated_at = ?, lifecycle_json = ? WHERE project_id = ? AND session_id = ?",
        [expected.archived ? 1 : 0, expected.archived ? expected.at : current.updated_at, JSON.stringify({ ...expected, completed: true }), projectId, sessionId]);
      return this.session(tx, projectId, sessionId);
    });
  }

  async archive(beforeEffect: CodingBeforeEffect, projectId: string, sessionId: string, at: string,
    guard?: (current: CodingSessionRecord) => void, options?: { allowAlreadyArchived: true }): Promise<CodingSessionRecord> {
    return this.db.transaction(beforeEffect, tx => {
      assertCodingSessionWritable(tx, projectId, sessionId);
      const current = this.session(tx, projectId, sessionId);
      guard?.(current);
      if (current.archived) {
        if (options?.allowAlreadyArchived) return current;
        throw codingStoreErrors.session_unknown("会话已归档");
      }
      tx.run("UPDATE coding_sessions SET archived = 1, updated_at = ? WHERE project_id = ? AND session_id = ?", [at, projectId, sessionId]);
      return this.session(tx, projectId, sessionId);
    });
  }
}
